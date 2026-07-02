-- =====================================================================
-- Quasar Gestão — v2.0 — Multi-segmento (dicionário de vocabulário)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 001_multiloja.sql (tenants, current_tenant_id).
--
-- Implementa arquitetura-quasar-gestao-v2.md §3 (dicionário) e §2 (segmento
-- no tenant). Nomes adaptados ao banco real: a tabela de loja é `tenants`
-- (não `lojas`) — ver mapa em §4 do doc ("[nomes a CONFIRMAR]").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dicionário global de segmentos (catálogo do sistema, NÃO dado de loja)
--    Chaves neutras/estáveis = o que o código usa.
--    Valores = o rótulo exibido na tela.
-- ---------------------------------------------------------------------
create table if not exists public.segmentos (
  id     text primary key,          -- 'barbearia', 'fisioterapia', ...
  nome   text not null,             -- nome de exibição do segmento
  termos jsonb not null,            -- dicionário chave neutra -> rótulo
  ativo  boolean not null default true
);

-- ---------------------------------------------------------------------
-- 2. Seeds. `on conflict do update` mantém idempotência e permite ajustar
--    os termos rodando o arquivo de novo.
--    NOTA: termos de fisioterapia são HIPÓTESE (doc §3.1) — validar com
--    cliente piloto antes de considerar fechado.
-- ---------------------------------------------------------------------
insert into public.segmentos (id, nome, termos) values
('barbearia', 'Barbearia', '{
  "profissional":   "Barbeiro",
  "profissionais":  "Barbeiros",
  "servico":        "Serviço",
  "servicos":       "Serviços",
  "atendimento":    "Atendimento",
  "atendimentos":   "Atendimentos",
  "cliente":        "Cliente",
  "clientes":       "Clientes",
  "comanda":        "Comanda",
  "pacote":         "Pacote"
}'::jsonb),
('fisioterapia', 'Fisioterapia', '{
  "profissional":   "Fisioterapeuta",
  "profissionais":  "Fisioterapeutas",
  "servico":        "Tipo de sessão",
  "servicos":       "Tipos de sessão",
  "atendimento":    "Sessão",
  "atendimentos":   "Sessões",
  "cliente":        "Paciente",
  "clientes":       "Pacientes",
  "comanda":        "Ficha de atendimento",
  "pacote":         "Pacote de sessões"
}'::jsonb)
on conflict (id) do update
  set nome = excluded.nome,
      termos = excluded.termos;

-- ---------------------------------------------------------------------
-- 3. RLS do dicionário: leitura para qualquer usuário autenticado
--    (é glossário, sem dado sensível). Escrita só via service_role
--    (nenhuma policy de insert/update/delete para o cliente).
-- ---------------------------------------------------------------------
alter table public.segmentos enable row level security;
drop policy if exists segmentos_leitura_autenticada on public.segmentos;
create policy segmentos_leitura_autenticada on public.segmentos
  for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 4. Segmento + termos customizados no tenant (loja).
--    `segmento` referencia o dicionário; default 'barbearia' cobre as
--    lojas existentes. `termos_customizados` é exceção pontual por loja
--    (merge por cima do segmento no front — doc §3.1).
--    A FK exige que os seeds acima já existam (rodam antes, no mesmo arquivo).
-- ---------------------------------------------------------------------
alter table public.tenants
  add column if not exists segmento text not null default 'barbearia';

alter table public.tenants
  add column if not exists termos_customizados jsonb not null default '{}'::jsonb;

-- Backfill defensivo: qualquer tenant sem segmento vira 'barbearia'
update public.tenants set segmento = 'barbearia' where segmento is null;

-- FK só depois do backfill (add constraint if not exists via catálogo)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_segmento_fkey' and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_segmento_fkey
      foreign key (segmento) references public.segmentos(id);
  end if;
end $$;

-- =====================================================================
-- FIM. Após rodar:
--  - segmentos disponível para leitura no front (supabase.from('segmentos')).
--  - todo tenant existente fica com segmento='barbearia'.
--  - próxima migração (008): pacotes. (009): create_tenant com p_segmento.
-- =====================================================================
