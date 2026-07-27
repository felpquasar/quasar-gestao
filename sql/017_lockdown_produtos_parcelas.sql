-- =====================================================================
-- Quasar Gestão — Fecha bypass de anon em produtos + tranca parcelas órfã
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
--
-- Achados na auditoria de isolamento (27/07/2026):
--
-- 1. produtos tinha 2 policies pro SELECT: 'tenant_isolation' (public, correta)
--    e 'public read produtos' (só role anon, qual=true). Policies do mesmo
--    comando são OR'd — a segunda bypassa a primeira, deixando QUALQUER
--    pessoa sem login ler o catálogo de produtos de TODOS os tenants
--    (nomes, categorias, preços, custo). Confirmado via grep que nenhum
--    fluxo do front (onboarding usa catálogo hardcoded em JS, não lê do
--    banco) precisa disso — a policy não tem uso legítimo, só risco.
--
-- 2. parcelas: RLS ligado mas com policy 'acesso_autenticado' (qual=true,
--    role authenticated) — qualquer usuário logado de QUALQUER tenant lia/
--    escrevia todas as linhas. Tabela sem tenant_id, 0 linhas, não
--    referenciada em nenhum supabase.from("parcelas") do front (só existe
--    como nome de campo de formulário em Compras.jsx, sem relação com a
--    tabela) — órfã, mesmo padrão das qb_*, tranca igual.
--
-- Também remove as policies "anon read qb_*" que sobraram inertes depois
-- do 016 (grants já revogados, mas a policy enganosa ficava lá).
-- =====================================================================

drop policy if exists "public read produtos" on public.produtos;
revoke select on public.produtos from anon;

drop policy if exists "acesso_autenticado" on public.parcelas;
revoke all on public.parcelas from anon;
revoke all on public.parcelas from authenticated;

drop policy if exists "anon read qb_clientes" on public.qb_clientes;
drop policy if exists "anon read qb_itens_venda" on public.qb_itens_venda;
drop policy if exists "anon read qb_produtos" on public.qb_produtos;
drop policy if exists "anon read qb_vendas" on public.qb_vendas;

-- =====================================================================
-- FIM. produtos: authenticated continua lendo/escrevendo só o próprio
-- tenant via tenant_isolation, normal. parcelas: ninguém acessa (RLS sem
-- policy = deny-all pra qualquer role que não seja o dono/service_role).
-- =====================================================================
