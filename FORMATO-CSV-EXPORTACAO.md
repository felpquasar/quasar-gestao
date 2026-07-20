# Formato ideal do CSV — Exportação Quasar Barber

Especificação do arquivo de vendas para importação automática no sistema de
recomendação (`seed-csv.js` → Supabase). Exportando o CSV neste formato, a
importação roda sem nenhuma limpeza manual.

---

## 1. Estrutura geral

| Item | Valor |
|---|---|
| **Encoding** | UTF-8 (sem BOM) |
| **Delimitador** | `;` (ponto-vírgula) |
| **Quebra de linha** | LF ou CRLF (ambos aceitos) |
| **Decimal** | ponto (`.`) — ex: `36.90` |

## 2. Cabeçalho (exato, nesta ordem)

```
Pedido;Data;Cliente;Produto;Qtd;Valor (R$)
```

Sem colunas extras. Não incluir Desconto, Status, Subtotal, Forma de Pagamento
ou Total da Venda — não são usados e atrapalham a leitura.

## 3. Colunas

| Coluna | Formato | Regra |
|---|---|---|
| `Pedido` | inteiro | **Único por venda.** 1 pedido = 1 cliente = 1 data. Nunca repetir o mesmo número para clientes ou datas diferentes |
| `Data` | `DD/MM/AAAA` | Mesma data em todas as linhas do mesmo pedido |
| `Cliente` | texto | Mesmo cliente sempre com a grafia idêntica |
| `Produto` | texto | Mesmo produto sempre com nome/caixa idênticos |
| `Qtd` | inteiro | Maior ou igual a 1 |
| `Valor (R$)` | decimal com ponto | Valor **unitário** do produto (não o subtotal). Ex: `36.90` |

## 4. Regras críticas

Estas regras evitam os erros que já aconteceram nas exportações anteriores.

1. **Número de pedido único.** Pedidos #34 e #48 vieram com 2 clientes no mesmo
   número — isso cria uma cesta de compra falsa no algoritmo (associa produtos
   que nunca foram comprados juntos). Cada número de pedido pertence a um único
   cliente e uma única data.

2. **Pedido com vários produtos = várias linhas.** Mesmo número de pedido, mesmo
   cliente, mesma data, mudando apenas a coluna `Produto`.

3. **Uma linha por produto.** Pedido com 3 produtos diferentes = 3 linhas.

4. **Grafia consistente.** "OLEO PARA BARBA 25M - QOD" precisa ser sempre escrito
   igual. Qualquer variação de nome ou caixa vira um produto novo no banco e
   distorce as estatísticas.

5. **Valor é unitário, não subtotal.** O sistema multiplica `Valor (R$)` por
   `Qtd` automaticamente.

## 5. Exemplo correto

```csv
Pedido;Data;Cliente;Produto;Qtd;Valor (R$)
1;29/04/2026;G Hercules da S Frazao;PASTAS ORANGE 80G - FOX FOR MEN;1;30.00
2;30/04/2026;Adelino Machado;APLICADOR DE FIBRA CAPILAR - FOX FOR MEN;1;36.98
2;30/04/2026;Adelino Machado;MAQUIAGEM CAPILAR PRETO 25G - FOX FOR MEN;1;60.00
2;30/04/2026;Adelino Machado;SPRAY FIXADOR FIBERFIX 120ML;1;35.07
3;04/05/2026;Diego Sousa;CAFE VERDE SHAMPOO 220ML - QOD;2;25.90
```

- Pedido **1**: 1 produto.
- Pedido **2**: 3 produtos (3 linhas, mesmo cliente e data).
- Pedido **3**: 1 produto com quantidade 2.

## 6. Opcional

- **`Cidade`**: se o sistema tiver, pode incluir após `Cliente`. Hoje a
  importação assume "Codó/MA" fixo. Não é obrigatório; se incluir, avise para
  ajustar o `seed-csv.js`.

---

## Checklist rápido antes de exportar

- [ ] Encoding UTF-8
- [ ] Separador `;`
- [ ] Cabeçalho exato: `Pedido;Data;Cliente;Produto;Qtd;Valor (R$)`
- [ ] Cada número de pedido com 1 só cliente e 1 só data
- [ ] Decimais com ponto (`36.90`)
- [ ] Valor unitário (não subtotal)
- [ ] Nomes de produto padronizados
- [ ] Sem colunas extras
