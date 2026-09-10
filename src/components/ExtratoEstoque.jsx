import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { today, addDays, brDate, exportCSV } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Spinner from './ui/Spinner';

const LIMITE = 1000;

// Extrato completo de movimentações de estoque — consulta direto no banco (não
// usa o `movimentos` do useStore, que carrega só os 100 mais recentes de todo
// o tenant) pra não truncar o histórico quando filtrado por produto/período.
const ExtratoEstoque = ({ produtos, notify }) => {
  const [periodo, setPeriodo] = useState("mes");
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [movimentos, setMovimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [truncado, setTruncado] = useState(false);

  const rangeData = () => {
    if (periodo === "semana") return addDays(today(), -7);
    if (periodo === "mes") return addDays(today(), -30);
    if (periodo === "trimestre") return addDays(today(), -90);
    return null; // "tudo"
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("movimentos").select("*").order("data", { ascending: false }).order("created_at", { ascending: false }).limit(LIMITE);
    const desde = rangeData();
    if (desde) q = q.gte("data", desde);
    if (produtoId) q = q.eq("produto_id", Number(produtoId));
    if (tipo !== "todos") q = q.eq("tipo", tipo);
    const { data, error } = await q;
    setLoading(false);
    if (error) { notify?.("Erro ao carregar extrato de estoque.", "error"); return; }
    setMovimentos(data || []);
    setTruncado((data || []).length >= LIMITE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, produtoId, tipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeProd = id => produtos.find(p => p.id === id)?.nome ?? "Produto removido";

  const totais = movimentos.reduce((a, m) => {
    const qtd = Number(m.quantidade) || 0;
    if (m.tipo === "entrada") a.entradas += qtd; else a.saidas += qtd;
    return a;
  }, { entradas: 0, saidas: 0 });

  const handleCSV = () => {
    const rows = [["Data", "Produto", "Tipo", "Quantidade", "Observação"]];
    movimentos.forEach(m => rows.push([brDate(m.data), nomeProd(m.produto_id), m.tipo === "entrada" ? "Entrada" : "Saída", m.quantidade, m.obs || ""]));
    exportCSV(rows, `Extrato_Estoque_${today()}.csv`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.4rem", color: "#c9a84c", margin: 0 }}>Extrato de Movimentações</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {[["semana", "7 dias"], ["mes", "30 dias"], ["trimestre", "Trimestre"], ["tudo", "Tudo"]].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${periodo === v ? "#ffbf00" : "#2a2a2a"}`, background: periodo === v ? "#ffbf0015" : "transparent", color: periodo === v ? "#ffbf00" : "#666", cursor: "pointer", fontSize: ".8rem" }}>
              {l}
            </button>
          ))}
          <button style={btn("ghost")} onClick={handleCSV} disabled={movimentos.length === 0}><Icon name="print" size={14} /> CSV</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <select value={produtoId} onChange={e => setProdutoId(e.target.value)} style={{ ...inp, width: 220 }}>
          <option value="">Todos os produtos</option>
          {[...produtos].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, width: 150 }}>
          <option value="todos">Entradas e saídas</option>
          <option value="entrada">Só entradas</option>
          <option value="saida">Só saídas</option>
        </select>
      </div>

      {truncado && (
        <div style={{ background: "#1f1a09", border: "1px solid #5a3a0a", borderRadius: 8, padding: "10px 14px", marginBottom: "1.25rem", color: "#e8a020", fontSize: ".82rem" }}>
          Mostrando só os {LIMITE} movimentos mais recentes do filtro atual — os totais e o CSV não cobrem tudo. Estreite o período ou filtre por produto pra ver o histórico completo.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "Entradas", val: `+${totais.entradas}`, cor: "#4caf82" },
          { label: "Saídas", val: `-${totais.saidas}`, cor: "#e05a5a" },
          { label: "Saldo do período", val: totais.entradas - totais.saidas, cor: "#e0e0e0" },
        ].map(({ label, val, cor }) => (
          <div key={label} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: cor, fontFamily: "'DM Mono',monospace" }}>{val}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={20} /></div>
      ) : movimentos.length === 0 ? (
        <div style={{ textAlign: "center", color: "#444", padding: "3rem", background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10 }}>
          Nenhuma movimentação no período/filtro selecionado.
        </div>
      ) : (
        <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem", minWidth: 560 }}>
            <thead><tr style={{ background: "#111" }}>
              {["Data", "Produto", "Tipo", "Qtd", "Observação"].map((h, i) => (
                <th key={h} style={{ padding: ".7rem 1rem", textAlign: i >= 2 && i <= 3 ? "right" : "left", fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {movimentos.map(m => (
                <tr key={m.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                  <td style={{ padding: ".65rem 1rem", color: "#888", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>{brDate(m.data)}</td>
                  <td style={{ padding: ".65rem 1rem", color: "#e0e0e0" }}>{nomeProd(m.produto_id)}</td>
                  <td style={{ padding: ".65rem 1rem", textAlign: "right" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: m.tipo === "entrada" ? "#4caf82" : "#e05a5a", fontSize: ".78rem", fontWeight: 600 }}>
                      <Icon name={m.tipo === "entrada" ? "up" : "down"} size={12} />{m.tipo === "entrada" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td style={{ padding: ".65rem 1rem", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: 600, color: m.tipo === "entrada" ? "#4caf82" : "#e05a5a" }}>
                    {m.tipo === "entrada" ? "+" : "-"}{m.quantidade}
                  </td>
                  <td style={{ padding: ".65rem 1rem", color: "#777", fontSize: ".82rem" }}>{m.obs || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExtratoEstoque;
