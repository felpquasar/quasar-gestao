import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { today, addDays } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';
import Confirm from './ui/Confirm';
import EmptyState from './ui/EmptyState';

const card = { background: "#141414", border: "1px solid #1f1f1f", borderRadius: 14 };

// Rótulo + cor de cada status do agendamento (casa com o CHECK do 012_agenda.sql).
const STATUS = {
  agendado:   { label: "Agendado",   cor: "#c9a84c" },
  confirmado: { label: "Confirmado", cor: "#4c8cc9" },
  concluido:  { label: "Concluído",  cor: "#4caf82" },
  cancelado:  { label: "Cancelado",  cor: "#e05a5a" },
  faltou:     { label: "Faltou",     cor: "#a06a2c" },
};
const STATUS_KEYS = Object.keys(STATUS);

// Join padrão dos selects de agendamento — manter em sincronia com useStore.js.
const SEL = "*, clientes(nome)";

const formVazio = () => ({ clienteId: "", cliente_nome: "", servico: "", data: "", hora: "", duracao_min: "30", status: "agendado", obs: "" });

// Converte "HH:MM" em minutos desde 00:00, pra comparar faixas de horário.
const paraMinutos = (hhmm) => {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return h * 60 + m;
};

// Formata YYYY-MM-DD como "Segunda, 07 de julho".
const dataLonga = (d) => {
  const s = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// t = tradutor de vocabulário do segmento (useTermos). "cliente"/"atendimento"
// vêm do dicionário — nada de domínio hardcoded (arquitetura v2 §0.6).
const Agenda = ({ t, agendamentos, setAgendamentos, clientes, notify }) => {
  const [dia, setDia] = useState(today());
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formVazio());
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  // Toda linha chega com o join clientes(nome) (useStore + salvar usam SEL).
  const clienteNome = (a) => a.clientes?.nome || a.cliente_nome || "Avulso";

  // Agendamentos do dia selecionado, ordenados por hora.
  const doDia = useMemo(
    () => agendamentos.filter(a => a.data === dia).sort((a, b) => (a.hora || "").localeCompare(b.hora || "")),
    [agendamentos, dia]
  );

  const abrir = (a = null) => {
    setEditando(a);
    setForm(a
      ? { clienteId: a.cliente_id ? String(a.cliente_id) : "", cliente_nome: a.cliente_nome || "", servico: a.servico || "", data: a.data, hora: (a.hora || "").slice(0, 5), duracao_min: String(a.duracao_min || 30), status: a.status, obs: a.obs || "" }
      : { ...formVazio(), data: dia });
    setModal(true);
  };

  const salvar = async () => {
    if (!form.data) { notify("Informe a data.", "error"); return; }
    if (!form.hora) { notify("Informe o horário.", "error"); return; }
    if (!form.clienteId && !form.cliente_nome.trim()) { notify(`Escolha um ${t("cliente").toLowerCase()} ou informe um nome.`, "error"); return; }
    const duracao = Number(form.duracao_min);
    if (!Number.isFinite(duracao) || duracao <= 0) { notify("Informe uma duração maior que zero.", "error"); return; }
    // Data/hora nova (ou movida) não pode ficar no passado — histórico existente não é mexido.
    const dataMudou = !editando || form.data !== editando.data;
    const horaMudou = !editando || form.hora !== (editando.hora || "").slice(0, 5);
    if (dataMudou && form.data < today()) { notify("Não é possível agendar para uma data anterior a hoje.", "error"); return; }
    if ((dataMudou || horaMudou) && form.data === today()) {
      const agora = new Date();
      const horaAtual = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
      if (form.hora < horaAtual) { notify("Não é possível agendar para um horário que já passou hoje.", "error"); return; }
    }
    // Trava de conflito: nenhum outro agendamento (não cancelado/faltou) pode se sobrepor no mesmo dia.
    // "Faltou" libera o horário — o cliente não veio, o horário fica vago pra outro.
    const inicioNovo = paraMinutos(form.hora);
    const fimNovo = inicioNovo + duracao;
    const conflito = agendamentos.some(a => {
      if (a.data !== form.data || a.id === editando?.id || a.status === "cancelado" || a.status === "faltou") return false;
      const ini = paraMinutos((a.hora || "").slice(0, 5));
      const fim = ini + Number(a.duracao_min || 30);
      return inicioNovo < fim && ini < fimNovo;
    });
    if (conflito) { notify("Já existe um agendamento nesse horário.", "error"); return; }
    setSaving(true);
    const payload = {
      cliente_id: form.clienteId ? Number(form.clienteId) : null,
      cliente_nome: form.clienteId ? null : form.cliente_nome.trim(),
      servico: form.servico.trim() || null,
      data: form.data,
      hora: form.hora,
      duracao_min: duracao,
      status: form.status,
      obs: form.obs.trim() || null,
    };
    const query = editando
      ? supabase.from("agendamentos").update(payload).eq("id", editando.id)
      : supabase.from("agendamentos").insert(payload);
    const { data, error } = await query.select(SEL).single();
    setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
    setAgendamentos(prev => editando ? prev.map(a => a.id === editando.id ? data : a) : [...prev, data]);
    if (form.data !== dia) setDia(form.data);
    setModal(false); notify(`Agendamento ${editando ? "atualizado." : "criado."}`);
  };

  // Troca de status inline (sem abrir modal).
  const mudarStatus = async (a, status) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", a.id);
    if (error) { notify("Erro ao atualizar status.", "error"); return; }
    setAgendamentos(prev => prev.map(x => x.id === a.id ? { ...x, status } : x));
  };

  const excluir = (a) => {
    setConfirmState({ msg: `Excluir o agendamento de ${clienteNome(a)}?`, onConfirm: async () => {
      const { error } = await supabase.from("agendamentos").delete().eq("id", a.id);
      if (error) { notify("Erro ao excluir.", "error"); return; }
      setAgendamentos(prev => prev.filter(x => x.id !== a.id));
      notify("Agendamento excluído.");
    }});
  };

  const isHoje = dia === today();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Agenda</h2>
          <div style={{ fontSize: ".74rem", color: "#555", marginTop: 2 }}>{doDia.length} agendamento{doDia.length !== 1 ? "s" : ""} neste dia</div>
        </div>
        <button style={btn("primary")} onClick={() => abrir()}><Icon name="plus" size={14} /> Novo agendamento</button>
      </div>

      {/* Navegador de dia */}
      <div style={{ ...card, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button style={{ ...btn("ghost"), padding: "8px 12px" }} onClick={() => setDia(d => addDays(d, -1))} title="Dia anterior">
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="chevron" size={14} /></span>
        </button>
        <div style={{ flex: "1 1 150px", minWidth: 150, textAlign: "center" }}>
          <div style={{ fontSize: ".92rem", color: "#e0d6b8", fontWeight: 600 }}>{dataLonga(dia)}</div>
          {!isHoje && <button onClick={() => setDia(today())} style={{ background: "none", border: "none", color: "#ffbf00", cursor: "pointer", fontSize: ".68rem", padding: "2px 0" }}>Voltar para hoje</button>}
        </div>
        <button style={{ ...btn("ghost"), padding: "8px 12px" }} onClick={() => setDia(d => addDays(d, 1))} title="Próximo dia">
          <Icon name="chevron" size={14} />
        </button>
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)}
          style={{ ...inp, width: "auto", padding: "8px 10px", flexShrink: 0, flexGrow: 0, marginLeft: "auto" }} title="Ir para uma data" />
      </div>

      {/* Lista do dia */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {doDia.length === 0
          ? <EmptyState iconName="calendar" title="Nenhum agendamento" subtitle="Toque em Novo agendamento para marcar um horário" />
          : doDia.map(a => {
            const st = STATUS[a.status] || STATUS.agendado;
            const encerrado = a.status === "cancelado" || a.status === "faltou";
            return (
              <div key={a.id} style={{ padding: "12px 14px", borderBottom: "1px solid #191919", display: "flex", alignItems: "center", gap: 12, opacity: encerrado ? .5 : 1 }}>
                <div style={{ flexShrink: 0, textAlign: "center", minWidth: 46 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: ".95rem", color: "#ffbf00", fontWeight: 600 }}>{(a.hora || "").slice(0, 5)}</div>
                  <div style={{ fontSize: ".6rem", color: "#555" }}>{a.duracao_min}min</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#ccc", fontSize: ".88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {clienteNome(a)}{!a.cliente_id && <span style={{ fontSize: ".62rem", color: "#777" }}> · avulso</span>}
                  </div>
                  <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.servico || "—"}{a.obs ? ` · ${a.obs}` : ""}
                  </div>
                </div>
                <select value={a.status} onChange={e => mudarStatus(a, e.target.value)}
                  style={{ ...inp, width: "auto", padding: "5px 8px", fontSize: ".72rem", color: st.cor, borderColor: "#2a2a2a", flexShrink: 0 }}>
                  {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
                <button style={{ ...btn("ghost"), padding: "5px 8px" }} onClick={() => abrir(a)}><Icon name="pencil" size={12} /></button>
                <button style={{ ...btn("danger"), padding: "5px 8px" }} onClick={() => excluir(a)}><Icon name="trash" size={12} /></button>
              </div>
            );
          })}
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <Modal title={`${editando ? "Editar" : "Novo"} agendamento`} onClose={() => setModal(false)}>
          <Field label={t("cliente")}>
            <select style={inp} value={form.clienteId} onChange={e => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">— Avulso (informe o nome) —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          {!form.clienteId && (
            <Field label="Nome (avulso)"><input style={inp} value={form.cliente_nome} placeholder="Nome de quem será atendido" onChange={e => setForm({ ...form, cliente_nome: e.target.value })} /></Field>
          )}
          <Field label="Serviço"><input style={inp} value={form.servico} placeholder={`Ex: ${t("atendimento")}`} onChange={e => setForm({ ...form, servico: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Field label="Data"><input style={inp} type="date" min={today()} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></Field>
            <Field label="Hora"><input style={inp} type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Field label="Duração (min)"><input style={inp} type="number" min="5" step="5" value={form.duracao_min} onChange={e => setForm({ ...form, duracao_min: e.target.value })} /></Field>
            <Field label="Status">
              <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Observações (opcional)"><input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} /></Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModal(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {confirmState && <Confirm msg={confirmState.msg} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default Agenda;
