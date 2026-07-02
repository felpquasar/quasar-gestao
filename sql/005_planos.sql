-- =====================================================================
-- Quasar Gestão — Planos (Núcleo / Quasar Pro / Constelação)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez.
-- Depende de 001_multiloja.sql (tenants, tenant_users, current_tenant_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.plano_tipo as enum ('nucleo','quasar_pro','constelacao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plano_status as enum ('ativo','trial','atrasado','cancelado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. Estado do plano (uma assinatura por loja)
-- ---------------------------------------------------------------------
create table if not exists public.assinaturas (
  tenant_id       uuid primary key references public.tenants(id) on delete cascade,
  plano           public.plano_tipo   not null default 'nucleo',
  status          public.plano_status not null default 'ativo',
  trial_expira_em timestamptz,             -- oferta de fundador (ex: 60d grátis)
  atualizada_em   timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. Plano EFETIVO: resolve trial vencido / atraso / cancelamento -> Núcleo.
--    SECURITY DEFINER evita recursão de RLS ao ler assinaturas.
-- ---------------------------------------------------------------------
create or replace function public.plano_efetivo(p_tenant uuid)
returns public.plano_tipo
language sql stable security definer set search_path = public as $$
  select case
    when a.status = 'cancelado' then 'nucleo'::public.plano_tipo
    when a.status = 'atrasado'  then 'nucleo'::public.plano_tipo
    when a.status = 'trial' and a.trial_expira_em < now() then 'nucleo'::public.plano_tipo
    else a.plano
  end
  from public.assinaturas a where a.tenant_id = p_tenant;
$$;

-- Plano efetivo do usuário logado — o front chama via supabase.rpc('current_plano').
-- Sem assinatura (ainda) => 'nucleo'.
create or replace function public.current_plano()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.plano_efetivo(public.current_tenant_id())::text, 'nucleo')
$$;

grant execute on function public.plano_efetivo(uuid) to authenticated;
grant execute on function public.current_plano() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Backfill: toda loja existente ganha assinatura Núcleo/ativo.
-- ---------------------------------------------------------------------
insert into public.assinaturas (tenant_id, plano, status)
select t.id, 'nucleo', 'ativo'
from public.tenants t
where not exists (select 1 from public.assinaturas a where a.tenant_id = t.id);

-- ---------------------------------------------------------------------
-- 4. RLS de assinaturas: a loja LÊ a própria. Mudança de plano só via
--    service_role (jobs/cobrança) — sem policy de insert/update aqui,
--    authenticated não consegue se auto-promover.
-- ---------------------------------------------------------------------
alter table public.assinaturas enable row level security;
drop policy if exists assinaturas_self on public.assinaturas;
create policy assinaturas_self on public.assinaturas
  for select using (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------
-- 5. Insights (Apriori) — único gate de PLANO no banco (diferencial premium).
--    Só lojas Constelação leem. Escrita só por job service_role.
-- ---------------------------------------------------------------------
create table if not exists public.insights_recomendacoes (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  payload    jsonb not null,
  created_at timestamptz default now()
);
create index if not exists insights_recomendacoes_tenant_idx
  on public.insights_recomendacoes (tenant_id);

alter table public.insights_recomendacoes enable row level security;
drop policy if exists insights_constelacao on public.insights_recomendacoes;
create policy insights_constelacao on public.insights_recomendacoes
  for select using (
    tenant_id = public.current_tenant_id()
    and public.plano_efetivo(tenant_id) = 'constelacao'
  );

-- ---------------------------------------------------------------------
-- 6. Cadastro de loja: nasce com assinatura Núcleo junto.
--    (Recria a function de 001 adicionando o insert de assinatura.)
-- ---------------------------------------------------------------------
create or replace function public.create_tenant(nome_barbearia text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  novo uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if exists (select 1 from public.tenant_users where user_id = auth.uid()) then
    raise exception 'usuário já vinculado a uma barbearia';
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
-- FIM. Para promover uma loja manualmente (via SQL Editor / service_role):
--   update public.assinaturas set plano='quasar_pro', status='ativo',
--          atualizada_em=now() where tenant_id = '<uuid-da-loja>';
-- =====================================================================
