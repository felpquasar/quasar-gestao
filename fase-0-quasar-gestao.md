# Quasar Gestão — Fase 0: Preparação

> **Objetivo da fase:** deixar o produto pronto pra um estranho usar sozinho.
> **Prazo:** semanas −2 a 0 (antes de qualquer teaser ou lançamento).
> **Como usar:** marque os `[ ]` conforme for fechando. Só abra a divulgação quando o critério de saída (no fim) estiver 100%.

---

## ✅ Critério de saída (Definição de Pronto)

A Fase 0 está concluída quando:

> **Uma barbearia que nunca viu o sistema consegue se cadastrar, importar os produtos e fazer a primeira venda sozinha, em menos de 10 minutos, sem te chamar.**

Se isso ainda não acontece, a fase não acabou — não importa o que já esteja "bonito".

---

## 1. Produto & técnico (o gargalo — comece por aqui)

### 1.1 Tornar o sistema multiloja
- [ ] Adicionar escopo por barbearia (`tenant_id`) nas tabelas `produtos`, `clientes`, `vendas`, `venda_itens`, `movimentos`
- [ ] Aplicar RLS no Supabase em cada tabela (cada loja enxerga só os próprios dados)
- [ ] Criar o fluxo de cadastro de nova barbearia (cria a loja + o usuário admin dela)
- [ ] Testar com 2 contas diferentes e confirmar que uma NÃO vê os dados da outra

### 1.2 Onboarding em menos de 10 minutos
- [ ] Tela de boas-vindas / setup inicial guiado (passo a passo)
- [ ] Importar produtos: CSV **ou** catálogo Quasar pré-carregado pra agilizar
- [ ] Cadastro rápido do primeiro cliente
- [ ] Registrar a primeira venda
- [ ] **Teste do cronômetro:** pedir pra alguém de fora fazer do cadastro à 1ª venda — medir o tempo, ajustar até ficar < 10 min

### 1.3 Instrumentar as métricas no sistema
- [ ] Marcar/registrar a "primeira venda" de cada loja (pro tempo de ativação)
- [ ] Conseguir contar lojas ativas (usando de verdade, não só cadastradas)
- [ ] Deixar fácil exportar/ver: nº de lojas, vendas por loja, pedidos puxados

---

## 2. Comercial & oferta (pode rodar em paralelo ao técnico)

### 2.1 Definir a regra do Núcleo grátis
- [ ] Definir o valor do **pedido mínimo mensal** de produto que destrava o Núcleo grátis
- [ ] Definir como verificar isso (manual no começo já serve)
- [ ] Escrever a regra em uma frase clara pra comunicar pro barbeiro

### 2.2 Escrever a oferta de fundador
- [ ] Definir o número de vagas e a região (ex: 10 primeiras barbearias de Codó)
- [ ] Definir o benefício (ex: 60 dias de Pro grátis)
- [ ] Definir o que acontece quando o período acaba (vira qual plano, por quanto)
- [ ] Escrever a oferta pronta pra postar/mandar

### 2.3 Escolher e convidar os betas
- [ ] Listar 3 a 5 barbearias da base atual (as mais próximas e parceiras)
- [ ] Critério: usam todo dia + dão feedback + topam aparecer em depoimento
- [ ] Escrever a mensagem de convite pro beta
- [ ] Fazer os convites e confirmar quem topou

---

## 3. Presença & material de apoio

### 3.1 Página de planos
- [ ] Página simples com os 3 planos (Núcleo / Pro / Constelação)
- [ ] CTA claro: entrar na lista de espera / acesso antecipado
- [ ] Captura do contato (nome + WhatsApp) de quem se interessar

### 3.2 Documentos básicos (LGPD)
- [ ] Termo de uso simples
- [ ] Política de privacidade básica

### 3.3 Vídeo de setup (pra mandar no WhatsApp)
- [ ] Roteiro curto (1–2 min): como cadastrar e fazer a 1ª venda
- [ ] Gravar (tela + voz)
- [ ] Salvar/encurtar o link pra mandar fácil

### 3.4 Ajustar o Instagram (perfil Quasar Barber)
- [ ] Bio deixando claro: "Sistema de gestão pra barbearia · acesso antecipado"
- [ ] Destaque fixo "Quasar Gestão"
- [ ] Link na bio apontando pra lista de espera

---

## 4. Métricas — definir o que acompanhar desde o dia 1

- [ ] **Lojas ativas** — barbearias usando de verdade
- [ ] **MRR** — receita recorrente de software no mês
- [ ] **Churn** — % de barbearias que cancelam por mês
- [ ] **Produto puxado** — pedidos de produto gerados via app
- [ ] **Tempo até 1ª venda** — quão rápido a loja usa de verdade após o cadastro
- [ ] Decidir onde registrar tudo isso (uma planilha simples já basta no começo)

---

## Ordem sugerida

1. **Primeiro:** 1.1 e 1.2 (multiloja + onboarding) — é o que trava tudo.
2. **Em paralelo:** 2.1, 2.2 e 2.3 (oferta + betas) e 4 (definir métricas).
3. **Por último:** 3 (página, docs, vídeo, Instagram) — são o material que mostra o produto já pronto.

---

## ⚠️ Regra de ouro

Não abra teaser nem lançamento antes deste checklist estar fechado.
Gerar curiosidade sem ter pra onde mandar o interessado só queima a largada.
E nada aqui pode atrapalhar o núcleo (abastecimento e relacionamento com as barbearias) — ele é a energia de tudo.

---

*Quasar Gestão · Fase 0 · v1 — a luz nasce do escuro.*
