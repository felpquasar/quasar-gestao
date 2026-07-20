import { useState, useMemo } from 'react';
import { fmt } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';

const MESES_OPT = [
  ["00", "Todos os meses"], ["01", "Janeiro"], ["02", "Fevereiro"], ["03", "Março"],
  ["04", "Abril"], ["05", "Maio"], ["06", "Junho"], ["07", "Julho"],
  ["08", "Agosto"], ["09", "Setembro"], ["10", "Outubro"], ["11", "Novembro"], ["12", "Dezembro"],
];
const FORMA_LABEL = { a_vista: "À Vista", cartao: "Cartão", pix: "Pix", parcelado: "Parcelado" };
const FORMA_COR = { a_vista: "#4caf82", cartao: "#6b9fd4", pix: "#5cb8d4", parcelado: "#e8a020" };

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

const brDate = ymd => {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const RelatorioVendas = ({ t = (k) => k, vendas, clientes, produtos }) => {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState("00");

  const anos = useMemo(() => {
    const set = new Set([anoAtual]);
    vendas.forEach(v => { if (v.data) set.add(Number(v.data.slice(0, 4))); });
    return [...set].sort((a, b) => b - a);
  }, [vendas, anoAtual]);

  const filtradas = useMemo(() => vendas.filter(v => {
    if (!v.data || v.status === "cancelado") return false;
    if (!v.data.startsWith(String(ano))) return false;
    if (mes !== "00" && v.data.slice(5, 7) !== mes) return false;
    return true;
  }), [vendas, ano, mes]);

  const resumo = useMemo(() => {
    const total = filtradas.reduce((a, v) => a + Number(v.total), 0);
    return {
      qtd: filtradas.length,
      total,
      ticket: filtradas.length > 0 ? total / filtradas.length : 0,
      recebido: filtradas.filter(v => v.status === "pago").reduce((a, v) => a + Number(v.total), 0),
      pendente: filtradas.filter(v => v.status === "pendente").reduce((a, v) => a + Number(v.total), 0),
      descontos: filtradas.reduce((a, v) => a + Number(v.desconto_valor || 0), 0),
    };
  }, [filtradas]);

  const topClientes = useMemo(() => {
    const map = {};
    filtradas.forEach(v => {
      if (!map[v.cliente_id]) map[v.cliente_id] = { id: v.cliente_id, total: 0, qtd: 0 };
      map[v.cliente_id].total += Number(v.total);
      map[v.cliente_id].qtd++;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(r => ({ ...r, nome: clientes.find(c => c.id === r.id)?.nome ?? "—", pct: resumo.total > 0 ? r.total / resumo.total * 100 : 0 }));
  }, [filtradas, clientes, resumo.total]);

  const porForma = useMemo(() => {
    const map = {};
    filtradas.forEach(v => {
      const f = v.forma_pagamento || "a_vista";
      if (!map[f]) map[f] = { forma: f, total: 0, qtd: 0 };
      map[f].total += Number(v.total);
      map[f].qtd++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const handleCSV = () => {
    const rows = [["Pedido", "Data", "Cliente", "Produto", "Qtd", "Valor (R$)", "Subtotal Item (R$)", "Desconto (%)", "Total Venda (R$)", "Status", "Forma Pagamento"]];
    filtradas.forEach(v => {
      const cliente = clientes.find(c => c.id === v.cliente_id)?.nome ?? "—";
      const data = brDate(v.data);
      const itensVenda = v.venda_itens || [];
      if (itensVenda.length === 0) {
        rows.push([v.id, data, cliente, "—", "", "", "", v.desconto_pct ?? "", Number(v.total).toFixed(2), v.status, v.forma_pagamento ?? ""]);
      } else {
        itensVenda.forEach((it, idx) => {
          const produto = produtos.find(p => p.id === it.produto_id)?.nome ?? "Produto removido";
          const subtotalItem = (Number(it.quantidade) * Number(it.preco)).toFixed(2);
          rows.push([
            v.id, data, cliente, produto,
            it.quantidade, Number(it.preco).toFixed(2), subtotalItem,
            idx === 0 ? (v.desconto_pct ?? "") : "",
            idx === 0 ? Number(v.total).toFixed(2) : "",
            idx === 0 ? v.status : "",
            idx === 0 ? (v.forma_pagamento ?? "") : "",
          ]);
        });
      }
    });
    exportCSV(rows, `Pedidos_${ano}${mes !== "00" ? "_" + mes : ""}.csv`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Análise de Vendas</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...inp, width: 90 }}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...inp, width: 148 }}>
            {MESES_OPT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button style={btn("ghost")} onClick={handleCSV}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Vendas", valor: resumo.qtd, cor: "#ffbf00", fmt: n => n },
          { label: "Receita Bruta", valor: resumo.total, cor: "#ffbf00", fmt },
          { label: "Ticket Médio", valor: resumo.ticket, cor: "#6b9fd4", fmt },
          { label: "Recebido", valor: resumo.recebido, cor: "#4caf82", fmt },
          { label: "A Receber", valor: resumo.pendente, cor: "#e8a020", fmt },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
              {s.fmt(s.valor)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem" }}>
        {/* Top clientes */}
        <div>
          <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>
            Top {t("clientes").toLowerCase()} · {filtradas.length} venda{filtradas.length !== 1 ? "s" : ""} no período
          </div>
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
            {topClientes.length === 0 ? (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "#444", fontSize: ".88rem" }}>Nenhuma venda no período</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
                <thead>
                  <tr style={{ background: "#111" }}>
                    {["#", t("cliente"), "Pedidos", "Total", "%"].map((h, i) => (
                      <th key={h} style={{ padding: ".65rem 1rem", textAlign: i >= 2 ? "right" : "left", fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topClientes.map((c, i) => (
                    <tr key={c.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                      <td style={{ padding: ".65rem 1rem", color: "#444", fontSize: ".8rem", width: 28 }}>{i + 1}</td>
                      <td style={{ padding: ".65rem 1rem" }}>
                        <div style={{ color: "#e0e0e0", fontWeight: 500, marginBottom: 4 }}>{c.nome}</div>
                        <div style={{ background: "#1a1a1a", borderRadius: 3, height: 3, overflow: "hidden" }}>
                          <div style={{ width: `${c.pct}%`, height: "100%", background: "#ffbf0055", borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#888" }}>{c.qtd}</td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#ffbf00", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(c.total)}</td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#555", fontFamily: "'DM Mono',monospace", fontSize: ".82rem" }}>{c.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Por forma de pagamento */}
        <div>
          <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>Por forma de pagamento</div>
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            {porForma.length === 0 ? (
              <div style={{ color: "#444", fontSize: ".82rem" }}>Sem dados no período</div>
            ) : porForma.map(f => {
              const pct = resumo.total > 0 ? f.total / resumo.total * 100 : 0;
              const cor = FORMA_COR[f.forma] || "#888";
              return (
                <div key={f.forma} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: ".82rem", color: cor, fontWeight: 500 }}>{FORMA_LABEL[f.forma] || f.forma}</span>
                    <span style={{ fontSize: ".78rem", color: "#888", fontFamily: "'DM Mono',monospace" }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ background: "#1a1a1a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 4, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: ".72rem", color: "#555" }}>{f.qtd} venda{f.qtd !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: ".72rem", color: "#666", fontFamily: "'DM Mono',monospace" }}>{fmt(f.total)}</span>
                  </div>
                </div>
              );
            })}
            {resumo.descontos > 0 && (
              <div style={{ borderTop: "1px solid #1f1f1f", paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: ".72rem", color: "#555", marginBottom: 2 }}>Total em descontos</div>
                <div style={{ fontSize: ".9rem", color: "#e8a020", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
                  − {fmt(resumo.descontos)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelatorioVendas;

