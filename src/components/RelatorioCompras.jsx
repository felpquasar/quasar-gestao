import { useState, useMemo } from 'react';
import { fmt, brDate, exportCSV } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';

const MESES_OPT = [
  ["00", "Todos os meses"], ["01", "Janeiro"], ["02", "Fevereiro"], ["03", "Março"],
  ["04", "Abril"], ["05", "Maio"], ["06", "Junho"], ["07", "Julho"],
  ["08", "Agosto"], ["09", "Setembro"], ["10", "Outubro"], ["11", "Novembro"], ["12", "Dezembro"],
];
const STATUS_LABEL = { pendente: "Pendente", recebido: "Recebido", cancelado: "Cancelado" };
const STATUS_COR = { pendente: "#e8a020", recebido: "#4caf82", cancelado: "#555" };

const RelatorioCompras = ({ pedidosCompra, fornecedores, produtos }) => {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState("00");

  const anos = useMemo(() => {
    const set = new Set([anoAtual]);
    pedidosCompra.forEach(p => { if (p.data_pedido) set.add(Number(p.data_pedido.slice(0, 4))); });
    return [...set].sort((a, b) => b - a);
  }, [pedidosCompra, anoAtual]);

  const filtrados = useMemo(() => pedidosCompra.filter(p => {
    if (!p.data_pedido) return false;
    if (!p.data_pedido.startsWith(String(ano))) return false;
    if (mes !== "00" && p.data_pedido.slice(5, 7) !== mes) return false;
    return true;
  }), [pedidosCompra, ano, mes]);

  const resumo = useMemo(() => {
    const semCancelados = filtrados.filter(p => p.status !== "cancelado");
    const total = semCancelados.reduce((a, p) => a + Number(p.total), 0);
    return {
      qtd: filtrados.length,
      total,
      ticket: semCancelados.length > 0 ? total / semCancelados.length : 0,
      recebido: filtrados.filter(p => p.status === "recebido").reduce((a, p) => a + Number(p.total), 0),
      pendente: filtrados.filter(p => p.status === "pendente").reduce((a, p) => a + Number(p.total), 0),
    };
  }, [filtrados]);

  const topFornecedores = useMemo(() => {
    const map = {};
    filtrados.filter(p => p.status !== "cancelado").forEach(p => {
      const id = p.fornecedor_id ?? "sem_fornecedor";
      if (!map[id]) map[id] = { id, total: 0, qtd: 0 };
      map[id].total += Number(p.total);
      map[id].qtd++;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(r => ({ ...r, nome: fornecedores.find(f => f.id === r.id)?.nome ?? "Sem fornecedor", pct: resumo.total > 0 ? r.total / resumo.total * 100 : 0 }));
  }, [filtrados, fornecedores, resumo.total]);

  const porStatus = useMemo(() => {
    const map = {};
    filtrados.forEach(p => {
      if (!map[p.status]) map[p.status] = { status: p.status, total: 0, qtd: 0 };
      map[p.status].total += Number(p.total);
      map[p.status].qtd++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtrados]);

  const totalGeral = filtrados.reduce((a, p) => a + Number(p.total), 0);

  const handleCSV = () => {
    const rows = [["Pedido", "Data", "Fornecedor", "Produto", "Qtd", "Custo Unit. (R$)", "Subtotal Item (R$)", "Total Pedido (R$)", "Status"]];
    filtrados.forEach(p => {
      const fornecedor = fornecedores.find(f => f.id === p.fornecedor_id)?.nome ?? "Sem fornecedor";
      const data = brDate(p.data_pedido);
      const itens = p.pedido_itens || [];
      if (itens.length === 0) {
        rows.push([p.id, data, fornecedor, "—", "", "", "", Number(p.total).toFixed(2), STATUS_LABEL[p.status] || p.status]);
      } else {
        itens.forEach((it, idx) => {
          const produto = produtos.find(x => x.id === it.produto_id)?.nome ?? "Produto removido";
          const subtotal = (Number(it.quantidade) * Number(it.custo_unitario)).toFixed(2);
          rows.push([
            p.id, data, fornecedor, produto, it.quantidade, Number(it.custo_unitario).toFixed(2), subtotal,
            idx === 0 ? Number(p.total).toFixed(2) : "",
            idx === 0 ? (STATUS_LABEL[p.status] || p.status) : "",
          ]);
        });
      }
    });
    exportCSV(rows, `Compras_${ano}${mes !== "00" ? "_" + mes : ""}.csv`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Relatório de Compras</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ ...inp, width: 90 }}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...inp, width: 148 }}>
            {MESES_OPT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button style={btn("ghost")} onClick={handleCSV} disabled={filtrados.length === 0}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Pedidos", valor: resumo.qtd, cor: "#ffbf00", fmtv: n => n },
          { label: "Total (não cancelado)", valor: resumo.total, cor: "#ffbf00", fmtv: fmt },
          { label: "Ticket Médio", valor: resumo.ticket, cor: "#6b9fd4", fmtv: fmt },
          { label: "Recebido", valor: resumo.recebido, cor: "#4caf82", fmtv: fmt },
          { label: "Pendente", valor: resumo.pendente, cor: "#e8a020", fmtv: fmt },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
              {s.fmtv(s.valor)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.25rem" }}>
        <div>
          <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>
            Top fornecedores · {filtrados.length} pedido{filtrados.length !== 1 ? "s" : ""} no período
          </div>
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
            {topFornecedores.length === 0 ? (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "#444", fontSize: ".88rem" }}>Nenhum pedido no período</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem" }}>
                <thead>
                  <tr style={{ background: "#111" }}>
                    {["#", "Fornecedor", "Pedidos", "Total", "%"].map((h, i) => (
                      <th key={h} style={{ padding: ".65rem 1rem", textAlign: i >= 2 ? "right" : "left", fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topFornecedores.map((f, i) => (
                    <tr key={f.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                      <td style={{ padding: ".65rem 1rem", color: "#444", fontSize: ".8rem", width: 28 }}>{i + 1}</td>
                      <td style={{ padding: ".65rem 1rem" }}>
                        <div style={{ color: "#e0e0e0", fontWeight: 500, marginBottom: 4 }}>{f.nome}</div>
                        <div style={{ background: "#1a1a1a", borderRadius: 3, height: 3, overflow: "hidden" }}>
                          <div style={{ width: `${f.pct}%`, height: "100%", background: "#ffbf0055", borderRadius: 3 }} />
                        </div>
                      </td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#888" }}>{f.qtd}</td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#ffbf00", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(f.total)}</td>
                      <td style={{ padding: ".65rem 1rem", textAlign: "right", color: "#555", fontFamily: "'DM Mono',monospace", fontSize: ".82rem" }}>{f.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>Por status</div>
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            {porStatus.length === 0 ? (
              <div style={{ color: "#444", fontSize: ".82rem" }}>Sem dados no período</div>
            ) : porStatus.map(s => {
              const pct = totalGeral > 0 ? s.total / totalGeral * 100 : 0;
              const cor = STATUS_COR[s.status] || "#888";
              return (
                <div key={s.status} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: ".82rem", color: cor, fontWeight: 500 }}>{STATUS_LABEL[s.status] || s.status}</span>
                    <span style={{ fontSize: ".78rem", color: "#888", fontFamily: "'DM Mono',monospace" }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ background: "#1a1a1a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 4, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: ".72rem", color: "#555" }}>{s.qtd} pedido{s.qtd !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: ".72rem", color: "#666", fontFamily: "'DM Mono',monospace" }}>{fmt(s.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelatorioCompras;
