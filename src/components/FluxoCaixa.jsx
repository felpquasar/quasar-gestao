import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { fmt, today, saldoCr } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';

const FORMAS_REC = ["a_vista", "cartao", "pix", "parcelado"];
const FORMAS_PAG = ["a_vista", "cartao", "pix", "transferencia"];
const FORMA_LABEL = { a_vista: "À Vista", cartao: "Cartão", pix: "Pix", parcelado: "Parcelado", transferencia: "Transferência" };
const FORMA_COR = { a_vista: "#4caf82", cartao: "#6b9fd4", pix: "#5cb8d4", parcelado: "#e8a020", transferencia: "#b86fcf" };
const CATEGORIAS = ["estoque", "aluguel", "servicos", "impostos", "outros"];
const CAT_LABEL = { estoque: "Estoque", aluguel: "Aluguel", servicos: "Serviços", impostos: "Impostos", outros: "Outros" };
const CAT_COR = { estoque: "#ffbf00", aluguel: "#6b9fd4", servicos: "#5cb8d4", impostos: "#e05a5a", outros: "#888" };

const MESES_LABEL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const FluxoCaixa = ({ t = (k) => k, contasReceber, setContasReceber, contasPagar, setContasPagar, clientes, fornecedores, notify }) => {
  const [periodo, setPeriodo] = useState("3m");
  const [tooltip, setTooltip] = useState(null);
  const [modalEditar, setModalEditar] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const abrirEditar = (item) => {
    setEditForm({
      descricao: item.descricao || "",
      valor: String(item.valor),
      vencimento: item.data_vencimento || today(),
      forma: item.forma_pagamento || (item.tipo === "receber" ? "parcelado" : "a_vista"),
      clienteId: item.cliente_id ? String(item.cliente_id) : "",
      fornecedorId: item.fornecedor_id ? String(item.fornecedor_id) : "",
      categoria: item.categoria || "outros",
      obs: item.obs || "",
    });
    setModalEditar(item);
  };

  const salvarEdicao = async () => {
    if (!editForm.valor || !editForm.vencimento) { notify("Preencha valor e vencimento.", "error"); return; }
    setSaving(true);
    try {
      if (modalEditar.tipo === "receber") {
        const { data, error } = await supabase.from("contas_receber").update({
          descricao: editForm.descricao,
          valor: Number(editForm.valor),
          data_vencimento: editForm.vencimento,
          forma_pagamento: editForm.forma,
          cliente_id: editForm.clienteId ? Number(editForm.clienteId) : null,
          obs: editForm.obs,
        }).eq("id", modalEditar.id).select().single();
        if (error) { notify(`Erro: ${error.message}`, "error"); return; }
        setContasReceber(prev => prev.map(cr => cr.id === modalEditar.id ? data : cr));
      } else {
        const { data, error } = await supabase.from("contas_pagar").update({
          descricao: editForm.descricao,
          valor: Number(editForm.valor),
          data_vencimento: editForm.vencimento,
          forma_pagamento: editForm.forma,
          fornecedor_id: editForm.fornecedorId ? Number(editForm.fornecedorId) : null,
          categoria: editForm.categoria,
          obs: editForm.obs,
        }).eq("id", modalEditar.id).select().single();
        if (error) { notify(`Erro: ${error.message}`, "error"); return; }
        setContasPagar(prev => prev.map(cp => cp.id === modalEditar.id ? data : cp));
      }
      setModalEditar(null);
      notify("Atualizado.");
    } finally { setSaving(false); }
  };

  const { meses, totais, proximos } = useMemo(() => {
    const now = new Date();
    const nMeses = periodo === "3m" ? 3 : periodo === "6m" ? 6 : 12;

    const monthList = [];
    for (let i = nMeses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthList.push(d.toISOString().slice(0, 7));
    }

    const meses = monthList.map(ym => {
      const month = Number(ym.slice(5, 7));
      const year = Number(ym.slice(0, 4));
      const label = MESES_LABEL[month - 1] + (year !== now.getFullYear() ? ` '${String(year).slice(2)}` : "");

      const entradas = contasReceber
        .filter(cr => cr.status === "pago" && cr.data_pagamento?.startsWith(ym))
        .reduce((a, c) => a + Number(c.valor), 0);

      const saidas = contasPagar
        .filter(cp => cp.status === "pago" && cp.data_pagamento?.startsWith(ym))
        .reduce((a, c) => a + Number(c.valor), 0);

      const entProj = contasReceber
        .filter(cr => cr.status !== "pago" && cr.data_vencimento?.startsWith(ym))
        .reduce((a, c) => a + saldoCr(c), 0);

      const saiProj = contasPagar
        .filter(cp => cp.status !== "pago" && cp.data_vencimento?.startsWith(ym))
        .reduce((a, c) => a + Number(c.valor), 0);

      return { ym, label, entradas, saidas, entProj, saiProj, saldo: entradas - saidas };
    });

    const totais = {
      entradas: meses.reduce((a, m) => a + m.entradas, 0),
      saidas: meses.reduce((a, m) => a + m.saidas, 0),
      saldo: meses.reduce((a, m) => a + m.saldo, 0),
      aReceber: meses.reduce((a, m) => a + m.entProj, 0),
      aPagar: meses.reduce((a, m) => a + m.saiProj, 0),
    };
    totais.projetado = totais.saldo + totais.aReceber - totais.aPagar;

    const t = today();
    const fim = new Date(t + "T12:00:00");
    fim.setDate(fim.getDate() + 30);
    const fimStr = fim.toISOString().split("T")[0];

    const proxRec = contasReceber
      .filter(cr => cr.status !== "pago" && cr.data_vencimento >= t && cr.data_vencimento <= fimStr)
      .map(cr => ({ ...cr, tipo: "receber", entidade: clientes.find(c => c.id === cr.cliente_id)?.nome ?? "—" }));

    const proxPag = contasPagar
      .filter(cp => cp.status !== "pago" && cp.data_vencimento >= t && cp.data_vencimento <= fimStr)
      .map(cp => ({ ...cp, tipo: "pagar", entidade: fornecedores.find(f => f.id === cp.fornecedor_id)?.nome ?? "—" }));

    const proximos = [...proxRec, ...proxPag].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

    return { meses, totais, proximos };
  }, [contasReceber, contasPagar, clientes, fornecedores, periodo]);

  // Chart dimensions
  const W = 800, H = 220;
  const padL = 70, padR = 20, padT = 16, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...meses.map(m => Math.max(m.entradas + m.entProj, m.saidas + m.saiProj)), 1);
  const groupW = chartW / meses.length;
  const barW = Math.min(groupW * 0.28, 26);
  const gap = 3;
  const xGroup = (i) => padL + i * groupW + groupW / 2;
  const xEnt = (i) => xGroup(i) - barW - gap / 2;
  const xSai = (i) => xGroup(i) + gap / 2;
  const yBar = (v) => padT + chartH - (v / maxVal) * chartH;
  const hBar = (v) => Math.max((v / maxVal) * chartH, 1);

  const periodoLabel = periodo === "3m" ? "3 meses" : periodo === "6m" ? "6 meses" : "12 meses";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Fluxo de Caixa</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {[["3m", "3 Meses"], ["6m", "6 Meses"], ["12m", "12 Meses"]].map(([v, l]) => (
            <button key={v} onClick={() => setPeriodo(v)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: ".8rem",
                background: periodo === v ? "#ffbf00" : "#1a1a1a",
                color: periodo === v ? "#0a0a08" : "#888",
                fontWeight: periodo === v ? 700 : 400 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Cards realizado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        {[
          { label: "Entradas Recebidas", valor: totais.entradas, cor: "#4caf82" },
          { label: "Saídas Pagas", valor: totais.saidas, cor: "#e05a5a" },
          { label: "Saldo Realizado", valor: totais.saldo, cor: totais.saldo >= 0 ? "#4caf82" : "#e05a5a" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Realizado · {periodoLabel}</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
              {i === 2 && totais.saldo >= 0 ? "+" : ""}{fmt(s.valor)}
            </div>
            <div style={{ fontSize: ".72rem", color: "#666", marginTop: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cards projetado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { label: "A Receber (pendente)", valor: totais.aReceber, cor: "#e8a020" },
          { label: "A Pagar (pendente)", valor: totais.aPagar, cor: "#e8a020" },
          { label: "Saldo Projetado", valor: totais.projetado, cor: totais.projetado >= 0 ? "#4caf82" : "#e05a5a" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontSize: ".65rem", color: "#444", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Projetado · {periodoLabel}</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
              {i === 2 && totais.projetado >= 0 ? "+" : ""}{fmt(s.valor)}
            </div>
            <div style={{ fontSize: ".72rem", color: "#666", marginTop: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em" }}>Evolução Mensal</div>
            <div style={{ fontSize: ".95rem", fontWeight: 600, color: "#e8e4d8", marginTop: 2 }}>Entradas vs Saídas</div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[["#4caf82", "Entradas"], ["#e05a5a", "Saídas"], ["#ffffff18", "Projetado"]].map(([cor, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
                <span style={{ fontSize: ".72rem", color: "#666" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "visible" }}
          onMouseLeave={() => setTooltip(null)}>

          {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
            const y = padT + chartH - g * chartH;
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#1f1f1f" strokeWidth="1" strokeDasharray="4 4" />
                {g > 0 && (
                  <text x={padL - 8} y={y + 4} textAnchor="end" fill="#444" fontSize="9" fontFamily="'DM Mono',monospace">
                    {fmt(maxVal * g).replace("R$ ", "").replace(",00", "")}
                  </text>
                )}
              </g>
            );
          })}

          {meses.map((m, i) => {
            const entTotal = m.entradas + m.entProj;
            const saiTotal = m.saidas + m.saiProj;
            return (
              <g key={i}>
                {/* Projected entradas (light) */}
                {m.entProj > 0 && entTotal > 0 && (
                  <rect x={xEnt(i)} y={yBar(entTotal)} width={barW} height={hBar(m.entProj)} fill="#4caf8228" rx="2" />
                )}
                {/* Realized entradas */}
                {m.entradas > 0 && (
                  <rect x={xEnt(i)} y={yBar(m.entradas)} width={barW} height={hBar(m.entradas)} fill={tooltip === i ? "#5dbf90" : "#4caf82"} rx="2" />
                )}
                {/* Projected saidas (light) */}
                {m.saiProj > 0 && saiTotal > 0 && (
                  <rect x={xSai(i)} y={yBar(saiTotal)} width={barW} height={hBar(m.saiProj)} fill="#e05a5a28" rx="2" />
                )}
                {/* Realized saidas */}
                {m.saidas > 0 && (
                  <rect x={xSai(i)} y={yBar(m.saidas)} width={barW} height={hBar(m.saidas)} fill={tooltip === i ? "#e86a6a" : "#e05a5a"} rx="2" />
                )}
                {/* Month label */}
                <text x={xGroup(i)} y={H - 4} textAnchor="middle" fill={tooltip === i ? "#aaa" : "#444"} fontSize="9" fontFamily="'DM Mono',monospace">
                  {m.label}
                </text>
                {/* Hover target */}
                <rect x={padL + i * groupW} y={padT} width={groupW} height={chartH} fill="transparent"
                  onMouseEnter={() => setTooltip(i)} style={{ cursor: "crosshair" }} />
              </g>
            );
          })}
        </svg>

        {/* Tooltip inline */}
        {tooltip !== null && (() => {
          const m = meses[tooltip];
          return (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10, padding: "10px 14px", background: "#111", borderRadius: 8 }}>
              <div style={{ fontSize: ".72rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", width: "100%" }}>{m.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4caf82" }} />
                <span style={{ fontSize: ".82rem", color: "#4caf82", fontFamily: "'DM Mono',monospace" }}>{fmt(m.entradas)}</span>
                <span style={{ fontSize: ".72rem", color: "#555" }}>recebido</span>
                {m.entProj > 0 && <span style={{ fontSize: ".72rem", color: "#4caf8266" }}>+ {fmt(m.entProj)} previsto</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e05a5a" }} />
                <span style={{ fontSize: ".82rem", color: "#e05a5a", fontFamily: "'DM Mono',monospace" }}>{fmt(m.saidas)}</span>
                <span style={{ fontSize: ".72rem", color: "#555" }}>pago</span>
                {m.saiProj > 0 && <span style={{ fontSize: ".72rem", color: "#e05a5a66" }}>+ {fmt(m.saiProj)} previsto</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.saldo >= 0 ? "#4caf82" : "#e05a5a" }} />
                <span style={{ fontSize: ".82rem", color: m.saldo >= 0 ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace" }}>
                  {m.saldo >= 0 ? "+" : ""}{fmt(m.saldo)}
                </span>
                <span style={{ fontSize: ".72rem", color: "#555" }}>saldo realizado</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Próximos 30 dias */}
      <div>
        <div style={{ fontSize: ".7rem", color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".75rem" }}>
          Próximos vencimentos · 30 dias
        </div>
        {proximos.length === 0 ? (
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "#444", fontSize: ".88rem" }}>
            Nenhum vencimento nos próximos 30 dias
          </div>
        ) : (
          <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden" }}>
            {proximos.map((item, i) => {
              const isReceber = item.tipo === "receber";
              const diasFaltam = Math.ceil((new Date(item.data_vencimento + "T12:00:00") - new Date(today() + "T12:00:00")) / 86400000);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: ".85rem 1.25rem", borderBottom: i < proximos.length - 1 ? "1px solid #1a1a1a" : "none" }}>
                  <div style={{ width: 4, height: 36, borderRadius: 2, background: isReceber ? "#4caf82" : "#e05a5a", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: ".88rem", color: "#ddd", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isReceber ? (item.descricao || "Cobrança") : item.descricao}
                    </div>
                    <div style={{ fontSize: ".75rem", color: "#555", marginTop: 2 }}>
                      {isReceber ? `${t("cliente")}: ${item.entidade}` : `Fornecedor: ${item.entidade}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: ".9rem", fontWeight: 700, color: isReceber ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace" }}>
                        {isReceber ? "+" : "−"}{fmt(item.valor)}
                      </div>
                      <div style={{ fontSize: ".72rem", color: "#555", marginTop: 2, fontFamily: "'DM Mono',monospace" }}>
                        {item.data_vencimento} · {diasFaltam === 0 ? "hoje" : `em ${diasFaltam}d`}
                      </div>
                    </div>
                    <button onClick={() => abrirEditar(item)}
                      style={{ background: "#6b9fd422", border: "none", cursor: "pointer", color: "#6b9fd4", borderRadius: 6, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, fontSize: ".75rem" }}>
                      <Icon name="pencil" size={12} /> Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalEditar && (
        <Modal title={modalEditar.tipo === "receber" ? "Editar Cobrança" : "Editar Conta a Pagar"} onClose={() => setModalEditar(null)}>
          {modalEditar.tipo === "receber" ? (
            <Field label={t("cliente")}>
              <select style={inp} value={editForm.clienteId} onChange={e => setEditForm({ ...editForm, clienteId: e.target.value })}>
                <option value="">Sem {t("cliente").toLowerCase()}</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Fornecedor">
                <select style={inp} value={editForm.fornecedorId} onChange={e => setEditForm({ ...editForm, fornecedorId: e.target.value })}>
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Field>
              <Field label="Categoria">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CATEGORIAS.map(c => (
                    <button key={c} onClick={() => setEditForm({ ...editForm, categoria: c })}
                      style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${editForm.categoria === c ? CAT_COR[c] : "#333"}`, cursor: "pointer",
                        background: editForm.categoria === c ? CAT_COR[c] + "22" : "transparent",
                        color: editForm.categoria === c ? CAT_COR[c] : "#666",
                        fontSize: ".78rem", fontWeight: editForm.categoria === c ? 700 : 400 }}>
                      {CAT_LABEL[c]}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
          <Field label="Descrição">
            <input style={inp} value={editForm.descricao} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} autoFocus />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Valor (R$) *">
              <input style={inp} type="number" step=".01" min="0" value={editForm.valor} onChange={e => setEditForm({ ...editForm, valor: e.target.value })} />
            </Field>
            <Field label="Vencimento *">
              <input style={inp} type="date" value={editForm.vencimento} onChange={e => setEditForm({ ...editForm, vencimento: e.target.value })} />
            </Field>
          </div>
          <Field label="Forma de Pagamento">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(modalEditar.tipo === "receber" ? FORMAS_REC : FORMAS_PAG).map(f => (
                <button key={f} onClick={() => setEditForm({ ...editForm, forma: f })}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${editForm.forma === f ? FORMA_COR[f] : "#333"}`, cursor: "pointer",
                    background: editForm.forma === f ? FORMA_COR[f] + "22" : "transparent",
                    color: editForm.forma === f ? FORMA_COR[f] : "#666",
                    fontSize: ".78rem", fontWeight: editForm.forma === f ? 700 : 400 }}>
                  {FORMA_LABEL[f]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Observação">
            <input style={inp} value={editForm.obs} onChange={e => setEditForm({ ...editForm, obs: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModalEditar(null)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvarEdicao} disabled={saving}>
              {saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar Alterações"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FluxoCaixa;

