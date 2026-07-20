import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { inp, btn } from '../../styles/shared';
import Field from '../ui/Field';
import Spinner from '../ui/Spinner';

const campoVazio = { queixa_principal: "", historico_medico: "", alergias: "", medicamentos: "", observacoes: "" };

// Anamnese: 1 registro por cliente (upsert em cima da unique(tenant_id, cliente_id)).
const Anamnese = ({ clienteId, anamneses, setAnamneses, notify }) => {
  const existente = anamneses.find(a => a.cliente_id === clienteId);
  const [form, setForm] = useState(campoVazio);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(existente
      ? { ...campoVazio, ...(existente.dados || {}), observacoes: existente.observacoes || "" }
      : campoVazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const salvar = async () => {
    setSaving(true);
    const payload = {
      dados: {
        queixa_principal: form.queixa_principal,
        historico_medico: form.historico_medico,
        alergias: form.alergias,
        medicamentos: form.medicamentos,
      },
      observacoes: form.observacoes,
    };
    if (existente) {
      const { data, error } = await supabase.from("anamneses").update(payload).eq("id", existente.id).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar anamnese.", "error"); return; }
      setAnamneses(prev => prev.map(a => a.id === existente.id ? data : a));
    } else {
      const { data, error } = await supabase.from("anamneses").insert({ ...payload, cliente_id: clienteId }).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar anamnese.", "error"); return; }
      setAnamneses(prev => [...prev, data]);
    }
    notify("Anamnese salva.");
  };

  return (
    <div>
      <Field label="Queixa principal"><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.queixa_principal} onChange={e => setForm({ ...form, queixa_principal: e.target.value })} /></Field>
      <Field label="Histórico médico"><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.historico_medico} onChange={e => setForm({ ...form, historico_medico: e.target.value })} /></Field>
      <Field label="Alergias"><input style={inp} value={form.alergias} onChange={e => setForm({ ...form, alergias: e.target.value })} /></Field>
      <Field label="Medicamentos em uso"><input style={inp} value={form.medicamentos} onChange={e => setForm({ ...form, medicamentos: e.target.value })} /></Field>
      <Field label="Observações"><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={btn("primary")} onClick={salvar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar anamnese"}</button>
      </div>
    </div>
  );
};

export default Anamnese;
