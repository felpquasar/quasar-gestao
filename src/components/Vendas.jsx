import { useState, useMemo } from 'react';
import EmptyState from './ui/EmptyState';
import { useMobile } from '../hooks/useMobile';
import { supabase } from '../lib/supabase';
import { fmt, today, addDays } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';

const FORMAS = ["a_vista", "cartao", "pix", "parcelado"];
const FORMA_LABEL = { a_vista: "À Vista", cartao: "Cartão", pix: "Pix", parcelado: "Parcelado" };
const PRAZOS = [{ label: "À Vista", dias: 0 }, { label: "30d", dias: 30 }, { label: "60d", dias: 60 }, { label: "90d", dias: 90 }];

const Vendas = ({ t = (k) => k, vendas, setVendas, clientes, produtos, setProdutos, setMovimentos, setContasReceber, pacotesCliente = [], setPacotesCliente, notify }) => {
  const isMobile = useMobile();
  const [modal, setModal] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [editVenda, setEditVenda] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ clienteId: "", data: today(), status: "pendente", desconto: "", forma: "parcelado", prazo: 30, entrada: "" });
  const [itens, setItens] = useState([{ produtoId: "", quantidade: 1, preco: "" }]);
  const [editForm, setEditForm] = useState({ clienteId: "", data: today(), status: "pendente", desconto: "", forma: "parcelado", prazo: 30 });
  const [editItens, setEditItens] = useState([]);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("data");
  const [ordenarDir, setOrdenarDir] = useState("desc");

  const toggleOrdem = (col) => {
    if (ordenarPor === col) setOrdenarDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenarPor(col); setOrdenarDir("asc"); }
  };

  const lista = useMemo(() => vendas.filter(v => {
    if (filtroStatus !== "todos" && v.status !== filtroStatus) return false;
    if (dataIni && v.data < dataIni) return false;
    if (dataFim && v.data > dataFim) return false;
    if (busca) {
      const cli = clientes.find(c => c.id === v.cliente_id);
      if (!cli?.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    let va, vb;
    if (ordenarPor === "data") { va = a.data; vb = b.data; }
    else if (ordenarPor === "cliente") { va = (clientes.find(c => c.id === a.cliente_id)?.nome || "").toLowerCase(); vb = (clientes.find(c => c.id === b.cliente_id)?.nome || "").toLowerCase(); }
    else if (ordenarPor === "total") { va = Number(a.total); vb = Number(b.total); }
    else if (ordenarPor === "status") { va = a.status; vb = b.status; }
    if (va < vb) return ordenarDir === "asc" ? -1 : 1;
    if (va > vb) return ordenarDir === "asc" ? 1 : -1;
    return 0;
  }), [vendas, clientes, busca, filtroStatus, dataIni, dataFim, ordenarPor, ordenarDir]);

  const totalFiltrado = useMemo(() => lista.reduce((a, v) => a + Number(v.total), 0), [lista]);
  const temFiltro = busca || filtroStatus !== "todos" || dataIni || dataFim;

  const addItem = () => setItens(p => [...p, { produtoId: "", quantidade: 1, preco: "" }]);
  const remItem = (i) => setItens(p => p.filter((_, idx) => idx !== i));
  const updItem = (i, field, val) =>
    setItens(p => p.map((it, idx) => {
      if (idx !== i) return it;
      const u = { ...it, [field]: val };
      if (field === "produtoId") { const prod = produtos.find(x => x.id === Number(val)); if (prod) u.preco = prod.preco; }
      return u;
    }));

  // Sessões de pacote consumíveis pelo cliente selecionado (com saldo e não vencidas).
  const cartelasDisponiveis = useMemo(() => {
    const cid = Number(form.clienteId);
    if (!cid) return [];
    return (pacotesCliente || []).filter(pc =>
      pc.cliente_id === cid
      && (pc.sessoes_total - pc.sessoes_usadas) > 0
      && (!pc.data_validade || pc.data_validade >= today())
    );
  }, [form.clienteId, pacotesCliente]);

  const addSessao = () => setItens(p => [...p, { tipo: "sessao", pacoteClienteId: "", quantidade: 1, preco: "" }]);

  const addEditItem = () => setEditItens(p => [...p, { produtoId: "", quantidade: 1, preco: "" }]);
  const addEditSessao = () => setEditItens(p => [...p, { tipo: "sessao", pacoteClienteId: "", quantidade: 1, preco: "" }]);
  const remEditItem = (i) => setEditItens(p => p.filter((_, idx) => idx !== i));
  const updEditItem = (i, field, val) =>
    setEditItens(p => p.map((it, idx) => {
      if (idx !== i) return it;
      const u = { ...it, [field]: val };
      if (field === "produtoId") { const prod = produtos.find(x => x.id === Number(val)); if (prod) u.preco = prod.preco; }
      return u;
    }));

  // Cartelas selecionáveis na edição: com saldo, OU já vinculada a esta venda (mesmo com saldo zerado).
  const editCartelasDisponiveis = useMemo(() => {
    const cid = Number(editForm.clienteId);
    if (!cid) return [];
    const jaNaVenda = new Set((editVenda?.venda_itens || []).filter(it => it.pacote_cliente_id != null).map(it => it.pacote_cliente_id));
    return (pacotesCliente || []).filter(pc =>
      pc.cliente_id === cid
      && ((pc.sessoes_total - pc.sessoes_usadas) > 0 || jaNaVenda.has(pc.id))
      && (!pc.data_validade || pc.data_validade >= today() || jaNaVenda.has(pc.id))
    );
  }, [editForm.clienteId, pacotesCliente, editVenda]);

  const subtotal = itens.reduce((a, it) => a + (Number(it.quantidade) || 0) * (Number(it.preco) || 0), 0);
  const descPct = Math.min(Math.max(Number(form.desconto) || 0, 0), 100);
  const valorDesconto = subtotal * (descPct / 100);
  const total = subtotal - valorDesconto;
  const saldoRestante = form.forma === "parcelado" ? Math.max(0, total - Number(form.entrada || 0)) : 0;

  const editSubtotal = editItens.reduce((a, it) => a + (Number(it.quantidade) || 0) * (Number(it.preco) || 0), 0);
  const editDescPct = Math.min(Math.max(Number(editForm.desconto) || 0, 0), 100);
  const editValorDesconto = editSubtotal * (editDescPct / 100);
  const editTotal = editSubtotal - editValorDesconto;
  const statusCor = { pago: "#4caf82", pendente: "#e8a020", cancelado: "#e05a5a" };

  const abrirModal = () => { setForm({ clienteId: "", data: today(), status: "pendente", desconto: "", forma: "parcelado", prazo: 30, entrada: "" }); setItens([{ produtoId: "", quantidade: 1, preco: "" }]); setModal(true); };

  const salvarVenda = async () => {
    const itensProduto = itens.filter(it => it.tipo !== "sessao");
    const itensSessao = itens.filter(it => it.tipo === "sessao");
    if (!form.clienteId) { notify("Selecione o cliente.", "error"); return; }
    if (itens.length === 0) { notify("Adicione ao menos um item.", "error"); return; }
    if (itensProduto.some(it => !it.produtoId || !it.quantidade || !it.preco)) { notify("Preencha todos os campos da venda.", "error"); return; }
    if (itensSessao.some(it => !it.pacoteClienteId)) { notify(`Selecione o ${t("pacote").toLowerCase()} de cada ${t("atendimento").toLowerCase()}.`, "error"); return; }
    setSaving(true);
    try {
      const { data: venda, error: ve } = await supabase.from("vendas").insert({
        cliente_id: Number(form.clienteId), data: form.data, status: form.status, total,
        desconto_pct: descPct > 0 ? descPct : null, desconto_valor: descPct > 0 ? valorDesconto : null,
        forma_pagamento: form.forma, prazo_dias: Number(form.prazo),
        ...(form.forma === "parcelado" ? { valor_entrada: Number(form.entrada || 0) } : {}),
      }).select().single();
      if (ve) throw ve;

      // Consumo de sessão: baixa atômica via RPC ANTES de gravar o item (§7.3.2).
      // Se a RPC falhar (sem saldo/vencido), aborta — o item não é registrado.
      for (const it of itensSessao) {
        const { error: rpcErr } = await supabase.rpc("consumir_sessao", { p_pacote_cliente: Number(it.pacoteClienteId) });
        if (rpcErr) throw new Error(rpcErr.message || "Falha ao consumir sessão do pacote.");
      }

      const itensSalvar = [
        ...itensProduto.map(it => ({ venda_id: venda.id, produto_id: Number(it.produtoId), quantidade: Number(it.quantidade), preco: Number(it.preco) })),
        ...itensSessao.map(it => ({ venda_id: venda.id, pacote_cliente_id: Number(it.pacoteClienteId), produto_id: null, quantidade: 1, preco: 0 })),
      ];
      const { error: ie } = await supabase.from("venda_itens").insert(itensSalvar);
      if (ie) throw ie;

      // Estoque/movimento só para itens de produto (sessão não mexe em estoque).
      for (const it of itensProduto) {
        const prod = produtos.find(p => p.id === Number(it.produtoId)); if (!prod) continue;
        const novoEstoque = prod.estoque - Number(it.quantidade);
        await supabase.from("produtos").update({ estoque: novoEstoque }).eq("id", prod.id);
        setProdutos(prev => prev.map(p => p.id === prod.id ? { ...p, estoque: novoEstoque } : p));
        await supabase.from("movimentos").insert({ produto_id: prod.id, tipo: "saida", quantidade: Number(it.quantidade), data: form.data, obs: `Venda #${String(venda.id).slice(-4)}` });
      }

      // Atualiza saldo local das cartelas consumidas.
      if (itensSessao.length && setPacotesCliente) {
        const contagem = {};
        itensSessao.forEach(it => { const id = Number(it.pacoteClienteId); contagem[id] = (contagem[id] || 0) + 1; });
        setPacotesCliente(prev => prev.map(pc => contagem[pc.id] ? { ...pc, sessoes_usadas: pc.sessoes_usadas + contagem[pc.id] } : pc));
      }

      if (form.status === "pendente" && saldoRestante > 0) {
        const vencimento = addDays(form.data, Number(form.prazo));
        const cli = clientes.find(c => c.id === Number(form.clienteId));
        const { data: cr } = await supabase.from("contas_receber").insert({
          venda_id: venda.id, cliente_id: Number(form.clienteId),
          descricao: `Venda #${String(venda.id).slice(-4)}${cli ? ` — ${cli.nome}` : ""}`,
          valor: saldoRestante, forma_pagamento: form.forma,
          data_emissao: form.data, data_vencimento: vencimento, status: "pendente",
        }).select().single();
        if (cr) setContasReceber(prev => [...prev, cr].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)));
      }
      setVendas(prev => [{ ...venda, venda_itens: itensSalvar }, ...prev]);
      setModal(false); notify("Venda registrada.");
    } catch (err) { console.error(err); notify(err?.message || err?.details || "Erro ao salvar venda.", "error"); }
    finally { setSaving(false); }
  };

  const abrirEditar = (v) => {
    setEditVenda(v);
    setEditForm({
      clienteId: v.cliente_id ? String(v.cliente_id) : "",
      data: v.data,
      status: v.status,
      desconto: v.desconto_pct ? String(v.desconto_pct) : "",
      forma: v.forma_pagamento || "parcelado",
      prazo: v.prazo_dias || 30,
    });
    setEditItens((v.venda_itens || []).map(it => it.pacote_cliente_id != null
      ? { tipo: "sessao", pacoteClienteId: String(it.pacote_cliente_id), quantidade: 1, preco: 0 }
      : { produtoId: String(it.produto_id), quantidade: it.quantidade, preco: it.preco }
    ));
    setModalEditar(true);
  };

  const salvarEdicao = async () => {
    const itensProdutoNovo = editItens.filter(it => it.tipo !== "sessao");
    const itensSessaoNovo = editItens.filter(it => it.tipo === "sessao");
    if (!editForm.clienteId) { notify("Selecione o cliente.", "error"); return; }
    if (editItens.length === 0) { notify("Adicione ao menos um item.", "error"); return; }
    if (itensProdutoNovo.some(it => !it.produtoId || !it.quantidade || !it.preco)) { notify("Preencha todos os campos da venda.", "error"); return; }
    if (itensSessaoNovo.some(it => !it.pacoteClienteId)) { notify(`Selecione o ${t("pacote").toLowerCase()} de cada ${t("atendimento").toLowerCase()}.`, "error"); return; }
    setSaving(true);
    try {
      const oldItens = editVenda.venda_itens || [];
      const oldItensProduto = oldItens.filter(it => it.produto_id != null);
      const oldSessaoIds = oldItens.filter(it => it.pacote_cliente_id != null).map(it => Number(it.pacote_cliente_id));
      const novoSessaoIds = itensSessaoNovo.map(it => Number(it.pacoteClienteId));

      // Variação líquida de estoque por produto (sessões não mexem em estoque)
      const netChanges = {};
      for (const it of oldItensProduto) {
        netChanges[it.produto_id] = (netChanges[it.produto_id] || 0) + Number(it.quantidade);
      }
      for (const it of itensProdutoNovo) {
        const pid = Number(it.produtoId);
        netChanges[pid] = (netChanges[pid] || 0) - Number(it.quantidade);
      }

      // Atualiza estoque no DB
      for (const [pid, delta] of Object.entries(netChanges)) {
        const prod = produtos.find(p => p.id === Number(pid));
        if (!prod) continue;
        await supabase.from("produtos").update({ estoque: prod.estoque + delta }).eq("id", Number(pid));
      }

      // Reconciliação de sessões: refund das removidas, consumo (RPC) das novas
      const removidas = oldSessaoIds.filter(id => !novoSessaoIds.includes(id));
      const adicionadas = novoSessaoIds.filter(id => !oldSessaoIds.includes(id));
      const refundDeltas = {};
      for (const id of removidas) {
        const pc = (pacotesCliente || []).find(p => p.id === id);
        if (!pc) continue;
        const novoUsadas = Math.max(0, pc.sessoes_usadas - 1);
        await supabase.from("pacotes_cliente").update({ sessoes_usadas: novoUsadas }).eq("id", id);
        refundDeltas[id] = novoUsadas;
      }
      for (const id of adicionadas) {
        const { error: rpcErr } = await supabase.rpc("consumir_sessao", { p_pacote_cliente: id });
        if (rpcErr) throw new Error(rpcErr.message || "Falha ao consumir sessão do pacote.");
      }

      // Substitui itens
      await supabase.from("venda_itens").delete().eq("venda_id", editVenda.id);
      const novoItens = [
        ...itensProdutoNovo.map(it => ({ venda_id: editVenda.id, produto_id: Number(it.produtoId), quantidade: Number(it.quantidade), preco: Number(it.preco) })),
        ...itensSessaoNovo.map(it => ({ venda_id: editVenda.id, pacote_cliente_id: Number(it.pacoteClienteId), produto_id: null, quantidade: 1, preco: 0 })),
      ];
      await supabase.from("venda_itens").insert(novoItens);

      // Movimento de saída só para itens de produto (sessão não mexe em estoque)
      for (const it of itensProdutoNovo) {
        await supabase.from("movimentos").insert({
          produto_id: Number(it.produtoId), tipo: "saida",
          quantidade: Number(it.quantidade), data: editForm.data,
          obs: `Edição venda #${String(editVenda.id).slice(-4)}`,
        });
      }

      // Atualiza a venda
      const { data: vendaAtualizada, error: ve } = await supabase.from("vendas").update({
        cliente_id: Number(editForm.clienteId),
        data: editForm.data,
        status: editForm.status,
        total: editTotal,
        desconto_pct: editDescPct > 0 ? editDescPct : null,
        desconto_valor: editDescPct > 0 ? editValorDesconto : null,
        forma_pagamento: editForm.forma,
        prazo_dias: Number(editForm.prazo),
      }).eq("id", editVenda.id).select().single();
      if (ve) throw ve;

      // Atualiza conta a receber pendente se existir
      await supabase.from("contas_receber")
        .update({ valor: editTotal, cliente_id: Number(editForm.clienteId) })
        .eq("venda_id", editVenda.id).eq("status", "pendente");

      // Atualiza estado local
      setProdutos(prev => prev.map(p => {
        const delta = netChanges[p.id];
        return delta !== undefined ? { ...p, estoque: p.estoque + delta } : p;
      }));
      if (setPacotesCliente && (removidas.length || adicionadas.length)) {
        setPacotesCliente(prev => prev.map(pc => {
          if (refundDeltas[pc.id] !== undefined) return { ...pc, sessoes_usadas: refundDeltas[pc.id] };
          if (adicionadas.includes(pc.id)) return { ...pc, sessoes_usadas: pc.sessoes_usadas + 1 };
          return pc;
        }));
      }
      setVendas(prev => prev.map(v => v.id === editVenda.id ? { ...vendaAtualizada, venda_itens: novoItens } : v));
      setModalEditar(false);
      setEditVenda(null);
      notify("Venda atualizada.");
    } catch (err) {
      console.error(err);
      notify(err?.message || err?.details || "Erro ao atualizar venda.", "error");
    } finally { setSaving(false); }
  };

  const marcarPago = async (v) => {
    const { error } = await supabase.from("vendas").update({ status: "pago" }).eq("id", v.id).select().single();
    if (error) { notify("Erro ao atualizar.", "error"); return; }
    setVendas(prev => prev.map(x => x.id === v.id ? { ...x, status: "pago" } : x));
    const { data: cr } = await supabase.from("contas_receber")
      .update({ status: "pago", data_pagamento: today() })
      .eq("venda_id", v.id).eq("status", "pendente").select();
    if (cr?.length) setContasReceber(prev => prev.map(x => x.venda_id === v.id ? { ...x, status: "pago", data_pagamento: today() } : x));
    notify("Venda marcada como paga.");
  };

  const exportarCSV = () => {
    const esc = s => {
      const v = String(s ?? "");
      return v.includes(";") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const rows = [["Pedido", "Data", "Cliente", "Produto", "Qtd", "Valor (R$)"]];
    lista.forEach(v => {
      const cliente = clientes.find(c => c.id === v.cliente_id)?.nome ?? "—";
      const pedido = v.id;
      const data = v.data ? v.data.slice(0, 10).split("-").reverse().join("/") : "";
      (v.venda_itens || []).forEach(it => {
        const produto = produtos.find(p => p.id === it.produto_id)?.nome ?? "Produto removido";
        rows.push([pedido, data, cliente, produto, it.quantidade, Number(it.preco).toFixed(2)]);
      });
    });
    const csv = rows.map(r => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Vendas_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const fmtBRL = n => {
      const [int, dec] = Number(n).toFixed(2).split(".");
      return "R$ " + int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
    };
    const corStatus = { pago: "#16a34a", pendente: "#d97706", cancelado: "#dc2626" };
    const rows = lista.map(v => {
      const cli = clientes.find(c => c.id === v.cliente_id);
      return `<tr>
        <td>#${esc(String(v.id).slice(-4))}</td>
        <td>${esc(v.data || "—")}</td>
        <td>${esc(cli?.nome ?? "—")}</td>
        <td style="text-align:center">${esc((v.venda_itens || []).length)}</td>
        <td style="text-align:right">${v.desconto_pct ? `-${esc(v.desconto_pct)}%` : "—"}</td>
        <td style="text-align:right;font-weight:600">${fmtBRL(v.total)}</td>
        <td style="text-align:center;color:${corStatus[v.status] || "#555"};font-weight:500">${esc(v.status)}</td>
      </tr>`;
    }).join("");

    const filtros = [
      busca && `Cliente: "${esc(busca)}"`,
      filtroStatus !== "todos" && `Status: ${esc(filtroStatus)}`,
      dataIni && `De: ${esc(dataIni)}`,
      dataFim && `Até: ${esc(dataFim)}`,
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Vendas — Quasar Gestão</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:12px;color:#222;padding:24px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .sub{font-size:11px;color:#888;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f5f5f5;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #ddd;color:#666}
    td{padding:6px 10px;border-bottom:1px solid #eee}
    .total-row{text-align:right;font-size:13px;padding-top:10px;border-top:2px solid #222}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <h1>Vendas — Quasar Gestão</h1>
  <div class="sub">
    ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
    · ${lista.length} registro${lista.length !== 1 ? "s" : ""}
    ${filtros ? ` · Filtros: ${filtros}` : ""}
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Data</th><th>Cliente</th>
      <th style="text-align:center">Itens</th>
      <th style="text-align:right">Desconto</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:center">Status</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px">Nenhuma venda encontrada</td></tr>'}</tbody>
  </table>
  <div class="total-row"><strong>Total: ${fmtBRL(totalFiltrado)}</strong></div>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: "1.5rem", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Vendas</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("ghost")} onClick={exportarCSV}><Icon name="download" size={14} /> CSV</button>
          <button style={btn("ghost")} onClick={exportarPDF}><Icon name="print" size={14} /> Exportar PDF</button>
          <button style={btn("primary")} onClick={abrirModal}><Icon name="plus" size={14} /> Nova Venda</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Buscar por cliente..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inp, width: isMobile ? "100%" : 200 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {["todos", "pendente", "pago", "cancelado"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              style={{ padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: ".78rem",
                background: filtroStatus === s ? (s === "pago" ? "#4caf82" : s === "cancelado" ? "#e05a5a" : s === "pendente" ? "#e8a020" : "#ffbf00") : "#1a1a1a",
                color: filtroStatus === s ? "#0a0a08" : "#888", fontWeight: filtroStatus === s ? 700 : 400 }}>
              {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", ...(isMobile ? { width: "100%" } : {}) }}>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={{ ...inp, ...(isMobile ? { flex: 1 } : { width: 130 }) }} title="Data inicial" />
          <span style={{ color: "#444", fontSize: ".82rem", flexShrink: 0 }}>–</span>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ ...inp, ...(isMobile ? { flex: 1 } : { width: 130 }) }} title="Data final" />
        </div>
        {temFiltro && (
          <button onClick={() => { setBusca(""); setFiltroStatus("todos"); setDataIni(""); setDataFim(""); }}
            style={{ ...btn("ghost"), padding: "6px 10px", fontSize: ".75rem" }}>
            <Icon name="x" size={13} /> Limpar
          </button>
        )}
      </div>

      {/* Resumo */}
      <div style={{ fontSize: ".8rem", color: "#555", marginBottom: ".75rem" }}>
        {lista.length} venda{lista.length !== 1 ? "s" : ""}
        {temFiltro && " filtradas"}
        {" · "}
        <span style={{ color: "#ffbf00", fontFamily: "'DM Mono',monospace" }}>{fmt(totalFiltrado)}</span>
      </div>

      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".88rem", minWidth: 600 }}>
          <thead><tr style={{ background: "#111" }}>
            {[
              { label: "#", col: null },
              { label: "Data", col: "data" },
              { label: "Cliente", col: "cliente" },
              { label: "Itens", col: null },
              { label: "Desconto", col: null },
              { label: "Total", col: "total" },
              { label: "Status", col: "status" },
              { label: "Ações", col: null },
            ].map(({ label, col }) => (
              <th key={label} onClick={col ? () => toggleOrdem(col) : undefined}
                style={{ padding: ".75rem 1rem", textAlign: "left", fontSize: ".72rem", color: col ? (ordenarPor === col ? "#c9a84c" : "#555") : "#555", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                {label}{col && ordenarPor === col ? (ordenarDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {lista.map(v => { const cli = clientes.find(c => c.id === v.cliente_id); return (
              <tr key={v.id} style={{ borderTop: "1px solid #1f1f1f" }}>
                <td style={{ padding: ".8rem 1rem", color: "#555", fontSize: ".8rem" }}>#{String(v.id).slice(-4)}</td>
                <td style={{ padding: ".8rem 1rem", color: "#aaa" }}>{v.data}</td>
                <td style={{ padding: ".8rem 1rem", color: "#e0e0e0", fontWeight: 500 }}>{cli?.nome ?? "—"}</td>
                <td style={{ padding: ".8rem 1rem", color: "#999" }}>{(v.venda_itens || []).length} item(s)</td>
                <td style={{ padding: ".8rem 1rem" }}>
                  {v.desconto_pct
                    ? <span style={{ fontSize: ".78rem", padding: "2px 8px", borderRadius: 4, background: "#1f1a09", color: "#e8a020", fontFamily: "'DM Mono',monospace" }}>-{v.desconto_pct}%</span>
                    : <span style={{ color: "#333", fontSize: ".78rem" }}>—</span>}
                </td>
                <td style={{ padding: ".8rem 1rem", color: "#ffbf00", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fmt(v.total)}</td>
                <td style={{ padding: ".8rem 1rem" }}>
                  <span style={{ fontSize: ".75rem", padding: "3px 10px", borderRadius: 4, background: (statusCor[v.status] || "#555") + "22", color: statusCor[v.status] || "#888" }}>{v.status}</span>
                </td>
                <td style={{ padding: ".8rem 1rem" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {v.status === "pendente" && (
                      <button onClick={() => marcarPago(v)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#4caf8222", color: "#4caf82", fontSize: ".75rem", display: "flex", alignItems: "center", gap: 4 }}>
                        <Icon name="check" size={13} /> Pago
                      </button>
                    )}
                    <button style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "#6b9fd422", color: "#6b9fd4", fontSize: ".75rem", display: "flex", alignItems: "center", gap: 4 }} onClick={() => abrirEditar(v)}>
                      <Icon name="pencil" size={13} /> Editar
                    </button>
                    <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: ".75rem" }} onClick={() => setDetalhe(v)}>Ver</button>
                  </div>
                </td>
              </tr>
            ); })}
            {lista.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 0 }}>
                <EmptyState iconName="cart" title={vendas.length === 0 ? "Nenhuma venda registrada" : "Nenhuma venda encontrada"} subtitle={temFiltro ? "Tente ajustar os filtros" : "Registre a primeira venda"} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Registrar Venda" onClose={() => setModal(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label={t("cliente")}>
              <select style={inp} value={form.clienteId} onChange={e => { setForm({ ...form, clienteId: e.target.value }); setItens(prev => prev.filter(it => it.tipo !== "sessao")); }}>
                <option value="">Selecionar {t("cliente").toLowerCase()}...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label="Data"><input style={inp} type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Status">
              <div style={{ display: "flex", gap: 8 }}>
                {["pendente", "pago"].map(s => (
                  <button key={s} onClick={() => setForm({ ...form, status: s })}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", background: form.status === s ? (s === "pago" ? "#4caf8233" : "#e8a02033") : "#1a1a1a", color: form.status === s ? (s === "pago" ? "#4caf82" : "#e8a020") : "#666", fontSize: ".82rem", fontWeight: form.status === s ? 600 : 400, textTransform: "capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Forma de Pagamento">
              <select style={inp} value={form.forma} onChange={e => setForm({ ...form, forma: e.target.value, entrada: e.target.value !== "parcelado" ? "" : form.entrada })}>
                {FORMAS.map(f => <option key={f} value={f}>{FORMA_LABEL[f]}</option>)}
              </select>
            </Field>
          </div>
          {form.status === "pendente" && form.forma === "parcelado" && (
            <Field label="Prazo de Pagamento">
              <div style={{ display: "flex", gap: 8 }}>
                {PRAZOS.map(p => (
                  <button key={p.dias} onClick={() => setForm({ ...form, prazo: p.dias })}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${form.prazo === p.dias ? "#ffbf00" : "#333"}`, cursor: "pointer",
                      background: form.prazo === p.dias ? "#ffbf0022" : "transparent",
                      color: form.prazo === p.dias ? "#ffbf00" : "#666",
                      fontSize: ".78rem", fontWeight: form.prazo === p.dias ? 700 : 400 }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: ".75rem", color: "#555" }}>
                Vencimento: <span style={{ color: "#ffbf00", fontFamily: "'DM Mono',monospace" }}>{addDays(form.data, Number(form.prazo))}</span>
              </div>
            </Field>
          )}
          <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: "1rem", marginTop: ".5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
              <span style={{ fontSize: ".75rem", color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Itens da Venda</span>
              <div style={{ display: "flex", gap: 6 }}>
                {cartelasDisponiveis.length > 0 && (
                  <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: ".75rem", color: "#4caf82" }} onClick={addSessao}>+ {t("atendimento")} de {t("pacote").toLowerCase()}</button>
                )}
                <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: ".75rem" }} onClick={addItem}>+ Adicionar item</button>
              </div>
            </div>
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 4 }}>
                {["Produto", "Qtd", "Preço unit. (R$)", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: ".68rem", color: "#444", textTransform: "uppercase", letterSpacing: ".05em", paddingLeft: 2 }}>{h}</div>
                ))}
              </div>
            )}
            {itens.map((it, i) => it.tipo === "sessao" ? (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, padding: "6px 8px", background: "#0d1a14", border: "1px solid #1a4a2a", borderRadius: 6 }}>
                <span style={{ color: "#4caf82", display: "flex", flexShrink: 0 }}><Icon name="pacote" size={15} /></span>
                <select style={{ ...inp, flex: 1 }} value={it.pacoteClienteId} onChange={e => updItem(i, "pacoteClienteId", e.target.value)}>
                  <option value="">Selecionar {t("pacote").toLowerCase()}...</option>
                  {cartelasDisponiveis.map(pc => <option key={pc.id} value={pc.id}>{(pc.pacotes?.nome || t("pacote"))} — saldo {pc.sessoes_total - pc.sessoes_usadas}</option>)}
                </select>
                <span style={{ fontSize: ".75rem", color: "#4caf82", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>grátis</span>
                <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remItem(i)}><Icon name="x" size={16} /></button>
              </div>
            ) : isMobile ? (
              <div key={i} style={{ marginBottom: 10 }}>
                <select style={{ ...inp, width: "100%", marginBottom: 6 }} value={it.produtoId} onChange={e => updItem(i, "produtoId", e.target.value)}>
                  <option value="">Produto...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (est: {p.estoque})</option>)}
                </select>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input style={{ ...inp, flex: 1 }} type="number" placeholder="Qtd" value={it.quantidade} min={1} onChange={e => updItem(i, "quantidade", e.target.value)} />
                  <input style={{ ...inp, flex: 1 }} type="number" placeholder="R$" step=".01" value={it.preco} onChange={e => updItem(i, "preco", e.target.value)} />
                  <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remItem(i)}><Icon name="x" size={16} /></button>
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 8 }}>
                <select style={inp} value={it.produtoId} onChange={e => updItem(i, "produtoId", e.target.value)}>
                  <option value="">Produto...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (est: {p.estoque})</option>)}
                </select>
                <input style={inp} type="number" placeholder="Qtd" value={it.quantidade} min={1} onChange={e => updItem(i, "quantidade", e.target.value)} />
                <input style={inp} type="number" placeholder="R$" step=".01" value={it.preco} onChange={e => updItem(i, "preco", e.target.value)} />
                <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remItem(i)}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "1rem 1.25rem", marginTop: ".5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
              <span style={{ fontSize: ".82rem", color: "#666" }}>Subtotal</span>
              <span style={{ fontSize: ".95rem", color: "#aaa", fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem", gap: "1rem" }}>
              <span style={{ fontSize: ".82rem", color: "#666", whiteSpace: "nowrap" }}>% Desconto</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[5, 10, 15, 20].map(pct => (
                  <button key={pct} onClick={() => setForm({ ...form, desconto: Number(form.desconto) === pct ? "" : String(pct) })}
                    style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid", borderColor: Number(form.desconto) === pct ? "#e8a020" : "#2a2a2a", background: Number(form.desconto) === pct ? "#e8a02022" : "transparent", color: Number(form.desconto) === pct ? "#e8a020" : "#555", cursor: "pointer", fontSize: ".72rem", fontFamily: "'DM Mono',monospace" }}>
                    {pct}%
                  </button>
                ))}
                <div style={{ position: "relative", width: 80 }}>
                  <input style={{ ...inp, paddingRight: 24, textAlign: "right", width: "100%", fontFamily: "'DM Mono',monospace" }}
                    type="number" min="0" max="100" step="0.5" placeholder="0" value={form.desconto}
                    onChange={e => setForm({ ...form, desconto: e.target.value })} />
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: ".8rem", pointerEvents: "none" }}>%</span>
                </div>
              </div>
            </div>
            {descPct > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem", padding: "6px 10px", background: "#1f1a09", borderRadius: 6, border: "1px solid #5a3a0a" }}>
                <span style={{ fontSize: ".78rem", color: "#e8a020" }}>Desconto de {descPct}%</span>
                <span style={{ fontSize: ".88rem", color: "#e8a020", fontFamily: "'DM Mono',monospace" }}>− {fmt(valorDesconto)}</span>
              </div>
            )}
            <div style={{ borderTop: "1px solid #2a2a2a", marginBottom: ".75rem" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: ".88rem", color: "#999", fontWeight: 600 }}>Total da Venda</span>
              <div style={{ textAlign: "right" }}>
                {descPct > 0 && <div style={{ fontSize: ".75rem", color: "#444", textDecoration: "line-through", fontFamily: "'DM Mono',monospace", marginBottom: 2 }}>{fmt(subtotal)}</div>}
                <span style={{ color: "#ffbf00", fontWeight: 700, fontSize: "1.2rem", fontFamily: "'DM Mono',monospace" }}>{fmt(total)}</span>
              </div>
            </div>
            {form.forma === "parcelado" && total > 0 && (
              <div style={{ borderTop: "1px solid #2a2a2a", marginTop: ".75rem", paddingTop: ".75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                  <span style={{ fontSize: ".82rem", color: "#666", whiteSpace: "nowrap" }}>Entrada (R$)</span>
                  <div style={{ position: "relative", width: 140 }}>
                    <input style={{ ...inp, fontFamily: "'DM Mono',monospace", textAlign: "right", width: "100%" }}
                      type="number" step=".01" min="0" placeholder="0,00"
                      value={form.entrada}
                      onChange={e => setForm({ ...form, entrada: e.target.value })} />
                  </div>
                </div>
                {form.status === "pendente" && Number(form.entrada) > 0 && saldoRestante > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, padding: "5px 8px", background: "#0d1a14", borderRadius: 6, border: "1px solid #1a4a2a" }}>
                    <span style={{ fontSize: ".75rem", color: "#4caf82" }}>Saldo a receber</span>
                    <span style={{ fontSize: ".88rem", color: "#4caf82", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(saldoRestante)}</span>
                  </div>
                )}
                {form.status === "pendente" && Number(form.entrada) >= total && total > 0 && (
                  <div style={{ marginTop: 6, padding: "5px 8px", background: "#0d1a14", borderRadius: 6, border: "1px solid #1a4a2a", fontSize: ".75rem", color: "#4caf82" }}>
                    Entrada cobre o total — nenhuma conta a receber será criada
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "1rem" }}>
            <button style={btn("ghost")} onClick={() => setModal(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvarVenda} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Registrar Venda"}</button>
          </div>
        </Modal>
      )}

      {modalEditar && editVenda && (
        <Modal title={`Editar Venda #${String(editVenda.id).slice(-4)}`} onClose={() => { setModalEditar(false); setEditVenda(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Cliente">
              <select style={inp} value={editForm.clienteId} onChange={e => setEditForm({ ...editForm, clienteId: e.target.value })}>
                <option value="">Selecionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label="Data"><input style={inp} type="date" value={editForm.data} onChange={e => setEditForm({ ...editForm, data: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Status">
              <div style={{ display: "flex", gap: 8 }}>
                {["pendente", "pago"].map(s => (
                  <button key={s} onClick={() => setEditForm({ ...editForm, status: s })}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", background: editForm.status === s ? (s === "pago" ? "#4caf8233" : "#e8a02033") : "#1a1a1a", color: editForm.status === s ? (s === "pago" ? "#4caf82" : "#e8a020") : "#666", fontSize: ".82rem", fontWeight: editForm.status === s ? 600 : 400, textTransform: "capitalize" }}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Forma de Pagamento">
              <select style={inp} value={editForm.forma} onChange={e => setEditForm({ ...editForm, forma: e.target.value })}>
                {FORMAS.map(f => <option key={f} value={f}>{FORMA_LABEL[f]}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: "1rem", marginTop: ".5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
              <span style={{ fontSize: ".75rem", color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Itens da Venda</span>
              <div style={{ display: "flex", gap: 6 }}>
                {editCartelasDisponiveis.length > 0 && (
                  <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: ".75rem", color: "#4caf82" }} onClick={addEditSessao}>+ {t("atendimento")} de {t("pacote").toLowerCase()}</button>
                )}
                <button style={{ ...btn("ghost"), padding: "4px 10px", fontSize: ".75rem" }} onClick={addEditItem}>+ Adicionar item</button>
              </div>
            </div>
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 4 }}>
                {["Produto", "Qtd", "Preço unit. (R$)", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: ".68rem", color: "#444", textTransform: "uppercase", letterSpacing: ".05em", paddingLeft: 2 }}>{h}</div>
                ))}
              </div>
            )}
            {editItens.map((it, i) => it.tipo === "sessao" ? (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, padding: "6px 8px", background: "#0d1a14", border: "1px solid #1a4a2a", borderRadius: 6 }}>
                <span style={{ color: "#4caf82", display: "flex", flexShrink: 0 }}><Icon name="pacote" size={15} /></span>
                <select style={{ ...inp, flex: 1 }} value={it.pacoteClienteId} onChange={e => updEditItem(i, "pacoteClienteId", e.target.value)}>
                  <option value="">Selecionar {t("pacote").toLowerCase()}...</option>
                  {editCartelasDisponiveis.map(pc => <option key={pc.id} value={pc.id}>{(pc.pacotes?.nome || t("pacote"))} — saldo {pc.sessoes_total - pc.sessoes_usadas}</option>)}
                </select>
                <span style={{ fontSize: ".75rem", color: "#4caf82", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>grátis</span>
                <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remEditItem(i)}><Icon name="x" size={16} /></button>
              </div>
            ) : isMobile ? (
              <div key={i} style={{ marginBottom: 10 }}>
                <select style={{ ...inp, width: "100%", marginBottom: 6 }} value={it.produtoId} onChange={e => updEditItem(i, "produtoId", e.target.value)}>
                  <option value="">Produto...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (est: {p.estoque})</option>)}
                </select>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input style={{ ...inp, flex: 1 }} type="number" placeholder="Qtd" value={it.quantidade} min={1} onChange={e => updEditItem(i, "quantidade", e.target.value)} />
                  <input style={{ ...inp, flex: 1 }} type="number" placeholder="R$" step=".01" value={it.preco} onChange={e => updEditItem(i, "preco", e.target.value)} />
                  <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remEditItem(i)}><Icon name="x" size={16} /></button>
                </div>
              </div>
            ) : (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 8 }}>
                <select style={inp} value={it.produtoId} onChange={e => updEditItem(i, "produtoId", e.target.value)}>
                  <option value="">Produto...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (est: {p.estoque})</option>)}
                </select>
                <input style={inp} type="number" placeholder="Qtd" value={it.quantidade} min={1} onChange={e => updEditItem(i, "quantidade", e.target.value)} />
                <input style={inp} type="number" placeholder="R$" step=".01" value={it.preco} onChange={e => updEditItem(i, "preco", e.target.value)} />
                <button style={{ background: "none", border: "none", color: "#e05a5a", cursor: "pointer", padding: "0 4px" }} onClick={() => remEditItem(i)}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 6, padding: "1rem 1.25rem", marginTop: ".5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
              <span style={{ fontSize: ".82rem", color: "#666" }}>Subtotal</span>
              <span style={{ fontSize: ".95rem", color: "#aaa", fontFamily: "'DM Mono',monospace" }}>{fmt(editSubtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem", gap: "1rem" }}>
              <span style={{ fontSize: ".82rem", color: "#666", whiteSpace: "nowrap" }}>% Desconto</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[5, 10, 15, 20].map(pct => (
                  <button key={pct} onClick={() => setEditForm({ ...editForm, desconto: Number(editForm.desconto) === pct ? "" : String(pct) })}
                    style={{ padding: "3px 9px", borderRadius: 5, border: "1px solid", borderColor: Number(editForm.desconto) === pct ? "#e8a020" : "#2a2a2a", background: Number(editForm.desconto) === pct ? "#e8a02022" : "transparent", color: Number(editForm.desconto) === pct ? "#e8a020" : "#555", cursor: "pointer", fontSize: ".72rem", fontFamily: "'DM Mono',monospace" }}>
                    {pct}%
                  </button>
                ))}
                <div style={{ position: "relative", width: 80 }}>
                  <input style={{ ...inp, paddingRight: 24, textAlign: "right", width: "100%", fontFamily: "'DM Mono',monospace" }}
                    type="number" min="0" max="100" step="0.5" placeholder="0" value={editForm.desconto}
                    onChange={e => setEditForm({ ...editForm, desconto: e.target.value })} />
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: ".8rem", pointerEvents: "none" }}>%</span>
                </div>
              </div>
            </div>
            {editDescPct > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem", padding: "6px 10px", background: "#1f1a09", borderRadius: 6, border: "1px solid #5a3a0a" }}>
                <span style={{ fontSize: ".78rem", color: "#e8a020" }}>Desconto de {editDescPct}%</span>
                <span style={{ fontSize: ".88rem", color: "#e8a020", fontFamily: "'DM Mono',monospace" }}>− {fmt(editValorDesconto)}</span>
              </div>
            )}
            <div style={{ borderTop: "1px solid #2a2a2a", marginBottom: ".75rem" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: ".88rem", color: "#999", fontWeight: 600 }}>Total da Venda</span>
              <div style={{ textAlign: "right" }}>
                {editDescPct > 0 && <div style={{ fontSize: ".75rem", color: "#444", textDecoration: "line-through", fontFamily: "'DM Mono',monospace", marginBottom: 2 }}>{fmt(editSubtotal)}</div>}
                <span style={{ color: "#ffbf00", fontWeight: 700, fontSize: "1.2rem", fontFamily: "'DM Mono',monospace" }}>{fmt(editTotal)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "1rem" }}>
            <button style={btn("ghost")} onClick={() => { setModalEditar(false); setEditVenda(null); }}>Cancelar</button>
            <button style={btn("primary")} onClick={salvarEdicao} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar Alterações"}</button>
          </div>
        </Modal>
      )}

      {detalhe && (
        <Modal title={`Venda #${String(detalhe.id).slice(-4)}`} onClose={() => setDetalhe(null)}>
          <div style={{ fontSize: ".88rem", color: "#aaa", marginBottom: "1rem" }}>
            <b style={{ color: "#ddd" }}>{clientes.find(c => c.id === detalhe.cliente_id)?.nome}</b>
            {" · "}{detalhe.data}
            <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 4, background: (statusCor[detalhe.status] || "#555") + "22", color: statusCor[detalhe.status] || "#888", fontSize: ".75rem" }}>{detalhe.status}</span>
          </div>
          {(detalhe.venda_itens || []).map((it, i) => { const p = produtos.find(pp => pp.id === it.produto_id); const isSessao = it.pacote_cliente_id != null; return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: ".6rem 0", borderBottom: "1px solid #1a1a1a" }}>
              <span style={{ color: "#e0e0e0" }}>{isSessao ? <>{t("atendimento")} <span style={{ color: "#4caf82", fontSize: ".78rem" }}>({t("pacote").toLowerCase()})</span></> : (p?.nome ?? "Produto removido")}</span>
              <span style={{ color: "#888", fontFamily: "'DM Mono',monospace" }}>{isSessao ? "grátis" : <>{it.quantidade}x {fmt(it.preco)} = <b style={{ color: "#ccc" }}>{fmt(it.quantidade * it.preco)}</b></>}</span>
            </div>
          ); })}
          {detalhe.desconto_pct > 0 && (
            <div style={{ marginTop: ".75rem", padding: "8px 12px", background: "#1f1a09", borderRadius: 6, border: "1px solid #5a3a0a", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: ".82rem", color: "#e8a020" }}>Desconto ({detalhe.desconto_pct}%)</span>
              <span style={{ fontSize: ".88rem", color: "#e8a020", fontFamily: "'DM Mono',monospace" }}>− {fmt(detalhe.desconto_valor)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: ".75rem", fontSize: "1rem", fontWeight: 700, color: "#ffbf00", fontFamily: "'DM Mono',monospace" }}>
            Total: {fmt(detalhe.total)}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Vendas;


