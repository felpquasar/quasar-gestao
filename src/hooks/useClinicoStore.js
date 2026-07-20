import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// Paralelo a useStore.js, não integrado nela: useStore dispara seu Promise.all
// incondicional pra todo tenant no mount, antes até de segmento estar resolvido.
// Aqui o carregamento só dispara quando segmento==='saude' — mantém tenant de
// barbearia/loja sem nenhuma chamada às tabelas clínicas.
export function useClinicoStore(tenantId, segmento) {
  const [anamneses, setAnamneses] = useState([]);
  const [evolucoes, setEvolucoes] = useState([]);
  const [planosTratamento, setPlanosTratamento] = useState([]);
  const [fasesTratamento, setFasesTratamento] = useState([]);
  const [documentosClinicos, setDocumentosClinicos] = useState([]);
  const [odontogramas, setOdontogramas] = useState([]);
  const [loadingClinico, setLoadingClinico] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || segmento !== "saude") return;
    setLoadingClinico(true);
    try {
      const [an, ev, pt, ft, dc, od] = await Promise.all([
        supabase.from("anamneses").select("*"),
        supabase.from("evolucoes").select("*").order("data", { ascending: false }),
        supabase.from("planos_tratamento").select("*").order("created_at", { ascending: false }),
        supabase.from("fases_tratamento").select("*").order("ordem"),
        supabase.from("documentos_clinicos").select("*").order("created_at", { ascending: false }),
        supabase.from("odontogramas").select("*"),
      ]);
      setAnamneses(an.data || []);
      setEvolucoes(ev.data || []);
      setPlanosTratamento(pt.data || []);
      setFasesTratamento(ft.data || []);
      setDocumentosClinicos(dc.data || []);
      setOdontogramas(od.data || []);
    } finally {
      setLoadingClinico(false);
    }
  }, [tenantId, segmento]);

  useEffect(() => {
    if (segmento !== "saude") {
      setAnamneses([]); setEvolucoes([]); setPlanosTratamento([]);
      setFasesTratamento([]); setDocumentosClinicos([]); setOdontogramas([]);
      return;
    }
    load();
  }, [load, segmento]);

  return {
    anamneses, setAnamneses,
    evolucoes, setEvolucoes,
    planosTratamento, setPlanosTratamento,
    fasesTratamento, setFasesTratamento,
    documentosClinicos, setDocumentosClinicos,
    odontogramas, setOdontogramas,
    loadingClinico,
  };
}
