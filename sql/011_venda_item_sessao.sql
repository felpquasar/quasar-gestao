-- =====================================================================
-- Quasar Gestão — v2.0 — Item de venda como consumo de sessão
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 008_pacotes.sql (coluna venda_itens.pacote_cliente_id).
--
-- Implementa arquitetura-quasar-gestao-v2.md §7.3.2:
-- um venda_item pode representar o CONSUMO de uma sessão de pacote
-- (pacote_cliente_id preenchido, preco = 0, sem produto). Para isso o
-- produto_id precisa aceitar NULL (o consumo não é a venda de um produto).
-- =====================================================================

-- Torna produto_id opcional. Só afeta linhas novas; as existentes já têm valor.
alter table public.venda_itens
  alter column produto_id drop not null;

-- Integridade: um item é OU produto OU consumo de sessão, nunca vazio nos dois.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venda_itens_produto_ou_pacote' and conrelid = 'public.venda_itens'::regclass
  ) then
    alter table public.venda_itens
      add constraint venda_itens_produto_ou_pacote
      check (produto_id is not null or pacote_cliente_id is not null);
  end if;
end $$;

-- =====================================================================
-- FIM. Após rodar, o front pode gravar venda_itens de sessão:
--   { venda_id, pacote_cliente_id, produto_id: null, quantidade: 1, preco: 0 }
-- O relatório de faturamento soma preco (item de sessão = 0, não duplica).
-- =====================================================================
