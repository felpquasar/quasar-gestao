import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fmt, today } from '../../lib/utils';
import { inp, btn } from '../../styles/shared';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Field from '../ui/Field';
import Spinner from '../ui/Spinner';
import Confirm from '../ui/Confirm';
import EmptyState from '../ui/EmptyState';

const STATUS_LABEL = { ativo: "Ativo", concluido: "Concluído", cancelado: "Cancelado", pausado: "Pausado" };
const STATUS_COR = { ativo: "#4caf82", concluido: "#c9a84c", cancelado: "#e05a5a", pausado: "#e8a020" };
const FASE_LABEL = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };

// Plano de tratamento ortodôntico: cabeçalho + fases ordenadas. Só renderizado
// pra sub_segmento='dentista' (gate feito em Clientes.jsx, não aqui).
const PlanoTratamento = ({ clienteId, planosTratamento, setPlanosTratamento, fasesTratamento, setFasesTratamento, notify }) => {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ titulo: "", status: "ativo", data_inicio: today(), previsao_termino: "", valor_total: "", observacoes: "" });
  const [saving, setSaving] = useState(false);
  const [faseForm, setFaseForm] = useState({});
  const [confirmState, setConfirmState] = useState(null);

  const planos = planosTratamento.filter(p => p.cliente_id === clienteId);
  const fasesDe = (planoId) => fasesTratamento.filter(f => f.plano_tratamento_id === planoId).sort((a, b) => a.ordem - b.ordem);

  const abrir = (p = null) => {
    setEditando(p);
    setForm(p
      ? { titulo: p.titulo, status: p.status, data_inicio: p.data_inicio || "", previsao_termino: p.previsao_termino || "", valor_total: p.valor_total != null ? String(p.valor_total) : "", observacoes: p.observacoes || "" }
      : { titulo: "", status: "ativo", data_inicio: today(), previsao_termino: "", valor_total: "", observacoes: "" });
    setModal(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { notify("Dê um título ao plano.", "error"); return; }
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(), status: form.status,
      data_inicio: form.data_inicio || null, previsao_termino: form.previsao_termino || null,
      valor_total: form.valor_total !== "" ? Number(form.valor_total) : null,
      observacoes: form.observacoes || null,
    };
    if (editando) {
      const { data, error } = await supabase.from("planos_tratamento").update(payload).eq("id", editando.id).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setPlanosTratamento(prev => prev.map(p => p.id === editando.id ? data : p));
    } else {
      const { data, error } = await supabase.from("planos_tratamento").insert({ ...payload, cliente_id: clienteId }).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setPlanosTratamento(prev => [data, ...prev]);
    }
    setModal(false); notify("Plano de tratamento salvo.");
  };

  const excluirPlano = (id) => {
    setConfirmState({ msg: "Excluir este plano de tratamento e suas fases?", onConfirm: async () => {
      const { error } = await supabase.from("planos_tratamento").delete().eq("id", id);
      if (error) { notify("Erro ao excluir.", "error"); return; }
      setPlanosTratamento(prev => prev.filter(p => p.id !== id));
      setFasesTratamento(prev => prev.filter(f => f.plano_tratamento_id !== id));
      notify("Plano excluído.");
    }});
  };

  const adicionarFase = async (planoId) => {
    const nome = (faseForm[planoId]?.nome || "").trim();
    if (!nome) { notify("Dê um nome à fase.", "error"); return; }
    const ordem = fasesDe(planoId).length + 1;
    const { data, error } = await supabase.from("fases_tratamento")
      .insert({ plano_tratamento_id: planoId, ordem, nome, previsao_data: faseForm[planoId]?.previsao_data || null })
      .select().single();
    if (error) { notify("Erro ao adicionar fase.", "error"); return; }
    setFasesTratamento(prev => [...prev, data]);
    setFaseForm(prev => ({ ...prev, [planoId]: { nome: "", previsao_data: "" } }));
  };

  const avancarFase = async (fase) => {
    const proximo = fase.status === "pendente" ? "em_andamento" : "concluida";
    const payload = { status: proximo, concluida_em: proximo === "concluida" ? today() : null };
    const { data, error } = await supabase.from("fases_tratamento").update(payload).eq("id", fase.id).select().single();
    if (error) { notify("Erro ao atualizar fase.", "error"); return; }
    setFasesTratamento(prev => prev.map(f => f.id === fase.id ? data : f));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button style={btn("ghost")} onClick={() => abrir()}><Icon name="plus" size={14} /> Novo plano</button>
      </div>

      {planos.length === 0
        ? <EmptyState iconName="tooth" title="Nenhum plano de tratamento" />
        : planos.map(p => (
          <div key={p.id} style={{ border: "1px solid #1d1d1d", borderRadius: 10, padding: 12, marginBottom: 10, background: "#121212" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: ".9rem", fontWeight: 600, color: "#ccc" }}>{p.titulo}</div>
                <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2 }}>
                  {p.data_inicio && `início ${p.data_inicio}`}{p.previsao_termino && ` · previsão ${p.previsao_termino}`}{p.valor_total != null ? ` · ${fmt(p.valor_total)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: ".65rem", padding: "2px 7px", borderRadius: 4, background: STATUS_COR[p.status] + "22", color: STATUS_COR[p.status], fontWeight: 700 }}>{STATUS_LABEL[p.status]}</span>
                <button style={{ ...btn("ghost"), padding: "5px 8px" }} onClick={() => abrir(p)}><Icon name="pencil" size={12} /></button>
                <button style={{ ...btn("danger"), padding: "5px 8px" }} onClick={() => excluirPlano(p.id)}><Icon name="trash" size={12} /></button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {fasesDe(p.id).map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#0e0e0e", borderRadius: 6 }}>
                  <span style={{ fontSize: ".72rem", color: "#555", width: 18 }}>{f.ordem}.</span>
                  <span style={{ flex: 1, fontSize: ".8rem", color: "#ccc" }}>{f.nome}{f.previsao_data && <span style={{ color: "#555", fontSize: ".7rem" }}> · previsão {f.previsao_data}</span>}</span>
                  <span style={{ fontSize: ".65rem", color: "#777" }}>{FASE_LABEL[f.status]}</span>
                  {f.status !== "concluida" && (
                    <button style={{ ...btn("ghost"), padding: "3px 8px", fontSize: ".7rem" }} onClick={() => avancarFase(f)}>
                      {f.status === "pendente" ? "Iniciar" : "Concluir"}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder="Nova fase..." style={{ ...inp, flex: 1, padding: "7px 10px", fontSize: ".8rem" }}
                value={faseForm[p.id]?.nome || ""} onChange={e => setFaseForm(prev => ({ ...prev, [p.id]: { ...prev[p.id], nome: e.target.value } }))} />
              <input type="date" style={{ ...inp, width: 140, padding: "7px 10px", fontSize: ".8rem" }}
                value={faseForm[p.id]?.previsao_data || ""} onChange={e => setFaseForm(prev => ({ ...prev, [p.id]: { ...prev[p.id], previsao_data: e.target.value } }))} />
              <button style={{ ...btn("ghost"), padding: "7px 10px" }} onClick={() => adicionarFase(p.id)}><Icon name="plus" size={13} /></button>
            </div>
          </div>
        ))}

      {modal && (
        <Modal title={`${editando ? "Editar" : "Novo"} plano de tratamento`} onClose={() => setModal(false)}>
          <Field label="Título"><input style={inp} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Início"><input type="date" style={inp} value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></Field>
            <Field label="Previsão de término"><input type="date" style={inp} value={form.previsao_termino} onChange={e => setForm({ ...form, previsao_termino: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Status">
              <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Valor total (R$)"><input type="number" step=".01" min="0" style={inp} value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} /></Field>
          </div>
          <Field label="Observações"><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></Field>
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

export default PlanoTratamento;
