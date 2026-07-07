-- =====================================================================
-- Quasar Gestão — Agenda (agendamentos) — plano Núcleo (base)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 001_multiloja.sql (tenants, current_tenant_id, set_tenant_id)
-- e de clientes (bigint id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. agendamentos — horário marcado de um atendimento
--    cliente_id null => avulso/walk-in (usa cliente_nome como rótulo).
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  cliente_id   bigint references public.clientes(id) on delete set null,
  cliente_nome text,                              -- fallback p/ avulso (sem cadastro)
  servico      text,
  data         date not null,
  hora         time not null,
  duracao_min  int  not null default 30 check (duracao_min > 0),
  status       text not null default 'agendado'
               check (status in ('agendado','confirmado','concluido','cancelado','faltou')),
  obs          text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. tenant_id auto-fill + índices + RLS (padrão do 001/008)
-- ---------------------------------------------------------------------
create index if not exists agendamentos_tenant_idx on public.agendamentos (tenant_id);
create index if not exists agendamentos_data_idx    on public.agendamentos (tenant_id, data);

drop trigger if exists set_tenant_id_trg on public.agendamentos;
create trigger set_tenant_id_trg before insert on public.agendamentos
  for each row execute function public.set_tenant_id();

alter table public.agendamentos enable row level security;
drop policy if exists tenant_isolation on public.agendamentos;
create policy tenant_isolation on public.agendamentos
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- =====================================================================
-- FIM.
-- =====================================================================
