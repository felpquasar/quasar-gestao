import { can, planoQueDestrava } from "../../lib/planos";
import Icon from "./Icon";

// Libera o conteúdo se o plano cobre a feature; senão mostra o upsell.
// Sem context: recebe `plano` por prop (padrão do projeto é props, não context).
export function Gate({ plano, feature, titulo, children }) {
  return can(plano, feature) ? children : <Upsell feature={feature} titulo={titulo} />;
}

export function Upsell({ feature, titulo }) {
  const necessario = planoQueDestrava(feature);
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "3rem 1.5rem", maxWidth: 460, margin: "2rem auto", background: "#141414", border: "1px solid #222", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "rgba(255,191,0,.08)", color: "#ffbf00", marginBottom: 18 }}>
        <Icon name="lock" size={26} />
      </div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.25rem", color: "#c9a84c", marginBottom: 8 }}>
        {titulo || "Recurso bloqueado"}
      </h2>
      <p style={{ fontSize: ".88rem", color: "#888", lineHeight: 1.55, marginBottom: 22 }}>
        {necessario
          ? <>Disponível a partir do plano <strong style={{ color: "#e0d6b8" }}>{necessario}</strong>. Faça o upgrade pra liberar.</>
          : "Este recurso não está incluído no seu plano atual."}
      </p>
      <a href="https://wa.me/" target="_blank" rel="noreferrer"
        style={{ padding: "11px 22px", borderRadius: 6, background: "#ffbf00", color: "#0a0a08", fontSize: ".85rem", fontWeight: 700, textDecoration: "none" }}>
        Fazer upgrade
      </a>
    </div>
  );
}

export default Gate;
