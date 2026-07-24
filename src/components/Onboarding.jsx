import { useState } from "react";
import { supabase } from "../lib/supabase";
import { btn } from "../styles/shared";
import Icon from "./ui/Icon";
import Spinner from "./ui/Spinner";
import CATALOGO_QUASAR from "../data/catalogoQuasar";

const LOGO = "/logo.png";

const PASSOS = [
  { n: 1, label: "Produtos", icon: "box" },
  { n: 2, label: "Cliente", icon: "users" },
  { n: 3, label: "Venda", icon: "cart" },
];

// Wizard pós-cadastro da barbearia. Esta rodada implementa só o passo 1
// (importar o catálogo Quasar). Os passos 2 e 3 são feitos direto no sistema.
const Onboarding = ({ email, onLogout, onClose, onProdutosImportados }) => {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [importados, setImportados] = useState(0); // 0 = ainda não importou

  const importarCatalogo = async () => {
    setLoading(true); setErro("");
    const payload = CATALOGO_QUASAR.map(p => ({
      nome: p.nome, categoria: p.categoria, unidade: "un", estoque: 0, custo: p.custo, preco: p.preco,
    }));
    const { data, error } = await supabase.from("produtos").insert(payload).select();
    setLoading(false);
    if (error) {
      const msg = error.code === "23505" ? "Catálogo já foi importado anteriormente." : (error.message || "Não foi possível importar o catálogo.");
      setErro(msg);
      return;
    }
    onProdutosImportados?.(data || []);
    setImportados((data || []).length);
  };

  const concluido = importados > 0;

  return (
    <div style={{ minHeight: "100dvh", background: "#080806", display: "flex", flexDirection: "column" }}>
      {/* topo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "1rem 1.25rem", borderBottom: "1px solid #15140f" }}>
        <img src={LOGO} alt="logo" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
        <span style={{ fontFamily: "'Playfair Display',serif", fontSize: ".95rem", color: "#c9a84c" }}>Quasar Gestão</span>
        <div style={{ marginLeft: "auto", fontSize: ".75rem", color: "#555" }}>
          {email} · <button type="button" onClick={onLogout} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: ".75rem", padding: 0, textDecoration: "underline" }}>sair</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ width: "100%", maxWidth: 540 }}>
          {/* stepper */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: "2.5rem" }}>
            {PASSOS.map((p, i) => {
              const ativo = p.n === 1;
              const feito = p.n === 1 && concluido;
              return (
                <div key={p.n} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: feito ? "#c9a84c" : ativo ? "rgba(201,168,76,.12)" : "#121210",
                      border: `1px solid ${ativo || feito ? "#c9a84c" : "#222"}`,
                      color: feito ? "#080806" : ativo ? "#c9a84c" : "#555",
                    }}>
                      <Icon name={feito ? "check" : p.icon} size={17} />
                    </div>
                    <span style={{ fontSize: ".68rem", color: ativo || feito ? "#c9a84c" : "#555" }}>{p.label}</span>
                  </div>
                  {i < PASSOS.length - 1 && <div style={{ width: 48, height: 1, background: "#222", margin: "0 6px 20px" }} />}
                </div>
              );
            })}
          </div>

          {!concluido ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.5rem", color: "#e8e4d8", lineHeight: 1.15 }}>Comece com o catálogo Quasar</div>
                <div style={{ fontSize: ".85rem", color: "#777", marginTop: 10, lineHeight: 1.6 }}>
                  Carregue de uma vez os <b style={{ color: "#c9a84c" }}>{CATALOGO_QUASAR.length} produtos</b> da linha Quasar.
                  O estoque começa zerado e os preços são sugestões — você ajusta tudo depois em Estoque.
                </div>
              </div>

              {erro && (
                <div style={{ background: "#2a0d0d", border: "1px solid #5a1e1e", borderRadius: 8, padding: "10px 14px", marginBottom: "1rem", color: "#e05a5a", fontSize: ".83rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="warn" size={15} /> {erro}
                </div>
              )}

              <button type="button" onClick={importarCatalogo} disabled={loading}
                style={{ ...btn("primary"), width: "100%", justifyContent: "center", padding: "12px", fontSize: ".95rem" }}>
                {loading ? <><Spinner size={15} color="#0a0a08" /> Importando...</> : <><Icon name="download" size={16} /> Carregar catálogo ({CATALOGO_QUASAR.length} produtos)</>}
              </button>

              <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: ".8rem", textDecoration: "underline" }}>
                  Pular por agora
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(76,175,130,.12)", border: "1px solid #2e5a44", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", color: "#4caf82" }}>
                <Icon name="check" size={26} />
              </div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.5rem", color: "#e8e4d8" }}>{importados} produtos importados</div>
              <div style={{ fontSize: ".85rem", color: "#777", marginTop: 10, lineHeight: 1.6 }}>
                Próximos passos — feitos direto no sistema:<br />
                <b style={{ color: "#c9a84c" }}>Clientes</b> para cadastrar a primeira barbearia e <b style={{ color: "#c9a84c" }}>Vendas</b> para registrar o primeiro pedido.
              </div>
              <button type="button" onClick={onClose}
                style={{ ...btn("primary"), width: "100%", justifyContent: "center", padding: "12px", fontSize: ".95rem", marginTop: "1.75rem" }}>
                Ir para o sistema <Icon name="chevron" size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
