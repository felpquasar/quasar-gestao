import { useState, useMemo } from 'react';
import { fmt } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const exportCSV = (rows, filename) => {
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const RelatorioDRE = ({ contasReceber, contasPagar }) => {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);

  const anos = useMemo(() => {
    const set = new Set([anoAtual]);
    [...contasReceber, ...contasPagar].forEach(r => {
      if (r.data_pagamento) set.add(Number(r.data_pagamento.slice(0, 4)));
      if (r.data_emissao) set.add(Number(r.data_emissao.slice(0, 4)));
    });
    return [...set].sort((a, b) => b - a);
  }, [contasReceber, contasPagar, anoAtual]);

  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
    const entradas = contasReceber
      .filter(cr => cr.status === "pago" && cr.data_pagamento?.startsWith(ym))
      .reduce((a, c) => a + Number(c.valor), 0);
    const saidas = contasPagar
      .filter(cp => cp.status === "pago" && cp.data_pagamento?.startsWith(ym))
      .reduce((a, c) => a + Number(c.valor), 0);
    return { label: MESES[i], ym, entradas, saidas, resultado: entradas - saidas };
  }), [contasReceber, contasPagar, ano]);

  const totais = useMemo(() => meses.reduce(
    (a, m) => ({ entradas: a.entradas + m.entradas, saidas: a.saidas + m.saidas, resultado: a.resultado + m.resultado }),
    { entradas: 0, saidas: 0, resultado: 0 }
  ), [meses]);

  // Gráfico SVG
  const W = 780, H = 180, padL = 58, padR = 20, padT = 12, padB = 28;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxVal = Math.max(...meses.map(m => Math.max(m.entradas, m.saidas)), 1);
  const groupW = chartW / 12;
  const barW = Math.min(groupW * 0.3, 20);
  const gap = 3;
  const xEnt = i => padL + i * groupW + groupW / 2 - barW - gap / 2;
  const xSai = i => padL + i * groupW + groupW / 2 + gap / 2;
  const yBar = v => padT + chartH - (v / maxVal) * chartH;
  const hBar = v => Math.max((v / maxVal) * chartH, 1);

  // Sem linha de TOTAL no corpo: ela vira um 13º mês chamado TOTAL e dobra
  // qualquer soma feita sobre o arquivo. O total continua na tela.
  const handleCSV = () => {
    exportCSV([
      ["Mês", "Entradas (R$)", "Saídas (R$)", "Resultado (R$)"],
      ...meses.map(m => [m.label, m.entradas.toFixed(2), m.saidas.toFixed(2), m.resultado.toFixed(2)]),
    ], `DRE_${ano}.csv`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>DRE — Demonstrativo de Resultado</h2>
          <div style={{ fontSize: ".75rem", color: "#555", marginTop: 4 }}>Regime de caixa · entradas e saídas realizadas</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...inp, width: 90 }}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button style={btn("ghost")} onClick={handleCSV}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      {/* Cards resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Total Recebido", valor: totais.entradas, cor: "#4caf82", prefix: "" },
          { label: "Total Pago", valor: totais.saidas, cor: "#e05a5a", prefix: "" },
          { label: "Resultado do Ano", valor: totais.resultado, cor: totais.resultado >= 0 ? "#4caf82" : "#e05a5a", prefix: totais.resultado > 0 ? "+" : "" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.label} · {ano}</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
              {s.prefix}{fmt(s.valor)}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: 16, marginBottom: "1rem", alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em" }}>Entradas vs Saídas · {ano}</div>
          {[["#4caf82", "Entradas"], ["#e05a5a", "Saídas"]].map(([cor, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
              <span style={{ fontSize: ".72rem", color: "#666" }}>{label}</span>
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
            const y = padT + chartH - g * chartH;
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1f1f1f" strokeWidth="1" strokeDasharray="4 4" />
                {g > 0 && (
                  <text x={padL - 6} y={y + 4} textAnchor="end" fill="#444" fontSize="9" fontFamily="'DM Mono',monospace">
                    {fmt(maxVal * g).replace("R$ ", "").replace(",00", "")}
                  </text>
                )}
              </g>
            );
          })}
          {meses.map((m, i) => (
            <g key={i}>
              {m.entradas > 0 && <rect x={xEnt(i)} y={yBar(m.entradas)} width={barW} height={hBar(m.entradas)} fill="#4caf82" rx="2" />}
              {m.saidas > 0 && <rect x={xSai(i)} y={yBar(m.saidas)} width={barW} height={hBar(m.saidas)} fill="#e05a5a" rx="2" />}
              <text x={padL + i * groupW + groupW / 2} y={H - 4} textAnchor="middle" fill="#444" fontSize="9" fontFamily="'DM Mono',monospace">
                {m.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Tabela mensal */}
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
          <thead>
            <tr style={{ background: "#111" }}>
              {["Mês", "Entradas", "Saídas", "Resultado"].map((h, i) => (
                <th key={h} style={{ padding: ".75rem 1rem", textAlign: i === 0 ? "left" : "right", fontSize: ".72rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meses.map((m, i) => {
              const vazio = m.entradas === 0 && m.saidas === 0;
              return (
                <tr key={i} style={{ borderTop: "1px solid #1f1f1f", opacity: vazio ? 0.3 : 1 }}>
                  <td style={{ padding: ".75rem 1rem", color: "#e0e0e0" }}>{m.label}</td>
                  <td style={{ padding: ".75rem 1rem", textAlign: "right", color: m.entradas > 0 ? "#4caf82" : "#333", fontFamily: "'DM Mono',monospace" }}>
                    {m.entradas > 0 ? fmt(m.entradas) : "—"}
                  </td>
                  <td style={{ padding: ".75rem 1rem", textAlign: "right", color: m.saidas > 0 ? "#e05a5a" : "#333", fontFamily: "'DM Mono',monospace" }}>
                    {m.saidas > 0 ? fmt(m.saidas) : "—"}
                  </td>
                  <td style={{ padding: ".75rem 1rem", textAlign: "right", fontWeight: 600, fontFamily: "'DM Mono',monospace", color: m.resultado > 0 ? "#4caf82" : m.resultado < 0 ? "#e05a5a" : "#444" }}>
                    {vazio ? "—" : `${m.resultado > 0 ? "+" : ""}${fmt(m.resultado)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #2a2a2a", background: "#111" }}>
              <td style={{ padding: ".75rem 1rem", color: "#aaa", fontWeight: 700 }}>Total {ano}</td>
              <td style={{ padding: ".75rem 1rem", textAlign: "right", color: "#4caf82", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(totais.entradas)}</td>
              <td style={{ padding: ".75rem 1rem", textAlign: "right", color: "#e05a5a", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(totais.saidas)}</td>
              <td style={{ padding: ".75rem 1rem", textAlign: "right", fontWeight: 700, fontFamily: "'DM Mono',monospace", color: totais.resultado >= 0 ? "#4caf82" : "#e05a5a" }}>
                {totais.resultado > 0 ? "+" : ""}{fmt(totais.resultado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default RelatorioDRE;

