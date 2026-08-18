import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { inp, btn } from "../styles/shared";
import { PLANO_LABEL } from "../lib/planos";
import Spinner from "./ui/Spinner";

const STATUS_LABEL = { ativo: "Ativo", trial: "Trial", atrasado: "Atrasado", cancelado: "Cancelado" };

export default function Admin({ notify }) {
  const [tenants, setTenants] = useState(null);
  const [salvandoId, setSalvandoId] = useState(null);
  const [editado, setEditado] = useState({}); // { [tenant_id]: { plano, status, trial_expira_em } }

  const carregar = () => {
    supabase.rpc("admin_list_tenants").then(({ data, error }) => {
      if (error) { notify(error.message, "error"); return; }
      setTenants(data ?? []);
    });
  };

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const campo = (t, key) => editado[t.tenant_id]?.[key] ?? t[key] ?? (key === "plano" ? "nucleo" : key === "status" ? "ativo" : "");

  const setCampo = (tenantId, key, value) =>
    setEditado(prev => ({ ...prev, [tenantId]: { ...prev[tenantId], [key]: value } }));

  const salvar = async (t) => {
    setSalvandoId(t.tenant_id);
    const trial = campo(t, "trial_expira_em");
    const { error } = await supabase.rpc("admin_update_assinatura", {
      p_tenant_id: t.tenant_id,
      p_plano: campo(t, "plano"),
      p_status: campo(t, "status"),
      p_trial_expira_em: trial ? new Date(trial).toISOString() : null,
    });
    setSalvandoId(null);
    if (error) { notify(error.message, "error"); return; }
    notify("Assinatura atualizada.");
    setEditado(prev => { const p = { ...prev }; delete p[t.tenant_id]; return p; });
    carregar();
  };

  if (tenants === null) return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><Spinner size={28} /></div>;

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.3rem", color: "#e0d6b8", marginBottom: 4 }}>Admin — Tenants</h2>
      <p style={{ color: "#666", fontSize: ".82rem", marginBottom: "1.5rem" }}>{tenants.length} loja(s) cadastrada(s).</p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
          <thead>
            <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid #1e1e1e" }}>
              <th style={{ padding: "8px 10px" }}>Loja</th>
              <th style={{ padding: "8px 10px" }}>Segmento</th>
              <th style={{ padding: "8px 10px" }}>Usuários</th>
              <th style={{ padding: "8px 10px" }}>Plano</th>
              <th style={{ padding: "8px 10px" }}>Status</th>
              <th style={{ padding: "8px 10px" }}>Trial expira</th>
              <th style={{ padding: "8px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => {
              const sujo = !!editado[t.tenant_id];
              return (
                <tr key={t.tenant_id} style={{ borderBottom: "1px solid #161616" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ color: "#e0e0e0" }}>{t.nome}</div>
                    <div style={{ color: "#555", fontSize: ".72rem" }}>{t.emails || "sem usuário"}</div>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#999" }}>{t.segmento || "-"}{t.sub_segmento ? ` / ${t.sub_segmento}` : ""}</td>
                  <td style={{ padding: "8px 10px", color: "#999" }}>{t.qtd_usuarios}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <select style={{ ...inp, padding: "6px 8px", width: 130 }} value={campo(t, "plano")}
                      onChange={e => setCampo(t.tenant_id, "plano", e.target.value)}>
                      {Object.keys(PLANO_LABEL).map(p => <option key={p} value={p}>{PLANO_LABEL[p]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <select style={{ ...inp, padding: "6px 8px", width: 110 }} value={campo(t, "status")}
                      onChange={e => setCampo(t.tenant_id, "status", e.target.value)}>
                      {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <input type="date" style={{ ...inp, padding: "6px 8px", width: 140 }}
                      value={campo(t, "trial_expira_em") ? String(campo(t, "trial_expira_em")).slice(0, 10) : ""}
                      onChange={e => setCampo(t.tenant_id, "trial_expira_em", e.target.value)} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {sujo && (
                      <button style={btn("primary")} disabled={salvandoId === t.tenant_id} onClick={() => salvar(t)}>
                        {salvandoId === t.tenant_id ? <Spinner size={14} /> : "Salvar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
