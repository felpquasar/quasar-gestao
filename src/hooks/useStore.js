import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

function useStore() {
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [contasPagar, setContasPagar] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [pedidosCompra, setPedidosCompra] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [pacotesCliente, setPacotesCliente] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, v, m, cr, cp, fn, pc, de, pk, pkc] = await Promise.all([
        supabase.from("produtos").select("*").order("nome"),
        supabase.from("clientes").select("*").order("nome"),
        supabase.from("vendas").select("*, venda_itens(*)").order("created_at", { ascending: false }),
        supabase.from("movimentos").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("contas_receber").select("*").order("data_vencimento", { ascending: true }),
        supabase.from("contas_pagar").select("*").order("data_vencimento", { ascending: true }),
        supabase.from("fornecedores").select("*").order("nome"),
        supabase.from("pedidos_compra").select("*, pedido_itens(*)").order("created_at", { ascending: false }),
        supabase.from("despesas").select("*").order("data", { ascending: false }),
        supabase.from("pacotes").select("*").order("nome"),
        supabase.from("pacotes_cliente").select("*, pacotes(nome), clientes(nome)").order("data_compra", { ascending: false }),
      ]);
      setProdutos(p.data || []); setClientes(c.data || []); setVendas(v.data || []); setMovimentos(m.data || []);
      setContasReceber(cr.data || []); setContasPagar(cp.data || []); setFornecedores(fn.data || []);
      setPedidosCompra(pc.data || []); setDespesas(de.data || []);
      setPacotes(pk.data || []); setPacotesCliente(pkc.data || []);
      const coreError = p.error || c.error || v.error || cr.error;
      if (coreError) notify("Erro ao carregar dados principais: " + coreError.message, "error");
    } catch { notify("Erro de conexão com o Supabase.", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { produtos, setProdutos, clientes, setClientes, vendas, setVendas, movimentos, setMovimentos, contasReceber, setContasReceber, contasPagar, setContasPagar, fornecedores, setFornecedores, pedidosCompra, setPedidosCompra, despesas, setDespesas, pacotes, setPacotes, pacotesCliente, setPacotesCliente, loading, toast, notify, load };
}

export default useStore;
