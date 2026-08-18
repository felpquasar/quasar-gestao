import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { inp, btn } from "../../styles/shared";
import { LIMITES, PLANO_LABEL } from "../../lib/planos";
import Icon from "./Icon";
import Modal from "./Modal";
import Spinner from "./Spinner";

// Botão no header que abre a lista de lojas do dono e permite trocar a
// ativa, ou criar uma nova dentro do limite do plano (LIMITES.unidades).
const LojaSwitcher = ({ lojas, tenantId, onTrocar, notify }) => {
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erro, setErro] = useState("");

  if (lojas.length === 0) return null;
  const atual = lojas.find(l => l.tenant_id === tenantId);
  const limite = Math.max(...lojas.map(l => LIMITES[l.plano]?.unidades ?? 1));
  const noLimite = lojas.length >= limite;

  const trocar = async (l) => {
    if (l.tenant_id === tenantId) { setAberto(false); return; }
    setTrocando(l.tenant_id);
    const { error } = await supabase.rpc("trocar_loja_ativa", { p_tenant_id: l.tenant_id });
    setTrocando(null);
    if (error) { notify(error.message, "error"); return; }
    setAberto(false);
    onTrocar(l.tenant_id);
  };

  const criar = async (e) => {
    e.preventDefault();
    if (!nomeNovo.trim()) return;
    setCriando(true); setErro("");
    const { data, error } = await supabase.rpc("create_tenant", { nome_barbearia: nomeNovo.trim() });
    setCriando(false);
    if (error) { setErro(error.message); return; }
    setNomeNovo("");
    setAberto(false);
    onTrocar(data);
  };

  return (
    <>
      <button onClick={() => setAberto(true)} title="Trocar de loja"
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid #222", background: "transparent", color: "#999", cursor: "pointer", fontSize: ".78rem", maxWidth: 160 }}>
        <Icon name="box" size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{atual?.nome ?? "Loja"}</span>
        {lojas.length > 1 && <Icon name="chevron" size={12} />}
      </button>

      {aberto && (
        <Modal title="Minhas lojas" onClose={() => setAberto(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
            {lojas.map(l => (
              <button key={l.tenant_id} onClick={() => trocar(l)} disabled={trocando === l.tenant_id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 8, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${l.tenant_id === tenantId ? "#c9a84c" : "#252520"}`,
                  background: l.tenant_id === tenantId ? "#c9a84c15" : "#141414" }}>
                <div>
                  <div style={{ color: l.tenant_id === tenantId ? "#e0d6b8" : "#ccc", fontWeight: 500, fontSize: ".9rem" }}>{l.nome}</div>
                  <div style={{ color: "#666", fontSize: ".72rem", marginTop: 2 }}>{PLANO_LABEL[l.plano] ?? l.plano}</div>
                </div>
                {trocando === l.tenant_id ? <Spinner size={14} /> : l.tenant_id === tenantId && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #222", paddingTop: 16 }}>
            {noLimite ? (
              <div style={{ color: "#888", fontSize: ".82rem" }}>
                Limite de {limite} loja{limite !== 1 ? "s" : ""} do seu plano atingido. Fale com a gente pra liberar mais.
              </div>
            ) : (
              <form onSubmit={criar} style={{ display: "flex", gap: 8 }}>
                <input value={nomeNovo} onChange={e => setNomeNovo(e.target.value)} placeholder="Nome da nova loja" style={{ ...inp, flex: 1 }} />
                <button type="submit" disabled={criando || !nomeNovo.trim()} style={btn("ghost")}>
                  {criando ? <Spinner size={14} /> : <><Icon name="plus" size={14} /> Criar</>}
                </button>
              </form>
            )}
            {erro && <div style={{ color: "#e05a5a", fontSize: ".78rem", marginTop: 8 }}>{erro}</div>}
          </div>
        </Modal>
      )}
    </>
  );
};

export default LojaSwitcher;
