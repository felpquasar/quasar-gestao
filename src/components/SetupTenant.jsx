import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { inp, btn } from "../styles/shared";
import { SUB_SEGMENTO_LABEL } from "../lib/clinico";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";

const SUB_SEGMENTOS = ["dentista", "fisio", "nutri"];

const LOGO = "/logo.png";

// Gate pós-login: usuário autenticado mas sem barbearia (tenant) vinculada.
// Passo 1: escolhe o segmento (dita o vocabulário do app, arquitetura v2 §7.1).
// Passo 2: nome do negócio. Cria o tenant via RPC e segue para o app.
const SetupTenant = ({ email, onReady, onLogout }) => {
  const [segmentos, setSegmentos] = useState([]);
  const [carregandoSegmentos, setCarregandoSegmentos] = useState(true);
  const [segmento, setSegmento] = useState("");
  const [subSegmento, setSubSegmento] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("segmentos").select("id, nome").eq("ativo", true).order("nome");
      setSegmentos(data || []);
      if (data?.length === 1) setSegmento(data[0].id);
      setCarregandoSegmentos(false);
    })();
  }, []);

  const criar = async (e) => {
    e?.preventDefault();
    if (!segmento) { setErro("Escolha o tipo de negócio."); return; }
    if (segmento === "saude" && !subSegmento) { setErro("Escolha a especialidade."); return; }
    if (!nome.trim()) { setErro("Informe o nome do negócio."); return; }
    setLoading(true); setErro("");
    const { data, error } = await supabase.rpc("create_tenant", {
      nome_barbearia: nome.trim(),
      p_segmento: segmento,
      p_sub_segmento: segmento === "saude" ? subSegmento : null,
    });
    setLoading(false);
    if (error) { setErro(error.message || "Não foi possível criar o negócio."); return; }
    onReady(data); // tenant_id
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#080806", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <img src={LOGO} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", display: "block", margin: "0 auto 1.25rem" }} />
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", lineHeight: 1.1 }}>Bem-vindo à Quasar</div>
          <div style={{ fontSize: ".85rem", color: "#777", marginTop: 8 }}>Vamos configurar o seu negócio para começar.</div>
        </div>
        <form onSubmit={criar} style={{ borderTop: "1px solid #1a1915", paddingTop: "1.75rem" }}>
          <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Tipo de negócio</label>
          {carregandoSegmentos ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: "#666", fontSize: ".85rem", marginBottom: "1.25rem" }}>
              <Spinner size={14} /> Carregando opções...
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1.25rem" }}>
              {segmentos.map(s => (
                <button type="button" key={s.id} onClick={() => setSegmento(s.id)}
                  style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: ".85rem",
                    border: `1px solid ${segmento === s.id ? "#c9a84c" : "#252520"}`,
                    background: segmento === s.id ? "#c9a84c22" : "#0a0a08",
                    color: segmento === s.id ? "#c9a84c" : "#aaa", fontWeight: segmento === s.id ? 600 : 400 }}>
                  {s.nome}
                </button>
              ))}
            </div>
          )}
          {segmento === "saude" && (
            <>
              <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Especialidade</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: "1.25rem" }}>
                {SUB_SEGMENTOS.map(s => (
                  <button type="button" key={s} onClick={() => setSubSegmento(s)}
                    style={{ padding: "10px 8px", borderRadius: 8, cursor: "pointer", textAlign: "center", fontSize: ".8rem",
                      border: `1px solid ${subSegmento === s ? "#c9a84c" : "#252520"}`,
                      background: subSegmento === s ? "#c9a84c22" : "#0a0a08",
                      color: subSegmento === s ? "#c9a84c" : "#aaa", fontWeight: subSegmento === s ? 600 : 400 }}>
                    {SUB_SEGMENTO_LABEL[s]}
                  </button>
                ))}
              </div>
            </>
          )}
          <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Nome do negócio</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Barbearia do Zé"
            style={{ ...inp, background: "#0a0a08", border: "1px solid #252520", marginBottom: "1.25rem" }} />
          {erro && (
            <div style={{ background: "#2a0d0d", border: "1px solid #5a1e1e", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", color: "#e05a5a", fontSize: ".83rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="warn" size={15} /> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ ...btn("primary"), width: "100%", justifyContent: "center", padding: "11px", fontSize: ".95rem" }}>
            {loading ? <><Spinner size={15} color="#0a0a08" /> Criando...</> : "Criar e entrar"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: ".75rem", color: "#555" }}>
          {email} · <button type="button" onClick={onLogout} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: ".75rem", padding: 0, textDecoration: "underline" }}>sair</button>
        </div>
      </div>
    </div>
  );
};

export default SetupTenant;
