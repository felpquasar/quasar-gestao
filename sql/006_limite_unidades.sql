-- =====================================================================
-- Quasar Gestão — Limite de unidades por plano
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run. Idempotente.
-- Depende de 001_multiloja.sql e 005_planos.sql.
--
-- Regra (doc §4.3b / §6.1 — limite "por dono"):
--   Núcleo = 1 unidade · Quasar Pro = 1 · Constelação = 3.
--   O limite do dono = o MAIOR limite entre as lojas que ele já tem.
--   (espelha LIMITES em src/lib/planos.js)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Limite de unidades de um plano (mantém em sincronia com planos.js)
-- ---------------------------------------------------------------------
create or replace function public.limite_unidades(p public.plano_tipo)
returns int
language sql immutable as $$
  select case p
    when 'constelacao' then 3
    else 1                       -- nucleo, quasar_pro
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. Limite efetivo do usuário logado = maior limite entre as lojas que
--    ele é dono (papel 'admin'). Sem loja => 1 (pode criar a primeira).
-- ---------------------------------------------------------------------
create or replace function public.limite_unidades_usuario()
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    max(public.limite_unidades(public.plano_efetivo(tu.tenant_id))),
    1
  )
  from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.papel = 'admin';
$$;

grant execute on function public.limite_unidades(public.plano_tipo) to authenticated;
grant execute on function public.limite_unidades_usuario() to authenticated;

-- ---------------------------------------------------------------------
-- 3. create_tenant: troca o bloqueio "já tem loja" por contagem vs limite.
--    (RLS não expressa "quantidade" — por isso a checagem é imperativa aqui.)
-- ---------------------------------------------------------------------
create or replace function public.create_tenant(nome_barbearia text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  novo    uuid;
  v_qtd   int;
  v_limite int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select count(*) into v_qtd
  from public.tenant_users
  where user_id = auth.uid() and papel = 'admin';

  select public.limite_unidades_usuario() into v_limite;

  if v_qtd >= v_limite then
    raise exception 'limite de unidades do plano atingido (% de %)', v_qtd, v_limite
      using errcode = 'check_violation';
  end if;

  insert into public.tenants (nome)
  values (coalesce(nullif(trim(nome_barbearia), ''), 'Minha Barbearia'))
  returning id into novo;

  insert into public.tenant_users (user_id, tenant_id, papel)
  values (auth.uid(), novo, 'admin');

  insert into public.assinaturas (tenant_id, plano, status)
  values (novo, 'nucleo', 'ativo');

  return novo;
end;
$$;

grant execute on function public.create_tenant(text) to authenticated;

-- =====================================================================
-- FIM.
--  - Núcleo/Pro: bloqueia a 2ª loja.
--  - Constelação: permite até 3 lojas para o mesmo dono.
--  Nota: o app ainda não tem switcher de loja (current_tenant_id pega 1).
--  Multi-loja real (trocar de loja ativa) é evolução futura — doc §10.
-- =====================================================================
