import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

// Paralelo a useStore.js, não integrado nela: useStore dispara seu Promise.all
// incondicional pra todo tenant no mount, antes até de segmento estar resolvido.
// Aqui o carregamento só dispara quando segmento==='saude' — mantém tenant de
// barbearia/loja sem nenhuma chamada às tabelas clínicas.
export function useClinicoStore(tenantId, segmento, notify) {
  const [anamneses, setAnamneses] = useState([]);
  const [evolucoes, setEvolucoes] = useState([]);
  const [planosTratamento, setPlanosTratamento] = useState([]);
  const [fasesTratamento, setFasesTratamento] = useState([]);
  const [documentosClinicos, setDocumentosClinicos] = useState([]);
  const [odontogramas, setOdontogramas] = useState([]);
  const [loadingClinico, setLoadingClinico] = useState(false);

  // Id da chamada em curso — descarta resposta de load() antigo que resolve
  // depois de um load() mais novo (troca rápida de tenant/segmento).
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!tenantId || segmento !== "saude") return;
    const minhaChamada = ++loadIdRef.current;
    setLoadingClinico(true);
    try {
      const [an, ev, pt, ft, dc, od] = await Promise.all([
        supabase.from("anamneses").select("*").order("atualizado_em", { ascending: false }).limit(1000),
        supabase.from("evolucoes").select("*").order("data", { ascending: false }).limit(1000),
        supabase.from("planos_tratamento").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("fases_tratamento").select("*").order("ordem").limit(2000),
        supabase.from("documentos_clinicos").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("odontogramas").select("*").order("atualizado_em", { ascending: false }).limit(2000),
      ]);
      if (loadIdRef.current !== minhaChamada) return; // resposta obsoleta, ignora
      setAnamneses(an.data || []);
      setEvolucoes(ev.data || []);
      setPlanosTratamento(pt.data || []);
      setFasesTratamento(ft.data || []);
      setDocumentosClinicos(dc.data || []);
      setOdontogramas(od.data || []);
      const erro = an.error || ev.error || pt.error || ft.error || dc.error || od.error;
      if (erro) notify?.("Erro ao carregar dados clínicos: " + erro.message, "error");
    } catch {
      if (loadIdRef.current === minhaChamada) notify?.("Erro de conexão ao carregar dados clínicos.", "error");
    } finally {
      if (loadIdRef.current === minhaChamada) setLoadingClinico(false);
    }
    // notify recriado a cada render de App.js; não precisa disparar novo load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, segmento]);

  useEffect(() => {
    if (segmento !== "saude") {
      loadIdRef.current++; // invalida qualquer load() de segmento "saude" ainda em voo
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
    load,
  };
}
