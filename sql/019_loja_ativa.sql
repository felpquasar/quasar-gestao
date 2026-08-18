-- =====================================================================
-- Quasar Gestão — Switcher de loja (multi-unidade real)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run, ou
--   node scripts/run-sql.js sql/019_loja_ativa.sql
-- Idempotente: pode rodar mais de uma vez.
-- Depende de 013_clinico.sql (create_tenant 3-arg) e 006_limite_unidades.sql.
--
-- Contexto: o plano já permite dono ter >1 loja (limite_unidades_usuario),
-- mas current_tenant_id() sempre pegava a primeira via `limit 1` — sem jeito
-- de trocar. Isso introduz uma loja "ativa" por usuário (server-side, cruza
-- dispositivo) e as RPCs pro front trocar/listar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Coluna ativa em tenant_users. DEFAULT true cobre o backfill: hoje
--    todo usuário tem no máximo 1 linha, então todas nascem ativas sem
--    violar o índice único abaixo.
-- ---------------------------------------------------------------------
alter table public.tenant_users add column if not exists ativo boolean not null default true;

create unique index if not exists tenant_users_user_ativo_idx
  on public.tenant_users (user_id) where (ativo);

-- ---------------------------------------------------------------------
-- 2. current_tenant_id() passa a respeitar a loja ativa. `order by ativo
--    desc` em vez de filtro estrito — se por algum motivo nenhuma linha
--    estiver marcada ativa, ainda devolve alguma loja em vez de null.
-- ---------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id
  from public.tenant_users
  where user_id = auth.uid()
  order by ativo desc, created_at asc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 3. Limite de unidades por plano — sincroniza com LIMITES.unidades em
--    src/lib/planos.js (nucleo=1, quasar_pro=2, constelacao=5).
-- ---------------------------------------------------------------------
create or replace function public.limite_unidades(p public.plano_tipo)
returns int
language sql immutable as $$
  select case p
    when 'quasar_pro'  then 2
    when 'constelacao' then 5
    else 1                       -- nucleo
  end;
$$;

-- ---------------------------------------------------------------------
-- 4. Lista as lojas do usuário logado (dono/admin), com plano efetivo e
--    qual está ativa agora. SECURITY DEFINER: sem isso, assinaturas das
--    lojas não-ativas ficariam invisíveis pro front (RLS de `assinaturas`
--    só libera a loja ativa).
-- ---------------------------------------------------------------------
create or replace function public.minhas_lojas()
returns table (
  tenant_id uuid,
  nome      text,
  segmento  text,
  plano     text,
  ativo     boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.nome, t.segmento, coalesce(public.plano_efetivo(t.id)::text, 'nucleo'), tu.ativo
  from public.tenant_users tu
  join public.tenants t on t.id = tu.tenant_id
  where tu.user_id = auth.uid() and tu.papel = 'admin'
  order by tu.ativo desc, t.nome;
$$;

grant execute on function public.minhas_lojas() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Troca a loja ativa. Zera as outras antes de ativar a escolhida —
--    ordem importa pro índice único não disparar em estado intermediário.
-- ---------------------------------------------------------------------
create or replace function public.trocar_loja_ativa(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.tenant_users where user_id = auth.uid() and tenant_id = p_tenant_id) then
    raise exception 'você não tem acesso a essa loja';
  end if;

  update public.tenant_users set ativo = false where user_id = auth.uid() and tenant_id <> p_tenant_id;
  update public.tenant_users set ativo = true  where user_id = auth.uid() and tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.trocar_loja_ativa(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. create_tenant: a loja recém-criada vira a ativa (dono acabou de
--    criar, é natural começar usando ela). Mesma assinatura de 013_clinico.
-- ---------------------------------------------------------------------
drop function if exists public.create_tenant(text, text, text);

create or replace function public.create_tenant(
  nome_barbearia text,
  p_segmento     text default 'barbearia',
  p_sub_segmento text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  novo     uuid;
  v_qtd    int;
  v_limite int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if not exists (select 1 from public.segmentos where id = p_segmento and ativo) then
    raise exception 'segmento inválido: %', p_segmento;
  end if;

  if p_segmento = 'saude' and (p_sub_segmento is null or p_sub_segmento not in ('dentista','fisio','nutri')) then
    raise exception 'sub_segmento obrigatório e inválido para segmento saude: %', p_sub_segmento;
  end if;
  if p_segmento <> 'saude' and p_sub_segmento is not null then
    raise exception 'sub_segmento só é válido para segmento saude';
  end if;

  select count(*) into v_qtd
  from public.tenant_users
  where user_id = auth.uid() and papel = 'admin';

  select public.limite_unidades_usuario() into v_limite;

  if v_qtd >= v_limite then
    raise exception 'limite de unidades do plano atingido (% de %)', v_qtd, v_limite
      using errcode = 'check_violation';
  end if;

  insert into public.tenants (nome, segmento, sub_segmento)
  values (coalesce(nullif(trim(nome_barbearia), ''), 'Minha Barbearia'), p_segmento, p_sub_segmento)
  returning id into novo;

  update public.tenant_users set ativo = false where user_id = auth.uid();

  insert into public.tenant_users (user_id, tenant_id, papel, ativo)
  values (auth.uid(), novo, 'admin', true);

  insert into public.assinaturas (tenant_id, plano, status)
  values (novo, 'nucleo', 'ativo');

  return novo;
end;
$$;

grant execute on function public.create_tenant(text, text, text) to authenticated;

-- =====================================================================
-- FIM. Front:
--   supabase.rpc('minhas_lojas')                       -> lista pro switcher
--   supabase.rpc('trocar_loja_ativa', { p_tenant_id })  -> troca + recarregar dados
--   supabase.rpc('create_tenant', {...})                -> nova loja (já ativa)
-- =====================================================================
