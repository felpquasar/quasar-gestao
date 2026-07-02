import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Carrega o plano EFETIVO da loja ativa (resolve trial vencido/cancelado no
// banco via current_plano). Default 'nucleo' enquanto carrega ou sem tenant.
export function usePlano(tenantId) {
  const [plano, setPlano] = useState("nucleo");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!tenantId) { setPlano("nucleo"); setCarregando(true); return; }
    let ativo = true;
    setCarregando(true);
    supabase.rpc("current_plano").then(({ data }) => {
      if (!ativo) return;
      setPlano(data || "nucleo");
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [tenantId]);

  return { plano, carregando };
}
