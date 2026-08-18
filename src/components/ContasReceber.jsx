import { useState, useMemo } from 'react';
import EmptyState from './ui/EmptyState';
import { useMobile } from '../hooks/useMobile';
import { supabase } from '../lib/supabase';
import { fmt, today } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';
import Confirm from './ui/Confirm';

const FORMAS = ["a_vista", "cartao", "pix", "parcelado"];
const FORMA_LABEL = { a_vista: "À Vista", cartao: "Cartão", pix: "Pix", parcelado: "Parcelado" };
const FORMA_COR = { a_vista: "#4caf82", cartao: "#6b9fd4", pix: "#5cb8d4", parcelado: "#e8a020" };
const STATUS_COR = { pago: "#4caf82", pendente: "#e8a020", vencido: "#e05a5a" };
const STATUS_LABEL = { pago: "Pago", pendente: "Pendente", vencido: "Vencido" };

const statusReal = (cr) => {
  if (cr.status === "pago") return "pago";
  if (cr.data_vencimento < today()) return "vencido";
  return "pendente";
};

const diasAtraso = (vencimento) =>
  Math.floor((new Date(today() + "T12:00:00") - new Date(vencimento + "T12:00:00")) / 86400000);

const saldoCr = (cr) => Math.max(0, Number(cr.valor) - Number(cr.valor_pago || 0));

const ContasReceber = ({ t = (k) => k, contasReceber, setContasReceber, clientes, vendas, setVendas, notify }) => {
  const isMobile = useMobile();
  const [filtro, setFiltro] = useState("todos");
  const [modalNova, setModalNova] = useState(false);
  const [modalPagar, setModalPagar] = useState(null);
  const [modalEditar, setModalEditar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ clienteId: "", descricao: "", valor: "", forma: "parcelado", vencimento: today(), obs: "" });
  const [pagarForm, setPagarForm] = useState({ forma: "pix", data: today(), valorParcial: "" });
  const [editForm, setEditForm] = useState({});
  const [ordenarPor, setOrdenarPor] = useState("vencimento");
  const [ordenarDir, setOrdenarDir] = useState("asc");
  const [confirmState, setConfirmState] = useState(null);

  const toggleOrdem = (col) => {
    if (ordenarPor === col) setOrdenarDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenarPor(col); setOrdenarDir("asc"); }
  };

  const lista = useMemo(() => {
    return contasReceber
      .map(cr => ({ ...cr, _status: statusReal(cr) }))
      .filter(cr => filtro === "todos" || cr._status === filtro)
      .sort((a, b) => {
        let va, vb;
        if (ordenarPor === "vencimento") {
          if (a._status === "vencido" && b._status !== "vencido") return ordenarDir === "asc" ? -1 : 1;
          if (b._status === "vencido" && a._status !== "vencido") return ordenarDir === "asc" ? 1 : -1;
          return ordenarDir === "asc" ? a.data_vencimento.localeCompare(b.data_vencimento) : b.data_vencimento.localeCompare(a.data_vencimento);
        }
        if (ordenarPor === "cliente") { va = (clientes.find(c => c.id === a.cliente_id)?.nome || "").toLowerCase(); vb = (clientes.find(c => c.id === b.cliente_id)?.nome || "").toLowerCase(); }
        else if (ordenarPor === "valor") { va = Number(a.valor); vb = Number(b.valor); }
        else if (ordenarPor === "status") { va = a._status; vb = b._status; }
        if (va < vb) return ordenarDir === "asc" ? -1 : 1;
        if (va > vb) return ordenarDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [contasReceber, clientes, filtro, ordenarPor, ordenarDir]);

  const totais = useMemo(() => {
    const mapeado = contasReceber.map(cr => ({ ...cr, _status: statusReal(cr) }));
    return {
      pendente: mapeado.filter(cr => cr._status === "pendente").reduce((a, c) => a + saldoCr(c), 0),
      vencido: mapeado.filter(cr => cr._status === "vencido").reduce((a, c) => a + saldoCr(c), 0),
      pago: mapeado.filter(cr => cr._status === "pago").reduce((a, c) => a + Number(c.valor), 0),
      qtdVencido: mapeado.filter(cr => cr._status === "vencido").length,
    };
  }, [contasReceber]);

  const salvarNova = async () => {
    if (!form.clienteId || !form.valor || !form.vencimento) { notify("Preencha todos os campos obrigatórios.", "error"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("contas_receber").insert({
        cliente_id: Number(form.clienteId),
        descricao: form.descricao,
        valor: Number(form.valor),
        forma_pagamento: form.forma,
        data_emissao: today(),
        data_vencimento: form.vencimento,
        status: "pendente",
        obs: form.obs,
      }).select().single();
      if (error) { console.error("contas_receber insert:", error); notify(`Erro ao salvar cobrança: ${error.message}`, "error"); return; }
      setContasReceber(prev => [...prev, data].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)));
      setModalNova(false);
      setForm({ clienteId: "", descricao: "", valor: "", forma: "parcelado", vencimento: today(), obs: "" });
      notify("Cobrança lançada.");
    } finally { setSaving(false); }
  };

  const confirmarPagamento = async () => {
    if (!modalPagar) return;
    const saldo = saldoCr(modalPagar);
    const valorRecebido = pagarForm.valorParcial ? Math.min(Number(pagarForm.valorParcial), saldo) : saldo;
    if (valorRecebido <= 0) { notify("Informe o valor recebido.", "error"); return; }
    setSaving(true);
    try {
      const novoPago = Number(modalPagar.valor_pago || 0) + valorRecebido;
      const pagoTotal = novoPago >= Number(modalPagar.valor);
      const updates = { valor_pago: novoPago, forma_pagamento: pagarForm.forma };
      if (pagoTotal) { updates.status = "pago"; updates.data_pagamento = pagarForm.data; }
      const { data, error } = await supabase.from("contas_receber")
        .update(updates)
        .eq("id", modalPagar.id).select().single();
      if (error) { console.error("contas_receber update:", error); notify(`Erro ao registrar pagamento: ${error.message}`, "error"); return; }
      setContasReceber(prev => prev.map(cr => cr.id === modalPagar.id ? data : cr));
      if (pagoTotal && modalPagar.venda_id && setVendas) {
        const { error: ve } = await supabase.from("vendas").update({ status: "pago" }).eq("id", modalPagar.venda_id);
        if (!ve) setVendas(prev => prev.map(v => v.id === modalPagar.venda_id ? { ...v, status: "pago" } : v));
      }
      setModalPagar(null);
      notify(pagoTotal ? "Pagamento total registrado." : `Parcial de ${fmt(valorRecebido)} registrado. Saldo: ${fmt(saldo - valorRecebido)}`);
    } finally { setSaving(false); }
  };

  const abrirEditar = (cr) => {
    setEditForm({
      clienteId: cr.cliente_id ? String(cr.cliente_id) : "",
      descricao: cr.descricao || "",
      valor: String(cr.valor),
      forma: cr.forma_pagamento || "parcelado",
      vencimento: cr.data_vencimento || today(),
      obs: cr.obs || "",
    });
    setModalEditar(cr);
  };

  const salvarEdicao = async () => {
    if (!editForm.clienteId || !editForm.valor || !editForm.vencimento) { notify("Preencha todos os campos obrigatórios.", "error"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("contas_receber").update({
        cliente_id: Number(editForm.clienteId),
        descricao: editForm.descricao,
        valor: Number(editForm.valor),
        forma_pagamento: editForm.forma,
        data_vencimento: editForm.vencimento,
        obs: editForm.obs,
      }).eq("id", modalEditar.id).select().single();
      if (error) { notify(`Erro ao salvar: ${error.message}`, "error"); return; }
      setContasReceber(prev => prev.map(cr => cr.id === modalEditar.id ? data : cr));
      setModalEditar(null);
      notify("Cobrança atualizada.");
    } finally { setSaving(false); }
  };

  const excluir = (id) => {
    setConfirmState({ msg: "Excluir esta cobrança?", onConfirm: async () => {
      const { error } = await supabase.from("contas_receber").delete().eq("id", id);
      if (error) { console.error("contas_receber delete:", error); notify(`Erro ao excluir: ${error.message}`, "error"); return; }
      setContasReceber(prev => prev.filter(cr => cr.id !== id));
      notify("Cobrança removida.");
    }});
  };

  const cobrarCliente = (cr) => {
    const cli = clientes.find(c => c.id === cr.cliente_id);
    if (!cli?.telefone) { notify(`${t("cliente")} sem telefone cadastrado.`, "error"); return; }
    const tel = String(cli.telefone).replace(/\D/g, '');
    const numero = tel.startsWith('55') ? tel : '55' + tel;
    const partes = cr.data_vencimento.split('-');
    const data = `${partes[2]}/${partes[1]}/${partes[0]}`;
    const msg =
      `Olá, *${cli.nome}*! 👋\n\n` +
      `Identificamos um débito em aberto:\n\n` +
      `📋 *${cr.descricao || 'Cobrança'}*\n` +
      `💰 Valor: *${fmt(saldoCr(cr))}*\n` +
      `📅 Vencimento: *${data}*\n\n` +
      `Para regularizar ou negociar, entre em contato conosco. 💈\n\n` +
      `*Quasar Barber*`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const dispararCobranca = () => {
    setConfirmState({ msg: `Enviar cobrança via WhatsApp para ${totais.qtdVencido} ${t("cliente").toLowerCase()}(s) em atraso?`, danger: false, onConfirm: async () => {
      const url = process.env.REACT_APP_N8N_WEBHOOK_URL;
      if (!url) { notify("Defina REACT_APP_N8N_WEBHOOK_URL no .env", "error"); return; }
      setEnviando(true);
      try {
        await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "quasar-barber" }) });
        notify(`Disparo iniciado — ${totais.qtdVencido} mensagem(s) em envio.`);
      } catch {
        notify("Erro ao conectar com o n8n. Verifique a URL do webhook.", "error");
      } finally {
        setEnviando(false);
      }
    }});
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: "1.5rem", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Contas a Receber</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {totais.qtdVencido > 0 && (
            <button
              style={{ ...btn("ghost"), borderColor: "#e05a5a44", color: "#e05a5a" }}
              onClick={dispararCobranca}
              disabled={enviando}>
              {enviando ? <><Spinner size={14} color="#e05a5a" /> Enviando...</> : <><Icon name="chat" size={14} /> Cobrar ({totais.qtdVencido})</>}
            </button>
          )}
          <button style={btn("primary")} onClick={() => setModalNova(true)}><Icon name="plus" size={14} /> Nova Cobrança</button>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ display: "flex", flexWrap: "wrap", background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "hidden", marginBottom: "1.25rem" }}>
        <div style={{ flex: "1 1 160px", padding: "14px 18px", borderLeft: "1px solid #1d1d1d", marginLeft: -1 }}>
          <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 7 }}>A Receber</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#e8a020", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(totais.pendente)}</div>
        </div>
        <div style={{ flex: "1 1 220px", padding: "14px 18px", borderLeft: "1px solid #1d1d1d", marginLeft: -1 }}>
          <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 7 }}>
            Em Atraso{totais.qtdVencido > 0 ? ` · ${totais.qtdVencido} cobrança${totais.qtdVencido > 1 ? "s" : ""}` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.35rem", fontWeight: 700, color: totais.vencido > 0 ? "#e05a5a" : "#3a3a3a", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(totais.vencido)}</span>
            {totais.qtdVencido > 0 && (
              <button
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #e05a5a55", background: "rgba(224,90,90,.1)", color: "#e05a5a", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                onClick={dispararCobranca}
                disabled={enviando}>
                {enviando ? <><Spinner size={12} color="#e05a5a" /> Enviando...</> : <><Icon name="chat" size={12} /> Cobrar todos</>}
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: "1 1 160px", padding: "14px 18px", borderLeft: "1px solid #1d1d1d", marginLeft: -1 }}>
          <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 7 }}>Recebido</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#4caf82", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(totais.pago)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
        {["todos", "pendente", "vencido", "pago"].map(f => {
          const cor = f === "vencido" ? "#e05a5a" : f === "pago" ? "#4caf82" : f === "pendente" ? "#e8a020" : "#c9a84c";
          const ativo = filtro === f;
          return (
            <button key={f} onClick={() => setFiltro(f)}
              style={{ padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: ".78rem",
                border: `1px solid ${ativo ? cor + "66" : "transparent"}`,
                background: ativo ? cor + "1a" : "#1a1a1a",
                color: ativo ? cor : "#777",
                fontWeight: ativo ? 600 : 400 }}>
              {f === "todos" ? "Todos" : STATUS_LABEL[f]}
            </button>
          );
        })}
      </div>

      {/* Tabela */}
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem", minWidth: 580 }}>
          <thead>
            <tr style={{ background: "#111" }}>
              {[
                { label: t("cliente"), col: "cliente" },
                { label: "Descrição", col: null },
                { label: "Forma", col: null },
                { label: "Vencimento", col: "vencimento" },
                { label: "Valor", col: "valor" },
                { label: "Status", col: "status" },
                { label: "Ações", col: null },
              ].map(({ label, col }) => (
                <th key={label} onClick={col ? () => toggleOrdem(col) : undefined}
                  style={{ padding: ".75rem 1rem", textAlign: "left", fontSize: ".72rem", color: col ? (ordenarPor === col ? "#c9a84c" : "#555") : "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                  {label}{col && ordenarPor === col ? (ordenarDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map(cr => {
              const cli = clientes.find(c => c.id === cr.cliente_id);
              const atraso = cr._status === "vencido" ? diasAtraso(cr.data_vencimento) : 0;
              return (
                <tr key={cr.id} style={{ borderTop: "1px solid #1f1f1f", background: cr._status === "vencido" ? "#1a0a0a" : "transparent" }}>
                  <td style={{ padding: ".8rem 1rem", color: "#e0e0e0", fontWeight: 500 }}>{cli?.nome ?? "—"}</td>
                  <td style={{ padding: ".8rem 1rem", color: "#888", fontSize: ".82rem", maxWidth: 180 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cr.descricao || "—"}</div>
                    {cr.venda_id && <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2 }}>Venda #{String(cr.venda_id).slice(-4)}</div>}
                  </td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <span style={{ fontSize: ".75rem", padding: "2px 8px", borderRadius: 4, background: "#1f1f1f", color: "#999" }}>
                      {FORMA_LABEL[cr.forma_pagamento] || cr.forma_pagamento}
                    </span>
                  </td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <div style={{ color: cr._status === "vencido" ? "#e05a5a" : "#aaa", fontFamily: "'DM Mono',monospace", fontSize: ".85rem" }}>{cr.data_vencimento}</div>
                    {atraso > 0 && <div style={{ fontSize: ".7rem", color: "#e05a5a", marginTop: 2 }}>{atraso} dia{atraso > 1 ? "s" : ""} atraso</div>}
                    {cr._status === "pago" && cr.data_pagamento && <div style={{ fontSize: ".7rem", color: "#4caf82", marginTop: 2 }}>Pago em {cr.data_pagamento}</div>}
                  </td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <div style={{ color: "#ffbf00", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                      {cr._status === "pago" ? fmt(cr.valor) : fmt(saldoCr(cr))}
                    </div>
                    {cr._status !== "pago" && Number(cr.valor_pago || 0) > 0 && (
                      <div style={{ fontSize: ".7rem", color: "#4caf82", marginTop: 2 }}>+{fmt(cr.valor_pago)} pago</div>
                    )}
                  </td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <span style={{ fontSize: ".75rem", padding: "3px 10px", borderRadius: 4, background: STATUS_COR[cr._status] + "22", color: STATUS_COR[cr._status] }}>
                      {STATUS_LABEL[cr._status]}
                    </span>
                  </td>
                  <td style={{ padding: ".8rem 1rem" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {cr._status !== "pago" && (
                        <>
                          <button
                            onClick={() => { setModalPagar(cr); setPagarForm({ forma: cr.forma_pagamento || "pix", data: today(), valorParcial: "" }); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#4caf8222", color: "#4caf82", fontSize: ".75rem", display: "flex", alignItems: "center", gap: 4 }}>
                            <Icon name="check" size={13} /> Receber
                          </button>
                          <button
                            onClick={() => abrirEditar(cr)} title="Editar"
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#1f1f1f", color: "#999", fontSize: ".75rem", display: "flex", alignItems: "center", gap: 4 }}>
                            <Icon name="pencil" size={13} />
                          </button>
                          {cr._status === "vencido" && (
                            <button
                              onClick={() => cobrarCliente(cr)}
                              style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#e05a5a22", color: "#e05a5a", fontSize: ".75rem", display: "flex", alignItems: "center", gap: 4 }}>
                              <Icon name="chat" size={13} /> Cobrar
                            </button>
                          )}
                        </>
                      )}
                      <button onClick={() => excluir(cr.id)} style={{ ...btn("danger"), padding: "4px 10px", fontSize: ".75rem" }}>
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState iconName="money" title={filtro === "todos" ? "Nenhuma conta a receber" : `Nenhuma conta ${STATUS_LABEL[filtro]?.toLowerCase()}`} subtitle="As contas criadas por vendas aparecem aqui" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalEditar && (
        <Modal title="Editar Cobrança" onClose={() => setModalEditar(null)}>
          <Field label={`${t("cliente")} *`}>
            <select style={inp} value={editForm.clienteId} onChange={e => setEditForm({ ...editForm, clienteId: e.target.value })}>
              <option value="">Selecionar {t("cliente").toLowerCase()}...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Descrição">
            <input style={inp} value={editForm.descricao} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} autoFocus />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Valor (R$) *">
              <input style={inp} type="number" step=".01" min="0" value={editForm.valor} onChange={e => setEditForm({ ...editForm, valor: e.target.value })} />
            </Field>
            <Field label="Vencimento *">
              <input style={inp} type="date" value={editForm.vencimento} onChange={e => setEditForm({ ...editForm, vencimento: e.target.value })} />
            </Field>
          </div>
          <Field label="Forma de Pagamento">
            <div style={{ display: "flex", gap: 6 }}>
              {FORMAS.map(f => (
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

      {/* Modal nova cobrança */}
      {modalNova && (
        <Modal title="Nova Cobrança" onClose={() => setModalNova(false)}>
          <Field label={`${t("cliente")} *`}>
            <select style={inp} value={form.clienteId} onChange={e => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Selecionar {t("cliente").toLowerCase()}...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Descrição">
            <input style={inp} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Pedido de fevereiro" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Valor (R$) *">
              <input style={inp} type="number" step=".01" min="0" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
            </Field>
            <Field label="Vencimento *">
              <input style={inp} type="date" value={form.vencimento} onChange={e => setForm({ ...form, vencimento: e.target.value })} />
            </Field>
          </div>
          <Field label="Forma de Pagamento">
            <div style={{ display: "flex", gap: 6 }}>
              {FORMAS.map(f => (
                <button key={f} onClick={() => setForm({ ...form, forma: f })}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${form.forma === f ? FORMA_COR[f] : "#333"}`, cursor: "pointer",
                    background: form.forma === f ? FORMA_COR[f] + "22" : "transparent",
                    color: form.forma === f ? FORMA_COR[f] : "#666",
                    fontSize: ".78rem", fontWeight: form.forma === f ? 700 : 400 }}>
                  {FORMA_LABEL[f]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Observação">
            <input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModalNova(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvarNova} disabled={saving}>
              {saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Lançar Cobrança"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal confirmar recebimento */}
      {modalPagar && (() => {
        const saldo = saldoCr(modalPagar);
        const valorDigitado = pagarForm.valorParcial ? Number(pagarForm.valorParcial) : 0;
        const saldoApos = Math.max(0, saldo - valorDigitado);
        const isParcial = pagarForm.valorParcial !== "" && valorDigitado < saldo;
        return (
          <Modal title="Registrar Recebimento" onClose={() => setModalPagar(null)}>
            <div style={{ background: "#111", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: ".72rem", color: "#555", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{t("cliente")}</div>
              <div style={{ fontSize: "1rem", color: "#e0e0e0", fontWeight: 600 }}>{clientes.find(c => c.id === modalPagar.cliente_id)?.nome}</div>
              {modalPagar.descricao && <div style={{ fontSize: ".82rem", color: "#666", marginTop: 3 }}>{modalPagar.descricao}</div>}
              <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
                {Number(modalPagar.valor_pago || 0) > 0 && (
                  <div>
                    <div style={{ fontSize: ".68rem", color: "#555", marginBottom: 2 }}>Total</div>
                    <div style={{ fontSize: "1rem", color: "#666", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(modalPagar.valor)}</div>
                  </div>
                )}
                {Number(modalPagar.valor_pago || 0) > 0 && (
                  <div>
                    <div style={{ fontSize: ".68rem", color: "#555", marginBottom: 2 }}>Já pago</div>
                    <div style={{ fontSize: "1rem", color: "#4caf82", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(modalPagar.valor_pago)}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: ".68rem", color: "#555", marginBottom: 2 }}>{Number(modalPagar.valor_pago || 0) > 0 ? "Saldo" : "Valor"}</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ffbf00", fontFamily: "'DM Mono',monospace" }}>{fmt(saldo)}</div>
                </div>
              </div>
            </div>
            <Field label="Valor Recebido (R$)">
              <input style={{ ...inp, fontFamily: "'DM Mono',monospace" }}
                type="number" step=".01" min="0"
                placeholder={String(saldo.toFixed(2))}
                value={pagarForm.valorParcial}
                onChange={e => setPagarForm({ ...pagarForm, valorParcial: e.target.value })} />
              {isParcial && (
                <div style={{ marginTop: 6, padding: "5px 8px", background: "#1f1a09", borderRadius: 6, border: "1px solid #5a3a0a", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: ".75rem", color: "#e8a020" }}>Pagamento parcial — saldo restante</span>
                  <span style={{ fontSize: ".82rem", color: "#e8a020", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(saldoApos)}</span>
                </div>
              )}
            </Field>
            <Field label="Forma de Pagamento Recebida">
              <div style={{ display: "flex", gap: 6 }}>
                {FORMAS.map(f => (
                  <button key={f} onClick={() => setPagarForm({ ...pagarForm, forma: f })}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${pagarForm.forma === f ? FORMA_COR[f] : "#333"}`, cursor: "pointer",
                      background: pagarForm.forma === f ? FORMA_COR[f] + "22" : "transparent",
                      color: pagarForm.forma === f ? FORMA_COR[f] : "#666",
                      fontSize: ".78rem", fontWeight: pagarForm.forma === f ? 700 : 400 }}>
                    {FORMA_LABEL[f]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Data do Recebimento">
              <input style={inp} type="date" value={pagarForm.data} onChange={e => setPagarForm({ ...pagarForm, data: e.target.value })} />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={btn("ghost")} onClick={() => setModalPagar(null)}>Cancelar</button>
              <button style={btn("primary")} onClick={confirmarPagamento} disabled={saving}>
                {saving ? <><Spinner size={14} color="#0a0a08" /> Confirmando...</> : isParcial ? "Registrar Parcial" : "Confirmar Recebimento"}
              </button>
            </div>
          </Modal>
        );
      })()}
      {confirmState && <Confirm msg={confirmState.msg} danger={confirmState.danger !== false} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default ContasReceber;


