-- =====================================================================
-- Quasar Gestão — v2.0 — Pacotes de sessões
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 001_multiloja.sql (tenants, current_tenant_id, set_tenant_id).
--
-- Implementa arquitetura-quasar-gestao-v2.md §4.1 e §7.3.
-- Adaptações ao banco real:
--  - isolamento por `tenant_id uuid` (não `loja_id`), padrão do 001.
--  - PKs e FKs de negócio são BIGINT (clientes.id / venda_itens.id são bigint).
--  - RLS via policy `tenant_isolation` + `current_tenant_id()` (não `lojas_do_usuario`).
--  - tenant_id auto-preenchido pelo trigger `set_tenant_id` (mesmo do 001).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. pacotes — a OFERTA que a loja vende ("10 sessões — R$ 800")
-- ---------------------------------------------------------------------
create table if not exists public.pacotes (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  nome          text not null,
  qtd_sessoes   int  not null check (qtd_sessoes > 0),
  preco         numeric(10,2) not null,
  validade_dias int,                              -- null = sem validade
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. pacotes_cliente — a CARTELA comprada por um cliente (saldo)
-- ---------------------------------------------------------------------
create table if not exists public.pacotes_cliente (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  cliente_id     bigint not null references public.clientes(id),
  pacote_id      bigint not null references public.pacotes(id),
  sessoes_total  int  not null,
  sessoes_usadas int  not null default 0 check (sessoes_usadas >= 0),
  valor_pago     numeric(10,2) not null,
  data_compra    timestamptz default now(),
  data_validade  date,                            -- calculada de validade_dias na compra
  check (sessoes_usadas <= sessoes_total)
);

-- ---------------------------------------------------------------------
-- 3. Baixa na venda: item pode consumir uma sessão de um pacote
-- ---------------------------------------------------------------------
alter table public.venda_itens
  add column if not exists pacote_cliente_id bigint references public.pacotes_cliente(id);

-- ---------------------------------------------------------------------
-- 4. tenant_id auto-fill + índices + RLS (padrão do 001)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pacotes','pacotes_cliente'] loop
    -- índice do tenant (performance do RLS)
    execute format('create index if not exists %I on public.%I (tenant_id);', t || '_tenant_idx', t);
    -- trigger de auto-fill do tenant_id no insert
    execute format('drop trigger if exists set_tenant_id_trg on public.%I;', t);
    execute format('create trigger set_tenant_id_trg before insert on public.%I for each row execute function public.set_tenant_id();', t);
    -- RLS: isola por tenant
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format(
      'create policy tenant_isolation on public.%I
         using (tenant_id = public.current_tenant_id())
         with check (tenant_id = public.current_tenant_id());', t);
  end loop;
end $$;

-- índice extra: busca de cartelas por cliente
create index if not exists pacotes_cliente_cliente_idx on public.pacotes_cliente (cliente_id);

-- ---------------------------------------------------------------------
-- 5. Baixa atômica de sessão (evita corrida estourar o saldo).
--    SECURITY DEFINER, mas valida tenant_id internamente.
-- ---------------------------------------------------------------------
create or replace function public.consumir_sessao(p_pacote_cliente bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ok int;
begin
  update public.pacotes_cliente
     set sessoes_usadas = sessoes_usadas + 1
   where id = p_pacote_cliente
     and tenant_id = public.current_tenant_id()
     and sessoes_usadas < sessoes_total
     and (data_validade is null or data_validade >= current_date);
  get diagnostics v_ok = row_count;
  if v_ok = 0 then
    raise exception 'pacote sem saldo, vencido ou inexistente';
  end if;
end $$;

grant execute on function public.consumir_sessao(bigint) to authenticated;

-- =====================================================================
-- FIM. Regra financeira (não contar dinheiro 2x):
--  - COMPRA do pacote = venda normal com valor cheio + insert em pacotes_cliente.
--  - CONSUMO de sessão = venda_item com pacote_cliente_id preenchido e preco = 0.
--  Fluxo front (§7.3): rpc('consumir_sessao', {p_pacote_cliente}) ANTES de
--  gravar o venda_item; se a RPC falhar, não registra o consumo.
-- =====================================================================
