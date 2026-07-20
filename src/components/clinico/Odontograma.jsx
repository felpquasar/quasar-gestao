import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { inp, btn } from '../../styles/shared';
import Modal from '../ui/Modal';
import Field from '../ui/Field';
import Spinner from '../ui/Spinner';

// Numeração FDI, dentes permanentes (32). Ordem de exibição: arcada superior
// da direita do paciente pra esquerda, depois inferior da esquerda pra direita
// (convenção odontológica padrão de leitura em ficha).
const ARCADA_SUP = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const ARCADA_INF = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const FACES = [["vestibular", "Vestibular"], ["oclusal", "Oclusal"], ["lingual", "Lingual/Palatina"], ["mesial", "Mesial"], ["distal", "Distal"]];
const CONDICOES = [["higido", "Hígido"], ["cariado", "Cariado"], ["restaurado", "Restaurado"], ["ausente", "Ausente"], ["extraido", "Extraído"], ["implante", "Implante"]];
const COR_CONDICAO = { higido: "#333", cariado: "#e05a5a", restaurado: "#6b9fd4", ausente: "#3a3a3a", extraido: "#e8a020", implante: "#4caf82" };

const piorCondicao = (faces = {}) => {
  const ordem = ["extraido", "ausente", "cariado", "implante", "restaurado", "higido"];
  const presentes = Object.values(faces).filter(Boolean);
  if (presentes.length === 0) return null;
  return ordem.find(c => presentes.includes(c)) || presentes[0];
};

const Odontograma = ({ clienteId, odontogramas, setOdontogramas, notify }) => {
  const [editando, setEditando] = useState(null); // dente_numero
  const [faceForm, setFaceForm] = useState({});
  const [statusGeral, setStatusGeral] = useState("");
  const [saving, setSaving] = useState(false);

  const registro = (numero) => odontogramas.find(o => o.cliente_id === clienteId && o.dente_numero === numero);

  const abrir = (numero) => {
    const r = registro(numero);
    setEditando(numero);
    setFaceForm(r?.faces || {});
    setStatusGeral(r?.status_geral || "");
  };

  const salvar = async () => {
    setSaving(true);
    const existente = registro(editando);
    const payload = { faces: faceForm, status_geral: statusGeral || null, atualizado_em: new Date().toISOString() };
    if (existente) {
      const { data, error } = await supabase.from("odontogramas").update(payload).eq("id", existente.id).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setOdontogramas(prev => prev.map(o => o.id === existente.id ? data : o));
    } else {
      const { data, error } = await supabase.from("odontogramas").insert({ ...payload, cliente_id: clienteId, dente_numero: editando }).select().single();
      setSaving(false); if (error) { notify("Erro ao salvar.", "error"); return; }
      setOdontogramas(prev => [...prev, data]);
    }
    setEditando(null); notify(`Dente ${editando} atualizado.`);
  };

  const Dente = ({ numero }) => {
    const r = registro(numero);
    const cond = piorCondicao(r?.faces);
    return (
      <button onClick={() => abrir(numero)} title={`Dente ${numero}`}
        style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${cond ? COR_CONDICAO[cond] : "#252520"}`,
          background: cond ? COR_CONDICAO[cond] + "22" : "#121212", color: cond ? COR_CONDICAO[cond] : "#666",
          fontSize: ".68rem", cursor: "pointer", flexShrink: 0 }}>
        {numero}
      </button>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", minWidth: "max-content" }}>
          {ARCADA_SUP.map(n => <Dente key={n} numero={n} />)}
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", minWidth: "max-content" }}>
          {ARCADA_INF.map(n => <Dente key={n} numero={n} />)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, fontSize: ".7rem", color: "#777" }}>
        {CONDICOES.map(([v, label]) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_CONDICAO[v] }} /> {label}
          </span>
        ))}
      </div>

      {editando && (
        <Modal title={`Dente ${editando}`} onClose={() => setEditando(null)}>
          {FACES.map(([v, label]) => (
            <Field key={v} label={label}>
              <select style={inp} value={faceForm[v] || ""} onChange={e => setFaceForm(prev => ({ ...prev, [v]: e.target.value }))}>
                <option value="">— Sem registro —</option>
                {CONDICOES.map(([cv, cl]) => <option key={cv} value={cv}>{cl}</option>)}
              </select>
            </Field>
          ))}
          <Field label="Observações"><input style={inp} value={statusGeral} onChange={e => setStatusGeral(e.target.value)} /></Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setEditando(null)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Odontograma;
