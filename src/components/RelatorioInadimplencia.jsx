import { useMemo } from 'react';
import { fmt, today } from '../lib/utils';
import { btn } from '../styles/shared';
import Icon from './ui/Icon';

const diasAtraso = v => Math.floor((new Date(today() + "T12:00:00") - new Date(v + "T12:00:00")) / 86400000);

const exportCSV = (rows, filename) => {
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const RelatorioInadimplencia = ({ t = (k) => k, contasReceber, clientes }) => {
  const vencidas = useMemo(() =>
    contasReceber.filter(cr => cr.status !== "pago" && cr.data_vencimento < today())
  , [contasReceber]);

  const porCliente = useMemo(() => {
    const map = {};
    vencidas.forEach(cr => {
      if (!map[cr.cliente_id]) map[cr.cliente_id] = { id: cr.cliente_id, total: 0, qtd: 0, maxDias: 0 };
      map[cr.cliente_id].total += Number(cr.valor);
      map[cr.cliente_id].qtd++;
      const d = diasAtraso(cr.data_vencimento);
      if (d > map[cr.cliente_id].maxDias) map[cr.cliente_id].maxDias = d;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map(r => ({ ...r, nome: clientes.find(c => c.id === r.id)?.nome ?? "—" }));
  }, [vencidas, clientes]);

  const totalVencido = useMemo(() => vencidas.reduce((a, c) => a + Number(c.valor), 0), [vencidas]);
  const maxDiasGeral = useMemo(() => vencidas.length > 0 ? Math.max(...vencidas.map(c => diasAtraso(c.data_vencimento))) : 0, [vencidas]);

  const handleCSV = () => {
    exportCSV([
      [t("cliente"), "Cobranças Vencidas", "Total Vencido (R$)", "Dias Máx. de Atraso", "Severidade"],
      ...porCliente.map(c => {
        const sev = c.maxDias > 90 ? "Crítico" : c.maxDias > 30 ? "Alto" : "Baixo";
        return [c.nome, c.qtd, c.total.toFixed(2), c.maxDias, sev];
      }),
      ["TOTAL", vencidas.length, totalVencido.toFixed(2), maxDiasGeral, ""],
    ], "Inadimplencia.csv");
  };

  if (vencidas.length === 0) {
    return (
      <div>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: "0 0 1.5rem" }}>Inadimplência</h2>
        <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "4rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 10 }}>✓</div>
          <div style={{ color: "#4caf82", fontWeight: 600, fontSize: "1rem", marginBottom: 6 }}>Nenhuma inadimplência</div>
          <div style={{ color: "#555", fontSize: ".88rem" }}>Todas as cobranças estão em dia ou foram pagas.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Inadimplência</h2>
        <button style={btn("ghost")} onClick={handleCSV}><Icon name="print" size={14} /> CSV</button>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Total Vencido", valor: fmt(totalVencido), cor: "#e05a5a" },
          { label: `${t("clientes")} Inadimplentes`, valor: porCliente.length, cor: "#e8a020" },
          { label: "Cobranças Vencidas", valor: vencidas.length, cor: "#e8a020" },
          { label: "Maior Atraso", valor: `${maxDiasGeral} dias`, cor: "#e05a5a" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{s.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
          <thead>
            <tr style={{ background: "#111" }}>
              {[t("cliente"), "Cobranças", "Total Vencido", "Dias Máx.", "Severidade"].map((h, i) => (
                <th key={h} style={{ padding: ".75rem 1rem", textAlign: i >= 2 ? "right" : "left", fontSize: ".72rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porCliente.map(c => {
              const sev = c.maxDias > 90
                ? { label: "Crítico", cor: "#e05a5a" }
                : c.maxDias > 30
                  ? { label: "Alto", cor: "#e8a020" }
                  : { label: "Baixo", cor: "#ffbf00" };
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                  <td style={{ padding: ".8rem 1rem", color: "#e0e0e0", fontWeight: 500 }}>{c.nome}</td>
                  <td style={{ padding: ".8rem 1rem", color: "#888" }}>{c.qtd}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", color: "#e05a5a", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(c.total)}</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right", color: sev.cor, fontFamily: "'DM Mono',monospace" }}>{c.maxDias}d</td>
                  <td style={{ padding: ".8rem 1rem", textAlign: "right" }}>
                    <span style={{ fontSize: ".75rem", padding: "3px 10px", borderRadius: 4, background: sev.cor + "22", color: sev.cor }}>
                      {sev.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #2a2a2a", background: "#111" }}>
              <td style={{ padding: ".75rem 1rem", color: "#aaa", fontWeight: 700 }}>Total</td>
              <td style={{ padding: ".75rem 1rem", color: "#888", fontWeight: 600 }}>{vencidas.length}</td>
              <td style={{ padding: ".75rem 1rem", textAlign: "right", color: "#e05a5a", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(totalVencido)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default RelatorioInadimplencia;


