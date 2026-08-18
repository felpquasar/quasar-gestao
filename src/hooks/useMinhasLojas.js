import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Lista as lojas (tenants) que o usuário logado é dono, com plano e qual
// está ativa. Refaz a busca quando a loja ativa muda (troca/criação).
export function useMinhasLojas(tenantId) {
  const [lojas, setLojas] = useState([]);

  const recarregar = useCallback(() => {
    if (!tenantId) return;
    supabase.rpc("minhas_lojas").then(({ data }) => setLojas(data ?? []));
  }, [tenantId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { lojas, recarregarLojas: recarregar };
}
