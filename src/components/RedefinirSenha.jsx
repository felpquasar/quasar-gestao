import { useState } from "react";
import { supabase } from "../lib/supabase";
import { inp } from "../styles/shared";
import { validarSenha, REGRA_SENHA } from "../lib/senha";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";

const LOGO = "/logo.png";

// Renderizado quando supabase.auth detecta um link de recuperação (evento
// PASSWORD_RECOVERY) na URL — já existe sessão, só falta definir a nova senha.
const RedefinirSenha = ({ onDone }) => {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async (e) => {
    e?.preventDefault();
    const erroSenha = validarSenha(senha);
    if (erroSenha) { setErro(erroSenha); return; }
    if (senha !== confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true); setErro("");
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) { setErro(error.message || "Não foi possível salvar a nova senha."); return; }
    onDone();
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#080806", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img src={LOGO} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", display: "block", margin: "0 auto 1.5rem" }} />
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "2.2rem", letterSpacing: "-.01em", color: "#c9a84c", lineHeight: 1 }}>Quasar Gestão</div>
          <div style={{ fontSize: ".75rem", color: "#444", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>Definir nova senha</div>
        </div>
        <form onSubmit={salvar} style={{ borderTop: "1px solid #1a1915", paddingTop: "2rem", marginTop: ".75rem" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Nova senha</label>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#444" }}><Icon name="lock" size={15} /></div>
              <input type={mostrar ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••"
                style={{ ...inp, paddingLeft: 34, paddingRight: 38, background: "#0a0a08", border: "1px solid #252520" }} />
              <button type="button" onClick={() => setMostrar(p => !p)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#444", cursor: "pointer" }}>
                <Icon name={mostrar ? "eyeoff" : "eye"} size={15} />
              </button>
            </div>
            <div style={{ fontSize: ".7rem", color: "#555", marginTop: 6 }}>{REGRA_SENHA}</div>
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Confirmar senha</label>
            <input type={mostrar ? "text" : "password"} value={confirmar} onChange={e => setConfirmar(e.target.value)} placeholder="••••••••"
              style={{ ...inp, background: "#0a0a08", border: "1px solid #252520" }} />
          </div>
          {erro && (
            <div style={{ background: "#2a0d0d", border: "1px solid #5a1e1e", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", color: "#e05a5a", fontSize: ".83rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="warn" size={15} /> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "#ffbf00", color: "#0a0a08", fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <><Spinner size={15} color="#0a0a08" /> Salvando...</> : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RedefinirSenha;
