# Arquitetura — Quasar Gestão

**Versão:** 2.0 · 02/07/2026
**Tipo:** SaaS multi-tenant para gestão de negócios de serviço (barbearias + profissionais liberais)
**Stack:** React + Supabase (Postgres / PostgREST / Auth / RLS)

> Documento de referência técnica. Define como o sistema é estruturado: multi-tenancy, isolamento de dados, separação por planos, **multi-segmento (vocabulário configurável)**, **pacotes de sessões**, camadas e fluxos críticos.
>
> **O que mudou da v1.0 → v2.0:** o sistema deixa de ser exclusivo para barbearias e passa a atender qualquer prestador de serviço (fisioterapeutas, nutricionistas, advogados...). A mudança é **aditiva**: nenhuma tabela existente é renomeada ou reestruturada. Três peças novas entram (segmento no tenant, dicionário de termos, pacotes de sessões) e uma camada de tradução entra no front. O flywheel de produtos continua exclusivo do segmento barbearia; os demais segmentos entram como SaaS puro.

---

## 0. Princípios

1. **Um banco, tabelas compartilhadas, isolamento por RLS.** Nada de banco/schema por loja. Isolamento é **lógico** (Row Level Security), não físico.
2. **Default-deny.** Toda tabela com dado de loja tem `loja_id` + RLS ligado. Tabela sem policy = vazamento. Sem exceção.
3. **`service_role` só no servidor.** Ele ignora o RLS. Nunca no front, nunca exposto ao cliente.
4. **Gating em duas camadas** (ver §5):
   - **Segurança** (servidor/banco): isolamento entre lojas, acesso ao Insights, limites de unidade/profissional.
   - **UX/feature** (React): quais telas a loja vê conforme o plano. Como o dado é da própria loja, isso é só experiência — pode viver no front.
5. **Plano vive na loja, com status e validade** — e o que vale é o *plano efetivo* (trial vencido cai pra Núcleo sozinho).
6. **[NOVO] Núcleo genérico, vocabulário por segmento.** A estrutura de dados é neutra e serve a qualquer negócio de serviço. O que muda por segmento é a **camada de apresentação**: rótulos vêm de um dicionário (`segmentos.termos`), nunca ficam hardcoded no front. Regra prática: **nenhum texto de domínio ("barbeiro", "corte", "comanda") escrito na mão em componente React** — sempre via `useTermos()`.
7. **[NOVO] Funcionalidade nova nasce genérica.** Pacote de sessões entra pedido por fisioterapeutas, mas é modelado como recurso do sistema (barbearia pode vender "cartão 5 cortes" com a mesma estrutura). Nada de tabela ou coluna "de fisio".

---

## 1. Topologia

```
┌─────────────────────────────────────────────────────────┐
│  CLIENTE (browser)                                        │
│  React 18 + Vite · Chart.js                               │
│  - AuthContext (sessão Supabase)                          │
│  - LojaContext / usePlano (loja ativa + plano efetivo)    │
│  - useTermos (dicionário do segmento + custom)   [NOVO]   │
│  - <Gate feature=...> para UX por plano                   │
│  acessa o banco com a ANON KEY (sujeito a RLS)            │
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS (PostgREST / supabase-js)
┌───────────────▼─────────────────────────────────────────┐
│  SUPABASE                                                 │
│  Postgres + RLS  ·  Auth  ·  PostgREST API auto           │
│  - tabelas compartilhadas com loja_id                     │
│  - policies isolam por loja                               │
│  - segmentos (dicionário global, leitura pública) [NOVO]  │
└───────────────▲─────────────────────────────────────────┘
                │ SERVICE ROLE (ignora RLS) — só servidor
┌───────────────┴─────────────────────────────────────────┐
│  SERVIDOR / AGENTES (Node.js)                             │
│  - Insights (Apriori / Market Basket)                     │
│  - CRM de recompra → WhatsApp                             │
│  - DRE / relatórios pesados                               │
│  - métricas cross-loja (MRR, churn...)                    │
│  - job de expiração de trial                              │
└─────────────────────────────────────────────────────────┘
```

- **Frontend host:** Vercel `[A CONFIRMAR]` (conector já disponível).
- **Jobs/agentes:** Node.js (já existem 3 agentes conectados ao Supabase: DRE, CRM/WhatsApp, Instagram).

---

## 2. Multi-tenancy

A unidade de isolamento continua sendo a **loja** (a barbearia, a clínica, o consultório). O nome da tabela permanece `lojas` — renomear tabela em produção é risco sem ganho, já que o rótulo exibido ao usuário vem do dicionário de termos (§3), não do nome físico da tabela.

Usuários se ligam a lojas por uma tabela N:N — isso resolve de uma vez **multi-profissional** (vários usuários numa loja) e **multi-unidade** (um dono em várias lojas).

```sql
-- tenant (ganha segmento + termos customizados na v2.0)
create table lojas (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  segmento            text not null default 'barbearia' references segmentos(id),  -- [NOVO]
  termos_customizados jsonb not null default '{}'::jsonb,                          -- [NOVO]
  criada_em           timestamptz default now()
);

-- Migração para o banco existente:
-- alter table lojas
--   add column segmento text not null default 'barbearia' references segmentos(id),
--   add column termos_customizados jsonb not null default '{}'::jsonb;
-- (criar a tabela segmentos ANTES, por causa da FK — ver §3.1)

-- vínculo usuário <-> loja
create table loja_membros (
  user_id  uuid references auth.users(id) on delete cascade,
  loja_id  uuid references lojas(id) on delete cascade,
  papel    text not null default 'membro',  -- 'dono' | 'membro'
  primary key (user_id, loja_id)
);

-- helper: lojas do usuário logado.
-- SECURITY DEFINER evita recursão de RLS (a policy consulta loja_membros,
-- que também tem RLS) — padrão recomendado no Supabase.
create or replace function lojas_do_usuario()
returns setof uuid language sql security definer stable as $$
  select loja_id from loja_membros where user_id = auth.uid()
$$;
```

### Padrão de RLS (repete em TODA tabela de dado da loja)

Cada tabela de dado tem `loja_id uuid not null`, **índice** em `loja_id`, e:

```sql
alter table produtos enable row level security;

create policy "loja isola produtos" on produtos
  for all
  using      (loja_id in (select lojas_do_usuario()))
  with check (loja_id in (select lojas_do_usuario()));

create index on produtos (loja_id);
```

`using` controla o que pode **ler/atualizar/deletar**; `with check` impede **inserir/alterar** dado pra uma loja que não é sua.

---

## 3. Multi-segmento (vocabulário configurável) [NOVO]

### 3.1 Dicionário global de segmentos

Tabela **global** (não é dado de loja — é catálogo do sistema, como uma tabela de países). Funciona como glossário de tradução: as **chaves** são neutras e estáveis (é o que o código usa); os **valores** são o que aparece na tela.

```sql
create table segmentos (
  id     text primary key,          -- 'barbearia', 'fisioterapia', 'nutricao', 'advocacia'...
  nome   text not null,             -- nome de exibição do segmento
  termos jsonb not null,            -- dicionário chave neutra -> rótulo
  ativo  boolean not null default true
);

insert into segmentos (id, nome, termos) values
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
}'),
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
}');
-- Novos segmentos = novo INSERT. Zero código.
```

**Regra de resolução no front:** `termos = { ...segmento.termos, ...loja.termos_customizados }`. A customização por loja é exceção pontual (um fisio que prefere "Atendimento" em vez de "Sessão"), não caminho padrão.

**Antes de rodar a migração:** validar os termos de fisioterapia numa conversa de 30 min com um dos dois clientes piloto. O dicionário acima é hipótese, não verdade.

### 3.2 RLS do dicionário

Leitura liberada para qualquer usuário autenticado (não há dado sensível — é um glossário). Escrita **só** via `service_role` (nenhuma policy de insert/update/delete para o cliente).

```sql
alter table segmentos enable row level security;

create policy "segmentos leitura autenticada" on segmentos
  for select using (auth.role() = 'authenticated');
```

### 3.3 Camada de tradução no React

Um hook único. O `LojaContext` carrega os termos do segmento + customizações no login / troca de loja (mesmo momento em que já carrega o plano).

```jsx
// useTermos.js
import { useContext } from 'react';
import { LojaContext } from './LojaContext';

export function useTermos() {
  const { segmentoTermos, termosCustomizados } = useContext(LojaContext);
  const termos = { ...segmentoTermos, ...termosCustomizados };
  return (chave) => termos[chave] ?? chave;   // fallback: devolve a chave, nunca quebra a tela
}

// uso em qualquer componente:
const t = useTermos();
<h1>Novo {t('atendimento')}</h1>   // barbearia: "Novo Atendimento" · fisio: "Nova Sessão"
```

**Trabalho de migração do front:** varrer o código (`Ctrl+Shift+F` por "Barbeiro", "Corte", "Comanda", "Cliente"...) e substituir texto fixo por `t('chave')`. Mecânico, não arriscado: o fallback garante que chave faltante vira texto estranho, não tela quebrada.

---

## 4. Modelo de dados

Tabelas de dado da loja `[nomes a CONFIRMAR no banco atual]`: `produtos`, `clientes`, `vendas`, `venda_itens`, `movimentos`. Todas ganham `loja_id` + RLS + índice.

| Tabela | Papel | Tenant |
|---|---|---|
| `lojas` | tenant (+ `segmento`, `termos_customizados`) | — |
| `loja_membros` | usuário ↔ loja + papel | via FK |
| `segmentos` | **[NOVO]** dicionário global de vocabulário | global (leitura pública) |
| `assinaturas` | plano/status da loja | `loja_id` PK |
| `produtos` | catálogo/estoque | `loja_id` |
| `clientes` | base de clientes/pacientes | `loja_id` |
| `vendas` | cabeçalho da venda | `loja_id` |
| `venda_itens` | itens da venda (+ `pacote_cliente_id`) | `loja_id` |
| `movimentos` | entradas/saídas/financeiro | `loja_id` |
| `pacotes` | **[NOVO]** oferta de pacote ("10 sessões — R$ 800") | `loja_id` |
| `pacotes_cliente` | **[NOVO]** pacote comprado por um cliente (saldo) | `loja_id` |
| `insights_recomendacoes` | saída do Apriori (Constelação) | `loja_id` |

> Campos legados conhecidos: data = `data`, preço = `preco`, estoque = `estoque`.

### 4.1 Pacotes de sessões [NOVO]

Modelo mental: cartela de fidelidade. A **oferta** é o que a loja vende; a **cartela do cliente** é o que foi comprado e quanto resta; a **baixa** acontece na venda.

```sql
-- O que a loja oferece
create table pacotes (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references lojas(id) on delete cascade,
  nome          text not null,                    -- "Pacote 10 sessões"
  qtd_sessoes   int  not null check (qtd_sessoes > 0),
  preco         numeric(10,2) not null,
  validade_dias int,                              -- null = sem validade
  ativo         boolean not null default true
);

-- A cartela comprada por um cliente específico
create table pacotes_cliente (
  id             uuid primary key default gen_random_uuid(),
  loja_id        uuid not null references lojas(id) on delete cascade,
  cliente_id     uuid not null references clientes(id),
  pacote_id      uuid not null references pacotes(id),
  sessoes_total  int  not null,
  sessoes_usadas int  not null default 0 check (sessoes_usadas >= 0),
  valor_pago     numeric(10,2) not null,
  data_compra    timestamptz default now(),
  data_validade  date,                            -- calculada de validade_dias na compra
  check (sessoes_usadas <= sessoes_total)
);

-- A baixa: o item de venda pode consumir uma sessão de um pacote
alter table venda_itens
  add column pacote_cliente_id uuid references pacotes_cliente(id);

-- RLS + índices (padrão do §2)
alter table pacotes enable row level security;
alter table pacotes_cliente enable row level security;

create policy "loja isola pacotes" on pacotes
  for all
  using      (loja_id in (select lojas_do_usuario()))
  with check (loja_id in (select lojas_do_usuario()));

create policy "loja isola pacotes_cliente" on pacotes_cliente
  for all
  using      (loja_id in (select lojas_do_usuario()))
  with check (loja_id in (select lojas_do_usuario()));

create index on pacotes (loja_id);
create index on pacotes_cliente (loja_id);
create index on pacotes_cliente (cliente_id);
```

**Regra financeira (evita contar dinheiro duas vezes):**
- **Compra do pacote** = venda normal com o valor cheio (R$ 800 entram no caixa nesse dia) + cria a linha em `pacotes_cliente`.
- **Consumo de sessão** = `venda_item` com `pacote_cliente_id` preenchido e **`preco = 0`** (o dinheiro já entrou na compra). O relatório de faturamento soma normal — o item consumido vale zero, então não duplica.

**Baixa atômica via RPC** (evita corrida de dois lançamentos simultâneos estourarem o saldo):

```sql
create or replace function consumir_sessao(p_pacote_cliente uuid)
returns void language plpgsql security definer as $$
declare v_ok int;
begin
  update pacotes_cliente
     set sessoes_usadas = sessoes_usadas + 1
   where id = p_pacote_cliente
     and loja_id in (select lojas_do_usuario())
     and sessoes_usadas < sessoes_total
     and (data_validade is null or data_validade >= current_date);
  get diagnostics v_ok = row_count;
  if v_ok = 0 then
    raise exception 'pacote sem saldo, vencido ou inexistente';
  end if;
end $$;
```

Fluxo no front ao lançar a venda com sessão de pacote: chama `supabase.rpc('consumir_sessao', ...)` **antes** de gravar o `venda_item`; se a RPC falhar, a venda não registra o consumo.

**Fora de escopo (lista de espera, não implementar):** prontuário/evolução clínica, integração com convênio/plano de saúde, recibo para reembolso, assinatura recorrente de pacote.

---

## 5. Planos & gating

Três planos: **Núcleo**, **Quasar Pro**, **Constelação**. **Segmento e plano são eixos independentes**: um fisioterapeuta pode estar em qualquer plano. A diferença comercial é que barbearias podem ganhar o sistema via flywheel de produtos (compra ativa da Quasar Barber); os demais segmentos entram como SaaS pagante padrão — isso é regra de negócio/comercial, não regra de código.

### 5.1 Estado do plano (na loja)

```sql
create type plano_tipo   as enum ('nucleo','quasar_pro','constelacao');
create type plano_status as enum ('ativo','trial','atrasado','cancelado');

create table assinaturas (
  loja_id         uuid primary key references lojas(id) on delete cascade,
  plano           plano_tipo   not null default 'nucleo',
  status          plano_status not null default 'ativo',
  trial_expira_em timestamptz,            -- oferta de fundador (60d grátis)
  atualizada_em   timestamptz default now()
);

-- plano EFETIVO: resolve trial vencido / atraso / cancelamento -> Núcleo
create or replace function plano_efetivo(p_loja uuid)
returns plano_tipo language sql stable security definer as $$
  select case
    when a.status = 'cancelado' then 'nucleo'::plano_tipo
    when a.status = 'atrasado'  then 'nucleo'::plano_tipo
    when a.status = 'trial' and a.trial_expira_em < now() then 'nucleo'::plano_tipo
    else a.plano
  end
  from assinaturas a where a.loja_id = p_loja;
$$;
```

> A oferta de fundador para os dois fisioterapeutas piloto usa a mecânica existente: `status='trial'` + `trial_expira_em` (60–90 dias). Nenhuma estrutura nova.

### 5.2 Camada de UX (React) — fonte única de verdade

Não espalhar `if plano == 'pro'` pelo código. Um mapa central define capacidades e limites:

```js
const CAPS = {
  nucleo:      ['estoque','vendas','clientes','agenda','pacotes'],  // [NOVO] pacotes no Núcleo
  quasar_pro:  ['financeiro','crm_recompra','relatorios','descontos','multi_profissional'],
  constelacao: ['insights','multi_unidade','dashboard_consolidado'],
};
const ORDEM = ['nucleo','quasar_pro','constelacao']; // herança em cascata

const capsDo = (plano) =>
  ORDEM.slice(0, ORDEM.indexOf(plano) + 1).flatMap(p => CAPS[p]);
export const can = (plano, feature) => capsDo(plano).includes(feature);

export const LIMITES = {
  nucleo:      { unidades: 1, profissionais: 1 },
  quasar_pro:  { unidades: 1, profissionais: Infinity },
  constelacao: { unidades: 3, profissionais: Infinity },
};
```

> **Decisão:** `pacotes` entra no **Núcleo** porque é funcionalidade de entrada para o segmento saúde (sem ela, o fisio não consegue operar). Se depois fizer sentido como upsell para barbearias, a mudança é uma linha neste mapa — é exatamente para isso que ele existe.

```jsx
// mostra o cadeado, não esconde — vira motor de upsell
function Gate({ feature, children }) {
  const { plano } = usePlano();
  return can(plano, feature) ? children : <Upsell feature={feature} />;
}
// uso: <Gate feature="financeiro"><PainelFinanceiro/></Gate>
```

`usePlano()` carrega a assinatura da loja ativa uma vez (no login / troca de loja) e expõe via context — mesmo carregamento que popula o `useTermos()` (§3.3).

### 5.3 Camada de segurança (servidor) — só o que NÃO pode vazar

Apenas duas coisas precisam de blindagem real:

**a) Insights** (diferencial técnico, compute premium) — gate no RLS:

```sql
create policy "insights só constelacao" on insights_recomendacoes
  for select using (
    loja_id in (select lojas_do_usuario())
    and plano_efetivo(loja_id) = 'constelacao'
  );
```

**b) Limites** (unidades/profissionais) — checagem imperativa no servidor, no momento de criar loja ou convidar membro (RLS não expressa "quantidade" bem). Ver `criar_loja()` em §7.

> Telas como financeiro/relatorios/descontos/pacotes são **dado da própria loja** → gating só no React basta. Não poluir o RLS com regra de plano nessas tabelas.

---

## 6. Autenticação & papéis

- **Supabase Auth** para sessão. `auth.uid()` é a identidade dentro das policies.
- **Papéis** em `loja_membros.papel`: `dono` (cria loja, convida, gerencia plano) e `membro` (profissional, opera o dia a dia). Refinar com mais papéis depois, se precisar.
- **Cliente** acessa só com a **anon key** → tudo passa por RLS.
- **`service_role`** vive exclusivamente nos jobs Node.js do servidor.

---

## 7. Fluxos críticos

### 7.1 Cadastro de nova loja (com limite e segmento)

```sql
create or replace function criar_loja(p_nome text, p_segmento text default 'barbearia')
returns uuid language plpgsql security definer as $$
declare v_loja uuid; v_qtd int;
begin
  -- segmento precisa existir e estar ativo
  if not exists (select 1 from segmentos where id = p_segmento and ativo) then
    raise exception 'segmento inválido';
  end if;

  -- quantas lojas o usuário já é dono (limite simplificado da Fase 0: por dono)
  select count(*) into v_qtd
  from loja_membros where user_id = auth.uid() and papel = 'dono';

  if v_qtd >= 3 then
    raise exception 'limite de unidades do plano atingido';
  end if;

  insert into lojas(nome, segmento) values (p_nome, p_segmento) returning id into v_loja;
  insert into loja_membros(user_id, loja_id, papel) values (auth.uid(), v_loja, 'dono');
  insert into assinaturas(loja_id, plano, status) values (v_loja, 'nucleo', 'ativo');
  return v_loja;
end $$;
```

Chamada do front como RPC: `supabase.rpc('criar_loja', { p_nome, p_segmento })`. Tudo numa transação (loja + dono + assinatura nascem juntos). No onboarding, a escolha do segmento é a **primeira pergunta** — dali em diante, toda a interface já fala a língua do cliente.

### 7.2 Onboarding < 10 min (Definição de Pronto da Fase 0)

`criar_loja` (com segmento) → **importar produtos/serviços** (CSV, catálogo Quasar pré-carregado para barbearias, ou cadastro manual de tipos de sessão para saúde) → cadastrar 1º cliente → **registrar 1ª venda**. Meta: estranho faz sozinho em menos de 10 minutos — vale para o barbeiro **e** para o fisioterapeuta.

### 7.3 Venda e consumo de pacote [NOVO]

1. **Vender pacote:** venda normal (valor cheio no caixa) + `insert` em `pacotes_cliente` com `sessoes_total`, `valor_pago` e `data_validade` (se o pacote tiver `validade_dias`).
2. **Consumir sessão:** no lançamento da venda/atendimento, o front lista os pacotes com saldo do cliente (`sessoes_usadas < sessoes_total` e não vencidos). Selecionado um pacote → `rpc('consumir_sessao')` → grava `venda_item` com `pacote_cliente_id` e `preco = 0`.
3. **Tela do cliente:** exibir saldo ("7 de 10 sessões usadas") na ficha do cliente/paciente.

### 7.4 Expiração de trial (oferta de fundador)

Job Node.js diário (service_role): `update assinaturas set status='ativo', plano='nucleo' where status='trial' and trial_expira_em < now()` — ou deixa o `plano_efetivo()` resolver em leitura e o job só normaliza o registro. (A função já protege mesmo sem o job rodar.)

### 7.5 CRM de recompra → WhatsApp

Job Node.js (service_role) varre `vendas`/`clientes` cross-loja, detecta "órbita atrasada" (cliente passou do ciclo de recompra), gera deep link de WhatsApp. **Nota multi-segmento:** o job deve filtrar/parametrizar por `lojas.segmento` — o ciclo de recompra de produto faz sentido para barbearia; para saúde, o equivalente futuro é "paciente sumiu antes de terminar o pacote" (fica na lista de espera).

### 7.6 Insights (Apriori)

Job Node.js (service_role) roda Market Basket Analysis sobre `vendas`+`venda_itens` (todas as lojas, num passe), grava recomendações em `insights_recomendacoes` por `loja_id`. Exposto **só** a lojas Constelação via a policy de §5.3. **Nota multi-segmento:** excluir do cálculo os `venda_itens` de consumo de pacote (`preco = 0`) para não poluir as regras de associação.

---

## 8. Métricas (servidor, service_role)

Triviais por ser base única — query direta sem filtro de tenant:
- **Lojas ativas** (usando de verdade), **MRR**, **churn**, **produto puxado** (pedidos via app), **tempo até 1ª venda**.
- **[NOVO] Recorte por segmento** em todas: `group by lojas.segmento`. É esse número que decide quando o segmento saúde ganha vitrine própria (gatilho: 5+ lojas ativas fora de barbearia).

---

## 9. Segurança — regras de ouro

- [ ] RLS **ligado** em toda tabela com `loja_id` (incluindo `pacotes` e `pacotes_cliente`).
- [ ] `with check` em toda policy (não só `using`).
- [ ] Índice em `loja_id` em toda tabela de dado (performance do RLS).
- [ ] `segmentos`: leitura autenticada, escrita **só** service_role.
- [ ] `service_role` **nunca** no cliente.
- [ ] Testar isolamento com **2 contas** que não enxergam os dados uma da outra — **e agora também com 1 conta de segmento diferente** (fisio não vê dados de barbearia e vice-versa; termos corretos em cada uma).
- [ ] Helper de tenant, `plano_efetivo` e `consumir_sessao` como `SECURITY DEFINER` (evita recursão de RLS; a RPC ainda valida `loja_id` internamente).
- [ ] Toda tabela nova entra com `loja_id` + policy no mesmo commit.

---

## 10. Decisões arquiteturais (ADR)

- **Shared tables + `tenant_id` + RLS** (em vez de schema/banco por loja). Justificativa: Supabase é desenhado pra isso; time de 1 pessoa (migration roda 1x); o Insights precisa de dados agrupados (1 query vs ETL); painéis cross-loja triviais. Custo aceito: isolamento lógico, mitigado por RLS disciplinado.
- **[NOVO] Um sistema multi-segmento, não um fork por segmento.** Avaliada e rejeitada a alternativa de duplicar o projeto (pasta + banco novos) para fisioterapeutas. Motivo: fork duplica manutenção para sempre (todo bug corrigido duas vezes, toda feature construída duas vezes) e joga fora a infraestrutura multi-tenant já construída. O núcleo (agenda, clientes, caixa, venda) é idêntico entre segmentos; a diferença é vocabulário (resolvido pelo dicionário) + 1 feature (pacotes, modelada genérica). Revisão desta decisão só se um segmento exigir domínio incompatível (ex.: prontuário clínico com requisitos legais próprios) — aí vale discutir produto separado, nunca fork do atual.
- **[NOVO] `lojas` mantém o nome físico.** Renomear tabela em produção = risco alto, ganho zero. O rótulo visível ao usuário vem de `segmentos.termos`, não do nome da tabela.
- **[NOVO] Vocabulário em dados (`segmentos.termos` jsonb), não em código.** Novo segmento = INSERT, sem deploy. Chaves neutras estáveis no código; valores exibidos no banco. Customização por loja via `termos_customizados` (merge por cima do segmento).
- **[NOVO] Pacotes de sessões como feature genérica no Núcleo.** Nasce por demanda do segmento saúde, mas serve a qualquer segmento ("cartão 5 cortes"). Financeiro: valor entra na compra do pacote; consumo lança item a preço zero.
- **Plano na `loja`, não no usuário.** Um dono pode ter várias lojas com planos diferentes; profissionais herdam o plano da loja.
- **Mapa central `CAPS`/`LIMITES`.** Evita `if plano` espalhado; permite mudar oferta/deal custom num lugar só.
- **Gating de UX no front, segurança no servidor.** Só Insights e limites são blindados no banco.
- **[NOVO] Marketing segue nichado em barbearia.** A vitrine pública e o flywheel de produtos permanecem exclusivos do segmento barbearia. Segmento saúde entra "pela porta dos fundos" (indicação, sem página de venda) até atingir 5+ lojas ativas — só então ganha vitrine própria. Decisão comercial registrada aqui porque impacta o roadmap (não construir landing/branding multi-segmento agora).

---

## 11. Evolução futura

- **Multi-unidade em escala:** hoje a `assinaturas` é por loja e o limite de unidade é "por dono" (simplificação Fase 0). Quando o multi-unidade pegar tração, introduzir uma entidade `org` que agrupa lojas e mover a assinatura pra ela. Gancho mapeado, não implementar agora.
- **Isolamento físico:** só se aparecer cliente enterprise com exigência de compliance/backup próprio. Não é o caso no lançamento.
- **[NOVO] Segunda vitrine (segmento saúde):** gatilho = 5+ lojas ativas fora de barbearia. Aí nasce página de venda própria, sem mudança de arquitetura.
- **[NOVO] Lista de espera do segmento saúde** (anotar pedidos, responder "está no radar", não construir): prontuário/evolução clínica, convênios/planos de saúde, recibo para reembolso, lembrete de sessão por WhatsApp, assinatura recorrente de pacotes.

---

## 12. Ordem de implementação (roteiro para o Claude Code)

**Pré-requisito:** criar projeto Supabase de **staging** (segundo projeto gratuito), replicar a estrutura do banco atual (schema, sem dados reais) e apontar uma cópia local do front pra ele. Todo o roteiro abaixo roda primeiro em staging; só depois de validado, aplica no banco de produção.

1. **Migração 001 — dicionário e segmento** (§3.1, §3.2, §2): criar `segmentos` + seeds (barbearia, fisioterapia) + RLS de leitura; adicionar `segmento` e `termos_customizados` em `lojas`. *Nota de ordem: `segmentos` antes da FK em `lojas`.*
2. **Migração 002 — pacotes** (§4.1): `pacotes`, `pacotes_cliente`, coluna `pacote_cliente_id` em `venda_itens`, RLS, índices, RPC `consumir_sessao`.
3. **Migração 003 — cadastro** (§7.1): atualizar `criar_loja` com `p_segmento`.
4. **Front — camada de termos** (§3.3): `useTermos` no `LojaContext`; varrer e substituir textos fixos de domínio por `t('chave')`. Confirmar termos de fisioterapia com cliente piloto antes de fechar o seed.
5. **Front — telas de pacote** (§7.3): cadastrar pacote (CRUD simples), vender pacote pra cliente, seleção de pacote no lançamento de venda, saldo na ficha do cliente.
6. **Ajustes nos jobs** (§7.5, §7.6): CRM filtra por segmento; Apriori ignora itens `preco = 0`.
7. **Teste de aceite:** criar 1 loja barbearia + 1 loja fisioterapia em staging; validar isolamento (uma não vê a outra), termos corretos em cada interface, fluxo completo de pacote (vender → consumir → saldo → caixa sem duplicar valor).
8. **Produção:** aplicar migrações 001–003, deploy do front, cadastrar os 2 fisioterapeutas piloto com `status='trial'` + `trial_expira_em` (oferta de fundador).

**Confirmar antes de escrever policies:** nomes reais das tabelas no banco atual (§4). Toda tabela nova segue o padrão de RLS de §2.

---

> **Para o Claude Code:** este é o blueprint técnico do Quasar Gestão v2.0 (multi-segmento). Prioridade de implementação = §12 na ordem dada, começando pelo ambiente de staging. Princípios inegociáveis: §0 (especialmente 6 e 7 — nada de texto de domínio hardcoded, nada de feature "de fisio"). Mudanças são aditivas: nenhuma tabela existente é renomeada.
