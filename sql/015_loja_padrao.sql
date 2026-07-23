-- =====================================================================
-- Quasar Gestão — Segmento "loja padrão" (revenda pura, sem agenda/pacote)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 007_segmentos.sql (tabela segmentos).
--
-- Loja padrão = estabelecimento que só compra produto pra revenda, sem
-- agendar horário nem vender pacote de sessão. Abas Agenda/Pacote somem
-- pra esse segmento (gating em src/App.js, feito nesta mesma sessão).
-- =====================================================================

insert into public.segmentos (id, nome, termos) values
('loja_padrao', 'Loja padrão', '{
  "profissional":  "Vendedor",
  "profissionais": "Vendedores",
  "servico":       "Produto",
  "servicos":      "Produtos",
  "atendimento":   "Venda",
  "atendimentos":  "Vendas",
  "cliente":       "Cliente",
  "clientes":      "Clientes",
  "comanda":       "Pedido",
  "pacote":        "Pacote"
}'::jsonb)
on conflict (id) do update
  set nome = excluded.nome,
      termos = excluded.termos;

-- =====================================================================
-- FIM. Onboarding (SetupTenant.jsx) já lista segmentos ativos do banco
-- dinamicamente — "Loja padrão" aparece sozinho como opção, sem mudança
-- de front nesse arquivo.
-- =====================================================================
