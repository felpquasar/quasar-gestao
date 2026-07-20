import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { today } from '../../lib/utils';
import { inp, btn } from '../../styles/shared';
import Icon from '../ui/Icon';
import Field from '../ui/Field';
import Spinner from '../ui/Spinner';
import Confirm from '../ui/Confirm';
import EmptyState from '../ui/EmptyState';

// Evolução/prontuário por atendimento. agendamento_id é opcional — aceita
// registro avulso, sem forçar uso da agenda.
const Evolucao = ({ clienteId, evolucoes, setEvolucoes, agendamentos = [], notify }) => {
  const [form, setForm] = useState({ data: today(), agendamentoId: "", texto: "" });
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  const lista = evolucoes.filter(e => e.cliente_id === clienteId);
  const agendamentosCliente = agendamentos.filter(a => a.cliente_id === clienteId);

  const adicionar = async () => {
    if (!form.texto.trim()) { notify("Descreva a evolução.", "error"); return; }
    setSaving(true);
    const payload = {
      cliente_id: clienteId,
      agendamento_id: form.agendamentoId ? Number(form.agendamentoId) : null,
      data: form.data,
      texto: form.texto.trim(),
    };
    const { data, error } = await supabase.from("evolucoes").insert(payload).select().single();
    setSaving(false);
    if (error) { notify("Erro ao salvar evolução.", "error"); return; }
    setEvolucoes(prev => [data, ...prev]);
    setForm({ data: today(), agendamentoId: "", texto: "" });
    notify("Evolução registrada.");
  };

  const excluir = (id) => {
    setConfirmState({ msg: "Excluir este registro de evolução?", onConfirm: async () => {
      const { error } = await supabase.from("evolucoes").delete().eq("id", id);
      if (error) { notify("Erro ao excluir.", "error"); return; }
      setEvolucoes(prev => prev.filter(e => e.id !== id));
      notify("Registro excluído.");
    }});
  };

  return (
    <div>
      <div style={{ border: "1px solid #1d1d1d", borderRadius: 10, padding: 12, marginBottom: 14, background: "#121212" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Data"><input type="date" style={inp} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></Field>
          <Field label="Agendamento vinculado (opcional)">
            <select style={inp} value={form.agendamentoId} onChange={e => setForm({ ...form, agendamentoId: e.target.value })}>
              <option value="">— Avulso, sem agendamento —</option>
              {agendamentosCliente.map(a => <option key={a.id} value={a.id}>{a.data} {a.hora} — {a.servico || "sem serviço"}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Evolução"><textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.texto} onChange={e => setForm({ ...form, texto: e.target.value })} /></Field>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={btn("primary")} onClick={adicionar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : <><Icon name="plus" size={14} /> Registrar</>}</button>
        </div>
      </div>

      {lista.length === 0
        ? <EmptyState iconName="clipboard" title="Nenhuma evolução registrada" />
        : lista.map(e => (
          <div key={e.id} style={{ borderBottom: "1px solid #191919", padding: "10px 2px", display: "flex", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".72rem", color: "#555", marginBottom: 4 }}>{e.data}{e.agendamento_id ? " · vinculado a agendamento" : ""}</div>
              <div style={{ fontSize: ".85rem", color: "#ccc", whiteSpace: "pre-wrap" }}>{e.texto}</div>
            </div>
            <button style={{ ...btn("danger"), padding: "5px 8px", height: "fit-content" }} onClick={() => excluir(e.id)}><Icon name="trash" size={12} /></button>
          </div>
        ))}

      {confirmState && <Confirm msg={confirmState.msg} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default Evolucao;
