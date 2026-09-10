import { useState, useMemo } from 'react';
import { fmt, exportCSV } from '../lib/utils';
import { btn } from '../styles/shared';
import Icon from './ui/Icon';

const PERIODO_LABEL = { mes: "Este_Mes", semana: "7_dias", trimestre: "Trimestre", tudo: "Tudo" };

const RelatorioMargem = ({ vendas, produtos }) => {
  const [periodo, setPeriodo] = useState("mes");
  const [ordenarPor, setOrdenarPor] = useState("margem");
  const [ordenarDir, setOrdenarDir] = useState("desc");

  const agora = new Date();
  const mesAtual = agora.toISOString().slice(0, 7);
  const semanaAtras = new Date(agora - 7 * 86400000).toISOString().split("T")[0];
  const trimestre = new Date(agora - 90 * 86400000).toISOString().split("T")[0];

  const vendasFiltradas = useMemo(() => vendas.filter(v => {
    if (v.status === "cancelado") return false;
    if (periodo === "mes") return v.data?.startsWith(mesAtual);
    if (periodo === "semana") return v.data >= semanaAtras;
    if (periodo === "trimestre") return v.data >= trimestre;
    return true;
  }), [vendas, periodo, mesAtual, semanaAtras, trimestre]);

  const margens = useMemo(() => {
    const map = {};
    vendasFiltradas.forEach(v => {
      (v.venda_itens || []).forEach(it => {
        const prod = produtos.find(p => p.id === it.produto_id);
        if (!prod) return;
        if (!map[prod.id]) map[prod.id] = { nome: prod.nome, categoria: prod.categoria || "—", qtd: 0, receita: 0, custo: 0 };
        const qtd = Number(it.quantidade) || 0;
        map[prod.id].qtd += qtd;
        map[prod.id].receita += qtd * (Number(it.preco) || 0);
        map[prod.id].custo += qtd * (Number(prod.custo) || 0);
      });
    });
    return Object.values(map).map(p => ({
      ...p,
      margem: p.receita - p.custo,
      margemPct: p.receita > 0 ? ((p.receita - p.custo) / p.receita) * 100 : 0,
    })).sort((a, b) => {
      const va = a[ordenarPor], vb = b[ordenarPor];
      if (va < vb) return ordenarDir === "asc" ? -1 : 1;
      if (va > vb) return ordenarDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [vendasFiltradas, produtos, ordenarPor, ordenarDir]);

  const totais = useMemo(() => margens.reduce((a, p) => ({
    receita: a.receita + p.receita,
    custo: a.custo + p.custo,
    margem: a.margem + p.margem,
  }), { receita: 0, custo: 0, margem: 0 }), [margens]);

  const toggleOrdem = (col) => {
    if (ordenarPor === col) setOrdenarDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenarPor(col); setOrdenarDir("desc"); }
  };

  const corMargem = (pct) => pct >= 30 ? "#4caf82" : pct >= 15 ? "#e8a020" : "#e05a5a";

  const handleCSV = () => {
    const rows = [
      ["Produto", "Categoria", "Qtd Vendida", "Receita (R$)", "Custo (R$)", "Margem (R$)", "Margem (%)"],
      ...margens.map(p => [p.nome, p.categoria, p.qtd, p.receita.toFixed(2), p.custo.toFixed(2), p.margem.toFixed(2), p.margemPct.toFixed(1)]),
      ["TOTAL", "", "", totais.receita.toFixed(2), totais.custo.toFixed(2), totais.margem.toFixed(2), ""],
    ];
    exportCSV(rows, `Margem_Produto_${PERIODO_LABEL[periodo] || periodo}.csv`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Margem por Produto</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[["mes", "Este Mês"], ["semana", "7 dias"], ["trimestre", "Trimestre"], ["tudo", "Tudo"]].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${periodo === v ? "#ffbf00" : "#2a2a2a"}`, background: periodo === v ? "#ffbf0015" : "transparent", color: periodo === v ? "#ffbf00" : "#666", cursor: "pointer", fontSize: ".8rem" }}>
              {l}
            </button>
          ))}
          <button style={btn("ghost")} onClick={handleCSV} disabled={margens.length === 0}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Receita Total", val: fmt(totais.receita), cor: "#e0e0e0" },
          { label: "Custo Total", val: fmt(totais.custo), cor: "#e05a5a" },
          { label: "Margem Bruta", val: fmt(totais.margem), cor: "#4caf82" },
        ].map(({ label, val, cor }) => (
          <div key={label} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: cor, fontFamily: "'DM Mono',monospace" }}>{val}</div>
          </div>
        ))}
      </div>

      {margens.length === 0 ? (
        <div style={{ textAlign: "center", color: "#444", padding: "3rem", background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10 }}>
          Sem vendas no período selecionado.
        </div>
      ) : (
        <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem", minWidth: 640 }}>
            <thead><tr style={{ background: "#111" }}>
              {[
                { label: "Produto", col: "nome", align: "left" },
                { label: "Categoria", col: "categoria", align: "left" },
                { label: "Qtd Vendida", col: "qtd", align: "right" },
                { label: "Receita", col: "receita", align: "right" },
                { label: "Custo", col: "custo", align: "right" },
                { label: "Margem R$", col: "margem", align: "right" },
                { label: "Margem %", col: "margemPct", align: "right" },
              ].map(({ label, col, align }) => (
                <th key={col} onClick={() => toggleOrdem(col)}
                  style={{ padding: ".75rem 1rem", textAlign: align, fontSize: ".72rem", color: ordenarPor === col ? "#c9a84c" : "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                  {label}{ordenarPor === col ? (ordenarDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {margens.map((p, i) => (
                <tr key={i} style={{ borderTop: "1px solid #1f1f1f" }}>
                  <td style={{ padding: ".8rem 1rem", color: "#e0e0e0", fontWeight: 500 }}>{p.nome}</td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <span style={{ background: "#1f1f1f", color: "#888", padding: "2px 8px", borderRadius: 4, fontSize: ".75rem" }}>{p.categoria}</span>
                  </td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", fontFamily: "'DM Mono',monospace", color: "#aaa" }}>{p.qtd}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", fontFamily: "'DM Mono',monospace", color: "#e0e0e0" }}>{fmt(p.receita)}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", fontFamily: "'DM Mono',monospace", color: "#e05a5a" }}>{fmt(p.custo)}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", fontFamily: "'DM Mono',monospace", color: "#4caf82", fontWeight: 600 }}>{fmt(p.margem)}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right" }}>
                    <span style={{ background: corMargem(p.margemPct) + "22", color: corMargem(p.margemPct), borderRadius: 6, padding: "3px 10px", fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: ".82rem" }}>
                      {p.margemPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RelatorioMargem;


