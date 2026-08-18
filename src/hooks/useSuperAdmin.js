import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Checa se o usuário logado é super admin (allowlist em public.super_admins).
// Não depende de tenantId — é global ao usuário, não à loja.
export function useSuperAdmin(session) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!session) { setIsSuperAdmin(false); return; }
    let ativo = true;
    supabase.rpc("is_super_admin").then(({ data }) => { if (ativo) setIsSuperAdmin(!!data); });
    return () => { ativo = false; };
  }, [session]);

  return isSuperAdmin;
}
