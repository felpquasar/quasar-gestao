import { useState, useMemo } from 'react';
import { useMobile } from '../hooks/useMobile';
import { supabase } from '../lib/supabase';
import { fmt, today, addDays } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';
import Confirm from './ui/Confirm';
import EmptyState from './ui/EmptyState';

const card = { background: "#141414", border: "1px solid #1f1f1f", borderRadius: 14 };

// t = tradutor de vocabulário do segmento (useTermos). "pacote" e "cliente"
// vêm do dicionário: barbearia -> "Pacote"/"Cliente", fisio -> "Pacote de
// sessões"/"Paciente". Nenhum texto de domínio hardcoded (arquitetura v2 §0.6).
const Pacotes = ({ t, pacotes, setPacotes, pacotesCliente, setPacotesCliente, clientes, setVendas, notify }) => {
  const isMobile = useMobile();

  // --- oferta (tabela pacotes) ---
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nome: "", qtd_sessoes: "", preco: "", validade_dias: "", ativo: true });
  const [saving, setSaving] = useState(false);

  // --- venda de pacote (cartela) ---
  const [modalVenda, setModalVenda] = useState(false);
  const [vendaForm, setVendaForm] = useState({ clienteId: "", pacoteId: "" });
  const [vendendo, setVendendo] = useState(false);

  const [confirmState, setConfirmState] = useState(null);

  const clienteNome = (id) => clientes.find(c => c.id === id)?.nome || "—";
  const pacoteNome = (pc) => pc.pacotes?.nome || pacotes.find(p => p.id === pc.pacote_id)?.nome || "—";

  // ---------- CRUD da oferta ----------
  const abrir = (p = null) => {
    setEditando(p);
    setForm(p
      ? { nome: p.nome, qtd_sessoes: String(p.qtd_sessoes), preco: String(p.preco), validade_dias: p.validade_dias ? String(p.validade_dias) : "", ativo: p.ativo }
      : { nome: "", qtd_sessoes: "", preco: "", validade_dias: "", ativo: true });
    setModal(true);
  };

  const salvar = async () => {
    if (!form.nome || !form.qtd_sessoes || !form.preco) { notify("Preencha nome, sessões e preço.", "error"); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      qtd_sessoes: Number(form.qtd_sessoes),
      preco: Number(form.preco),
      validade_dias: form.validade_dias ? Number(form.validade_dias) : null,
      ativo: form.ativo,
    };
    if (editando) {
      const { data, error } = await supabase.from("pacotes").update(payload).eq("id", editando.id).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setPacotes(prev => prev.map(p => p.id === editando.id ? data : p).sort((a, b) => a.nome.localeCompare(b.nome)));
    } else {
      const { data, error } = await supabase.from("pacotes").insert(payload).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setPacotes(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
    }
    setModal(false); notify(`${t("pacote")} ${editando ? "atualizado." : "cadastrado."}`);
  };

  const excluir = (id) => {
    setConfirmState({ msg: `Excluir esta oferta de ${t("pacote").toLowerCase()}?`, onConfirm: async () => {
      const { error } = await supabase.from("pacotes").delete().eq("id", id);
      if (error) { notify("Erro ao excluir (pode haver cartelas vendidas).", "error"); return; }
      setPacotes(prev => prev.filter(p => p.id !== id));
      notify("Oferta excluída.");
    }});
  };

  // ---------- venda de pacote (cria venda + cartela) ----------
  const pacotesAtivos = useMemo(() => pacotes.filter(p => p.ativo), [pacotes]);

  const abrirVenda = () => { setVendaForm({ clienteId: "", pacoteId: "" }); setModalVenda(true); };

  const venderPacote = async () => {
    if (!vendaForm.clienteId || !vendaForm.pacoteId) { notify("Escolha o cliente e o pacote.", "error"); return; }
    const pacote = pacotes.find(p => p.id === Number(vendaForm.pacoteId));
    if (!pacote) { notify("Pacote inválido.", "error"); return; }
    setVendendo(true);
    const cliId = Number(vendaForm.clienteId);
    const dataCompra = today();
    const dataValidade = pacote.validade_dias ? addDays(dataCompra, pacote.validade_dias) : null;
    try {
      // 1. venda normal com o valor cheio (entra no caixa hoje) — §7.3.1
      const { data: venda, error: ve } = await supabase.from("vendas").insert({
        cliente_id: cliId, data: dataCompra, status: "pago",
        total: Number(pacote.preco), forma_pagamento: "a_vista",
      }).select("*, venda_itens(*)").single();
      if (ve) throw ve;

      // 2. cartela do cliente (saldo). tenant_id é auto-preenchido pelo trigger.
      const { data: cartela, error: ce } = await supabase.from("pacotes_cliente").insert({
        cliente_id: cliId, pacote_id: pacote.id,
        sessoes_total: pacote.qtd_sessoes, valor_pago: Number(pacote.preco),
        data_validade: dataValidade,
      }).select("*, pacotes(nome), clientes(nome)").single();
      if (ce) throw ce;

      setVendas(prev => [venda, ...prev]);
      setPacotesCliente(prev => [cartela, ...prev]);
      setModalVenda(false);
      notify(`${t("pacote")} vendido para ${clienteNome(cliId)}.`);
    } catch (err) {
      console.error(err);
      notify(err?.message || "Erro ao vender pacote.", "error");
    } finally { setVendendo(false); }
  };

  // ---------- consumo de sessão (baixa atômica via RPC) ----------
  const consumir = (pc) => {
    setConfirmState({ danger: false, msg: `Registrar uso de 1 ${t("atendimento").toLowerCase()} da cartela de ${clienteNome(pc.cliente_id)}?`, onConfirm: async () => {
      const { error } = await supabase.rpc("consumir_sessao", { p_pacote_cliente: pc.id });
      if (error) { notify(error.message || "Não foi possível registrar (sem saldo ou vencido).", "error"); return; }
      setPacotesCliente(prev => prev.map(x => x.id === pc.id ? { ...x, sessoes_usadas: x.sessoes_usadas + 1 } : x));
      notify(`${t("atendimento")} registrado.`);
    }});
  };

  const vencida = (pc) => pc.data_validade && pc.data_validade < today();
  const saldo = (pc) => pc.sessoes_total - pc.sessoes_usadas;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>{t("pacote")}</h2>
          <div style={{ fontSize: ".74rem", color: "#555", marginTop: 2 }}>{pacotes.length} oferta{pacotes.length !== 1 ? "s" : ""} · {pacotesCliente.length} cartela{pacotesCliente.length !== 1 ? "s" : ""} vendida{pacotesCliente.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn("ghost")} onClick={() => abrir()}><Icon name="plus" size={14} /> Nova oferta</button>
          <button style={btn("primary")} onClick={abrirVenda} disabled={pacotesAtivos.length === 0 || clientes.length === 0}><Icon name="cart" size={14} /> Vender {t("pacote").toLowerCase()}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px,2fr) 3fr", gap: 14, alignItems: "start" }}>
        {/* Ofertas */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1c1c1c", fontSize: ".68rem", color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>Ofertas</div>
          {pacotes.length === 0
            ? <EmptyState iconName="box" title="Nenhuma oferta" subtitle={`Crie um ${t("pacote").toLowerCase()} para vender`} />
            : pacotes.map(p => (
              <div key={p.id} style={{ padding: "12px 14px", borderBottom: "1px solid #191919", display: "flex", alignItems: "center", gap: 10, opacity: p.ativo ? 1 : .45 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#ccc", fontSize: ".88rem" }}>{p.nome}{!p.ativo && <span style={{ fontSize: ".65rem", color: "#777" }}> · inativo</span>}</div>
                  <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2 }}>{p.qtd_sessoes} {t("atendimentos").toLowerCase()}{p.validade_dias ? ` · ${p.validade_dias}d validade` : ""}</div>
                </div>
                <span style={{ fontSize: ".85rem", color: "#ffbf00", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(p.preco)}</span>
                <button style={{ ...btn("ghost"), padding: "5px 8px" }} onClick={() => abrir(p)}><Icon name="pencil" size={12} /></button>
                <button style={{ ...btn("danger"), padding: "5px 8px" }} onClick={() => excluir(p.id)}><Icon name="trash" size={12} /></button>
              </div>
            ))}
        </div>

        {/* Cartelas vendidas */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1c1c1c", fontSize: ".68rem", color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>Cartelas ativas</div>
          {pacotesCliente.length === 0
            ? <EmptyState iconName="users" title="Nenhuma cartela vendida" subtitle={`Venda um ${t("pacote").toLowerCase()} para um ${t("cliente").toLowerCase()}`} />
            : pacotesCliente.map(pc => {
              const s = saldo(pc);
              const venc = vencida(pc);
              const pct = pc.sessoes_total > 0 ? (pc.sessoes_usadas / pc.sessoes_total) * 100 : 0;
              const esgotada = s <= 0;
              return (
                <div key={pc.id} style={{ padding: "12px 14px", borderBottom: "1px solid #191919" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#ccc", fontSize: ".85rem" }}>{clienteNome(pc.cliente_id)}</div>
                      <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2 }}>
                        {pacoteNome(pc)}
                        {pc.data_validade && <span style={{ color: venc ? "#e05a5a" : "#555" }}> · {venc ? "vencida" : `val. ${pc.data_validade}`}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: ".72rem", color: esgotada ? "#e05a5a" : "#4caf82", fontFamily: "'DM Mono',monospace" }}>{pc.sessoes_usadas}/{pc.sessoes_total}</span>
                    <button style={{ ...btn("ghost"), padding: "5px 10px", fontSize: ".72rem" }} disabled={esgotada || venc} onClick={() => consumir(pc)}>Usar 1</button>
                  </div>
                  <div style={{ background: "#1c1c1c", borderRadius: 4, height: 5, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: esgotada ? "#e05a5a" : "#4caf82", transition: "width .3s" }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Modal oferta */}
      {modal && (
        <Modal title={`${editando ? "Editar" : "Nova"} oferta de ${t("pacote").toLowerCase()}`} onClose={() => setModal(false)}>
          <Field label="Nome"><input style={inp} value={form.nome} placeholder={`Ex: ${t("pacote")} 10 ${t("atendimentos").toLowerCase()}`} onChange={e => setForm({ ...form, nome: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label={`Qtd. de ${t("atendimentos").toLowerCase()}`}><input style={inp} type="number" min="1" value={form.qtd_sessoes} onChange={e => setForm({ ...form, qtd_sessoes: e.target.value })} /></Field>
            <Field label="Preço (R$)"><input style={inp} type="number" step=".01" min="0" placeholder="0,00" value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} /></Field>
          </div>
          <Field label="Validade em dias (opcional, vazio = sem validade)"><input style={inp} type="number" min="1" value={form.validade_dias} onChange={e => setForm({ ...form, validade_dias: e.target.value })} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".82rem", color: "#aaa", cursor: "pointer", margin: "4px 0" }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Ativo (disponível para venda)
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModal(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal venda de pacote */}
      {modalVenda && (
        <Modal title={`Vender ${t("pacote").toLowerCase()}`} onClose={() => setModalVenda(false)}>
          <Field label={t("cliente")}>
            <select style={inp} value={vendaForm.clienteId} onChange={e => setVendaForm({ ...vendaForm, clienteId: e.target.value })}>
              <option value="">— Selecione —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label={t("pacote")}>
            <select style={inp} value={vendaForm.pacoteId} onChange={e => setVendaForm({ ...vendaForm, pacoteId: e.target.value })}>
              <option value="">— Selecione —</option>
              {pacotesAtivos.map(p => <option key={p.id} value={p.id}>{p.nome} — {fmt(p.preco)}</option>)}
            </select>
          </Field>
          <div style={{ fontSize: ".72rem", color: "#666", margin: "4px 0 8px" }}>
            A compra entra no caixa como venda à vista pelo valor cheio. O consumo de cada {t("atendimento").toLowerCase()} não gera nova cobrança.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModalVenda(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={venderPacote} disabled={vendendo}>{vendendo ? <><Spinner size={14} color="#0a0a08" /> Vendendo...</> : "Confirmar venda"}</button>
          </div>
        </Modal>
      )}

      {confirmState && <Confirm msg={confirmState.msg} danger={confirmState.danger !== false} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default Pacotes;
