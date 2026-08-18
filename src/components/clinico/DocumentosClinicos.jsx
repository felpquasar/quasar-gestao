import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { inp, btn } from '../../styles/shared';
import Icon from '../ui/Icon';
import Field from '../ui/Field';
import Spinner from '../ui/Spinner';
import Confirm from '../ui/Confirm';
import EmptyState from '../ui/EmptyState';

const TIPOS = [{ v: "foto", label: "Foto intraoral" }, { v: "raio_x", label: "Radiografia" }, { v: "documento", label: "Documento" }];
const BUCKET = "documentos-clinicos";

// Bucket privado — nunca usar getPublicUrl aqui, sempre signed URL.
const DocumentosClinicos = ({ tenantId, clienteId, documentosClinicos, setDocumentosClinicos, notify }) => {
  const [tipo, setTipo] = useState("foto");
  const [legenda, setLegenda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [urls, setUrls] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const fileRef = useRef(null);

  const lista = documentosClinicos.filter(d => d.cliente_id === clienteId);
  // Chave estável pelos paths reais — lista.length não detecta troca (delete +
  // upload que mantém a contagem igual faria o efeito não disparar de novo).
  const chavesLista = lista.map(d => d.storage_path).join("|");

  useEffect(() => {
    let ativo = true;
    const faltando = lista.map(d => d.storage_path).filter(p => !urls[p]);
    if (faltando.length === 0) return;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(faltando, 3600);
      if (!ativo || !data) return;
      const novo = {};
      data.forEach(r => { if (r.signedUrl) novo[r.path] = r.signedUrl; });
      setUrls(prev => ({ ...prev, ...novo }));
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavesLista, clienteId]);

  const enviar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    const ext = file.name.split(".").pop();
    const path = `${tenantId}/${clienteId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) { setEnviando(false); notify("Erro ao enviar arquivo.", "error"); return; }
    const { data, error } = await supabase.from("documentos_clinicos")
      .insert({ cliente_id: clienteId, tipo, storage_path: path, legenda: legenda || null })
      .select().single();
    setEnviando(false);
    if (error) { notify("Erro ao salvar registro do arquivo.", "error"); return; }
    setDocumentosClinicos(prev => [data, ...prev]);
    setLegenda("");
    if (fileRef.current) fileRef.current.value = "";
    notify("Documento enviado.");
  };

  const excluir = (doc) => {
    setConfirmState({ msg: "Excluir este documento?", onConfirm: async () => {
      const { error: storageErro } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      const { error } = await supabase.from("documentos_clinicos").delete().eq("id", doc.id);
      if (error) {
        notify(storageErro ? "Erro ao excluir." : "Arquivo removido, mas o registro não pôde ser excluído — tente excluir de novo.", "error");
        return;
      }
      setDocumentosClinicos(prev => prev.filter(d => d.id !== doc.id));
      notify(storageErro ? "Registro excluído, mas o arquivo pode ter ficado no armazenamento." : "Documento excluído.", storageErro ? "error" : "ok");
    }});
  };

  return (
    <div>
      <div style={{ border: "1px solid #1d1d1d", borderRadius: 10, padding: 12, marginBottom: 14, background: "#121212" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Tipo">
            <select style={inp} value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Legenda (opcional)"><input style={inp} value={legenda} onChange={e => setLegenda(e.target.value)} /></Field>
        </div>
        <label style={{ ...btn("ghost"), cursor: enviando ? "default" : "pointer", opacity: enviando ? .6 : 1 }}>
          {enviando ? <><Spinner size={14} /> Enviando...</> : <><Icon name="camera" size={14} /> Escolher arquivo</>}
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={enviar} disabled={enviando} style={{ display: "none" }} />
        </label>
      </div>

      {lista.length === 0
        ? <EmptyState iconName="camera" title="Nenhum documento" />
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
            {lista.map(d => (
              <div key={d.id} style={{ border: "1px solid #1d1d1d", borderRadius: 10, overflow: "hidden", background: "#121212" }}>
                {urls[d.storage_path]
                  ? (d.storage_path.match(/\.pdf$/i)
                    ? <a href={urls[d.storage_path]} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 100, color: "#666" }}><Icon name="clipboard" size={28} /></a>
                    : <a href={urls[d.storage_path]} target="_blank" rel="noreferrer"><img src={urls[d.storage_path]} alt={d.legenda || d.tipo} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} /></a>)
                  : <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner size={16} /></div>}
                <div style={{ padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: ".68rem", color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.legenda || TIPOS.find(t => t.v === d.tipo)?.label}</span>
                  <button style={{ ...btn("danger"), padding: "3px 6px" }} onClick={() => excluir(d)}><Icon name="trash" size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      {confirmState && <Confirm msg={confirmState.msg} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default DocumentosClinicos;
