import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { inp } from "../styles/shared";
import { validarSenha, REGRA_SENHA } from "../lib/senha";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";
import Turnstile from "./ui/Turnstile";

const LOGO = "/logo.png";
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const Login = ({ onLogin }) => {
  const [modo, setModo] = useState("login"); // "login" | "signup" | "recuperar"
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef(null);

  const isSignup = modo === "signup";
  const isRecuperar = modo === "recuperar";

  // Token do Turnstile é de uso único — sempre pedir um novo depois de
  // qualquer tentativa (sucesso ou erro) ou troca de modo.
  const resetCaptcha = () => {
    setCaptchaToken("");
    turnstileRef.current?.reset();
  };

  const trocarModo = () => {
    setModo(isSignup ? "login" : "signup");
    setErro(""); setInfo(""); resetCaptcha();
  };

  const abrirRecuperar = () => {
    setModo("recuperar");
    setErro(""); setInfo(""); resetCaptcha();
  };

  const enviarRecuperacao = async (e) => {
    e?.preventDefault();
    if (!email) { setErro("Informe seu email."); return; }
    if (!captchaToken) { setErro("Aguarde a verificação de segurança carregar."); return; }
    setLoading(true); setErro(""); setInfo("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { captchaToken });
    setLoading(false); resetCaptcha();
    if (error) { setErro(error.message || "Não foi possível enviar o email."); return; }
    setInfo("Se esse email tiver cadastro, enviamos um link pra redefinir a senha.");
  };

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (isRecuperar) return enviarRecuperacao(e);
    if (!email || !senha) { setErro("Preencha email e senha."); return; }
    if (!captchaToken) { setErro("Aguarde a verificação de segurança carregar."); return; }
    setLoading(true); setErro(""); setInfo("");

    if (isSignup) {
      const erroSenha = validarSenha(senha);
      if (erroSenha) { setLoading(false); setErro(erroSenha); return; }
      const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { captchaToken } });
      setLoading(false); resetCaptcha();
      if (error) { setErro(error.message || "Não foi possível criar a conta."); return; }
      // Confirmação de email ligada: sem sessão imediata.
      if (!data.session) {
        setInfo("Conta criada. Confirme o email para entrar.");
        setModo("login");
        return;
      }
      onLogin(data.session); // gate pós-login cria a barbearia
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha, options: { captchaToken } });
    setLoading(false); resetCaptcha();
    if (error) { setErro("Email ou senha incorretos."); return; }
    onLogin(data.session);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#080806", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img src={LOGO} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", display: "block", margin: "0 auto 1.5rem" }} />
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "2.2rem", letterSpacing: "-.01em", color: "#c9a84c", lineHeight: 1 }}>Quasar Gestão</div>
          <div style={{ fontSize: ".75rem", color: "#444", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>{isSignup ? "Criar conta · Acesso antecipado" : isRecuperar ? "Recuperar senha" : "Sistema de Gestão"}</div>
        </div>
        <form onSubmit={handleLogin} style={{ borderTop: "1px solid #1a1915", paddingTop: "2rem", marginTop: ".75rem" }}>
          <div style={{ marginBottom: isRecuperar ? "1.5rem" : "1.25rem" }}>
            <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Email</label>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#444" }}><Icon name="mail" size={15} /></div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                style={{ ...inp, paddingLeft: 34, background: "#0a0a08", border: "1px solid #252520" }} />
            </div>
          </div>
          {!isRecuperar && (
            <div style={{ marginBottom: ".6rem" }}>
              <label style={{ display: "block", fontSize: ".72rem", color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Senha</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#444" }}><Icon name="lock" size={15} /></div>
                <input type={mostrar ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••"
                  style={{ ...inp, paddingLeft: 34, paddingRight: 38, background: "#0a0a08", border: "1px solid #252520" }} />
                <button type="button" onClick={() => setMostrar(p => !p)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#444", cursor: "pointer" }}>
                  <Icon name={mostrar ? "eyeoff" : "eye"} size={15} />
                </button>
              </div>
              {isSignup && <div style={{ fontSize: ".7rem", color: "#555", marginTop: 6 }}>{REGRA_SENHA}</div>}
            </div>
          )}
          {!isSignup && !isRecuperar && (
            <div style={{ textAlign: "right", marginBottom: "1rem" }}>
              <button type="button" onClick={abrirRecuperar}
                style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: ".76rem", padding: 0, textDecoration: "underline" }}>
                Esqueci minha senha
              </button>
            </div>
          )}
          {info && (
            <div style={{ background: "#0d2a16", border: "1px solid #1e5a35", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", color: "#5ae08a", fontSize: ".83rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={15} /> {info}
            </div>
          )}
          {erro && (
            <div style={{ background: "#2a0d0d", border: "1px solid #5a1e1e", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", color: "#e05a5a", fontSize: ".83rem", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="warn" size={15} /> {erro}
            </div>
          )}
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
            <Turnstile ref={turnstileRef} siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: "#ffbf00", color: "#0a0a08", fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading
              ? <><Spinner size={15} color="#0a0a08" /> {isRecuperar ? "Enviando..." : isSignup ? "Criando..." : "Entrando..."}</>
              : (isRecuperar ? "Enviar link de recuperação" : isSignup ? "Criar conta" : "Entrar")}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: ".8rem", color: "#666" }}>
          {isRecuperar
            ? <button type="button" onClick={() => { setModo("login"); setErro(""); setInfo(""); }}
                style={{ background: "none", border: "none", color: "#c9a84c", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, padding: 0 }}>
                Voltar para o login
              </button>
            : <>
                {isSignup ? "Já tem conta?" : "Sua barbearia ainda não usa?"}{" "}
                <button type="button" onClick={trocarModo}
                  style={{ background: "none", border: "none", color: "#c9a84c", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, padding: 0 }}>
                  {isSignup ? "Entrar" : "Criar conta"}
                </button>
              </>}
        </div>
      </div>
    </div>
  );
};

export default Login;
