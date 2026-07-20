import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Camada de tradução do vocabulário por segmento (arquitetura v2 §3.3).
// Carrega o dicionário do segmento da loja ativa + customizações da loja,
// e devolve `t(chave)` que resolve rótulo -> texto exibido.
//
// Regra de resolução: { ...segmento.termos, ...tenant.termos_customizados }.
// Fallback: chave inexistente devolve a própria chave (nunca quebra a tela).
//
// Uso: const { t } = useTermos(tenantId);  <h1>Novo {t('atendimento')}</h1>
export function useTermos(tenantId) {
  const [termos, setTermos] = useState({});
  const [segmento, setSegmento] = useState("barbearia");
  const [subSegmento, setSubSegmento] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!tenantId) { setTermos({}); setSegmento("barbearia"); setSubSegmento(null); setCarregando(true); return; }
    let ativo = true;
    setCarregando(true);

    (async () => {
      // segmento + customizações da loja ativa (RLS: tenants_self permite ler a própria)
      const { data: tenant } = await supabase
        .from("tenants")
        .select("segmento, sub_segmento, termos_customizados")
        .eq("id", tenantId)
        .single();

      const seg = tenant?.segmento || "barbearia";
      const custom = tenant?.termos_customizados || {};

      // dicionário do segmento (segmentos: leitura autenticada)
      const { data: segRow } = await supabase
        .from("segmentos")
        .select("termos")
        .eq("id", seg)
        .single();

      if (!ativo) return;
      setSegmento(seg);
      setSubSegmento(tenant?.sub_segmento || null);
      setTermos({ ...(segRow?.termos || {}), ...custom });
      setCarregando(false);
    })();

    return () => { ativo = false; };
  }, [tenantId]);

  // fallback devolve a chave -> tela nunca quebra por rótulo faltante
  const t = (chave) => termos[chave] ?? chave;

  return { t, segmento, subSegmento, termos, carregando };
}
