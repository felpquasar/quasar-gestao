import { useState, useMemo } from 'react';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';

const csvCell = v => {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportCSV = (rows, filename) => {
  const csv = rows.map(r => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const PERIODO_DIAS = 90;
const COBRIR_DIAS = 60; // sugestão de compra cobre X dias de consumo futuro

// Cobertura em dias do estoque atual, no ritmo de venda do período. Sem venda no
// período = sem giro calculável (Infinity), não entra no ranking de risco.
const RelatorioGiroEstoque = ({ produtos, vendas }) => {
  const [ordenarPor, setOrdenarPor] = useState("cobertura");

  const linhas = useMemo(() => {
    const corte = new Date(Date.now() - PERIODO_DIAS * 86400000).toISOString().slice(0, 10);
    const vendidoPorProduto = {};
    vendas.forEach(v => {
      if (v.status === "cancelado" || !v.data || v.data < corte) return;
      (v.venda_itens || []).forEach(it => {
        vendidoPorProduto[it.produto_id] = (vendidoPorProduto[it.produto_id] || 0) + (Number(it.quantidade) || 0);
      });
    });

    return produtos.map(p => {
      const vendido = vendidoPorProduto[p.id] || 0;
      const consumoDiario = vendido / PERIODO_DIAS;
      const cobertura = consumoDiario > 0 ? p.estoque / consumoDiario : Infinity;
      const sugestaoCompra = consumoDiario > 0 ? Math.max(0, Math.ceil(consumoDiario * COBRIR_DIAS - p.estoque)) : 0;
      return { id: p.id, nome: p.nome, unidade: p.unidade || "un", estoque: p.estoque, vendido, giroMensal: consumoDiario * 30, cobertura, sugestaoCompra };
    }).sort((a, b) => {
      if (ordenarPor === "cobertura") return a.cobertura - b.cobertura;
      if (ordenarPor === "giro") return b.giroMensal - a.giroMensal;
      if (ordenarPor === "sugestao") return b.sugestaoCompra - a.sugestaoCompra;
      return a.nome.localeCompare(b.nome);
    });
  }, [produtos, vendas, ordenarPor]);

  const emRisco = linhas.filter(l => l.cobertura < 30).length;

  const handleCSV = () => {
    const rows = [["Produto", "Estoque Atual", `Vendido (${PERIODO_DIAS}d)`, "Giro Mensal", "Cobertura (dias)", "Sugestão de Compra"]];
    linhas.forEach(l => rows.push([
      l.nome, l.estoque, l.vendido, l.giroMensal.toFixed(1),
      Number.isFinite(l.cobertura) ? l.cobertura.toFixed(0) : "—", l.sugestaoCompra,
    ]));
    exportCSV(rows, `Giro_Estoque_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const corCobertura = c => !Number.isFinite(c) ? "#555" : c < 15 ? "#e05a5a" : c < 30 ? "#e8a020" : "#4caf82";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Giro & Reposição</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)} style={{ ...inp, width: 170 }}>
            <option value="cobertura">Mais urgente primeiro</option>
            <option value="giro">Maior giro</option>
            <option value="sugestao">Maior sugestão de compra</option>
            <option value="nome">Nome</option>
          </select>
          <button style={btn("ghost")} onClick={handleCSV}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Produtos", valor: linhas.length, cor: "#ffbf00" },
          { label: "Em risco de ruptura (<30d)", valor: emRisco, cor: emRisco > 0 ? "#e05a5a" : "#4caf82" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{s.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
        {linhas.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "#444", fontSize: ".88rem" }}>Sem produtos cadastrados</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
              <thead>
                <tr style={{ background: "#111" }}>
                  {["Produto", "Estoque", `Vendido (${PERIODO_DIAS}d)`, "Giro/mês", "Cobertura", "Sugestão de compra"].map((h, i) => (
                    <th key={h} style={{ padding: ".65rem 1rem", textAlign: i === 0 ? "left" : "right", fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                    <td style={{ padding: ".65rem 1rem", color: "#e0e0e0" }}>{l.nome}</td>
                    <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#888", fontFamily: "'DM Mono',monospace" }}>{l.estoque} {l.unidade}</td>
                    <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#888", fontFamily: "'DM Mono',monospace" }}>{l.vendido}</td>
                    <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#888", fontFamily: "'DM Mono',monospace" }}>{l.giroMensal.toFixed(1)}</td>
                    <td style={{ padding: ".65rem 1rem", textAlign: "right", color: corCobertura(l.cobertura), fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>
                      {Number.isFinite(l.cobertura) ? `${l.cobertura.toFixed(0)}d` : "—"}
                    </td>
                    <td style={{ padding: ".65rem 1rem", textAlign: "right", color: l.sugestaoCompra > 0 ? "#ffbf00" : "#444", fontWeight: l.sugestaoCompra > 0 ? 700 : 400, fontFamily: "'DM Mono',monospace" }}>
                      {l.sugestaoCompra > 0 ? l.sugestaoCompra : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ fontSize: ".72rem", color: "#444", marginTop: 10 }}>
        Cobertura = estoque atual ÷ ritmo médio de venda dos últimos {PERIODO_DIAS} dias. Sugestão de compra cobre os próximos {COBRIR_DIAS} dias.
      </p>
    </div>
  );
};

export default RelatorioGiroEstoque;
