-- =====================================================================
-- Quasar Gestão — Tranca tabelas qb_* (dados pro job externo de BI/Apriori)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
--
-- Achado na auditoria de isolamento (27/07/2026): qb_clientes, qb_produtos,
-- qb_vendas, qb_itens_venda tinham RLS desligado e anon/authenticated com
-- acesso livre (anon com SELECT, authenticated com SELECT/INSERT/UPDATE/
-- DELETE) — qualquer um com a chave pública do site lia nome de loja,
-- cidade, vendas e valores de TODOS os tenants sem logar. qb_regras_associacao
-- tinha o mesmo problema pra authenticated (sem SELECT pra anon).
--
-- Nenhuma dessas tabelas tem tenant_id (são snapshot achatado pro job de
-- Apriori/CRM fora do repo) e o front nunca as referencia — confirmado via
-- grep em src/. O job externo deve gravar com service_role, que ignora RLS
-- e grants, então travar aqui não quebra nada legítimo.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['qb_clientes','qb_produtos','qb_vendas','qb_itens_venda','qb_regras_associacao'] loop
    execute format('revoke all on public.%I from anon;', t);
    execute format('revoke all on public.%I from authenticated;', t);
    execute format('alter table public.%I enable row level security;', t);
    -- sem policy nenhuma = ninguém além de service_role (que ignora RLS) acessa.
  end loop;
end $$;

-- =====================================================================
-- FIM. Se o job externo precisar ler/escrever via anon/authenticated (não
-- deveria, mas se precisar), criar policy explícita aqui em vez de reabrir
-- grant geral.
-- =====================================================================
