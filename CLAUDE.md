# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # dev server at localhost:3000
npm run build    # production build
npm test         # run tests (interactive watch mode)
npm test -- --watchAll=false  # run tests once (CI mode)
```

## What this project is

Internal management system for **Quasar Barber**, a B2B distributor of beard and barber products. Clients are establishments (barbearias, salões, distribuidores) — not end consumers. This context matters when suggesting features.

## Architecture

**Stack:** React 19 (Create React App), Supabase (Postgres + Auth). No TypeScript, no CSS framework, no routing library.

**Navigation** is state-based: a single `aba` string in `App.js` controls which module renders. No React Router.

**State management** lives entirely in `src/hooks/useStore.js`. It loads all data once at mount via parallel Supabase queries and exposes both data and setters as props. Components receive state via props — not context or a global store. The pattern for mutations is always: update Supabase first, then update local state on success.

**Styling** is 100% inline JS objects. There are no CSS modules or styled-components. Shared primitives are in `src/styles/shared.js`:
- `inp` — standard input style object
- `btn(variant)` — returns a style object; variants are `"primary"`, `"ghost"`, `"danger"`

**UI components** in `src/components/ui/`:
- `Icon` — inline SVG. To add a new icon, add a key to the `paths` object in `Icon.jsx`.
- `Modal` — fixed overlay; accepts `wide` prop for wider content
- `Field` — label wrapper for form inputs
- `Spinner`, `Toast` — loading and notification primitives

**Utilities** (`src/lib/utils.js`):
- `fmt(v)` — formats a number as BRL currency
- `today()` — returns today as `YYYY-MM-DD`
- `addDays(date, days)` — adds days to a `YYYY-MM-DD` string

## Supabase

Connection is in `src/lib/supabase.js` using env vars `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` (anon key). The client is imported from the `@supabase/supabase-js` npm package (bundled locally — switched away from the `esm.sh` CDN import in 08/2026 because it added a 17-request waterfall on first load, hurting mobile LCP).

**Tables:** `produtos`, `clientes`, `vendas`, `venda_itens`, `movimentos`, `contas_receber`

Key relations:
- `vendas` → `venda_itens` (one-to-many, loaded with `select("*, venda_itens(*)")`)
- `vendas` → `contas_receber` via `venda_id` (auto-created when a venda is saved with `status = "pendente"`)
- `contas_receber.status` is stored as `"pendente"` or `"pago"` — `"vencido"` is computed on the frontend by comparing `data_vencimento` with `today()`

## Key conventions

- **Forma de pagamento** values: `"a_vista"`, `"cartao"`, `"pix"`, `"fiado"`
- When a `venda` is marked as paid (`marcarPago`), the corresponding `contas_receber` row must also be updated
- Overdue badge count (`qtdVencidas`) is computed in `App.js` and passed as `badge` on the nav item — it drives the red badge on the Financeiro tab
- The `Dashboard` component accepts `contasReceber` to show the overdue alert card

## Evolução: Quasar Gestão (SaaS multi-tenant)

Renomeado de "Quasar Barber" para **Quasar Gestão** em 24/06/2026 — está virando um SaaS multi-tenant para barbearias. Novidades além do descrito acima:
- Tabelas adicionais: `agendamentos`, `assinaturas`, `tenants`, `pacotes`
- RPC `create_tenant(nome_barbearia)` para onboarding de novos tenants
- Três planos de assinatura com gating de features: **núcleo**, **quasar pro**, **constelação**
- Deploy: Vercel (`quasar-gestao.vercel.app`) — push no master = deploy automático (nunca commitar/push sem comando do Felipe)
- Conta de teste do Felipe: `quasarbarber01@gmail.com`
- O Felipe testa pelo celular também — toda feature nova precisa funcionar em viewport mobile

## SQL direto no banco (scripts/run-sql.js)

Existe `scripts/run-sql.js` (pasta isolada com seu próprio `package.json`, não entra no build do CRA) que roda SQL direto no Postgres via `DATABASE_URL`, sem precisar do Felipe colar no Supabase Dashboard e devolver o resultado.

- Se `DATABASE_URL` NÃO estiver no `.env` da raiz: pedir ao Felipe para configurar (ver `SETUP-SQL-DIRETO.md`) e, até lá, seguir o fluxo manual antigo (gerar o SQL numerado, ele roda no Dashboard, confirma).
- Se `DATABASE_URL` estiver configurada: usar `node scripts/run-sql.js <arquivo.sql>` ou `node scripts/run-sql.js --sql="..."` em vez de pedir para o Felipe rodar manualmente.

## Estado da sessão

Os arquivos `contexto-compactado-*.md` em `contexto/` guardam onde cada frente de trabalho parou — ler o mais recente ao retomar ("onde paramos").
