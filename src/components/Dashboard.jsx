import { useState, useMemo } from 'react';
import { fmt, today, addDays, saldoCr } from '../lib/utils';
import { useMobile } from '../hooks/useMobile';
import Icon from './ui/Icon';
import LineAreaChart from './LineAreaChart';

const card = { background: "#141414", border: "1px solid #1f1f1f", borderRadius: 14, padding: "1.25rem" };

const CardHead = ({ title, action, onAction }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
    <span style={{ fontSize: ".68rem", color: "#666", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>{title}</span>
    {action && (
      <button onClick={onAction} style={{ background: "none", border: "none", color: "#c9a84c", fontSize: ".65rem", textTransform: "uppercase", letterSpacing: ".08em", cursor: "pointer", fontWeight: 600, padding: 0 }}>
        {action} →
      </button>
    )}
  </div>
);

const Delta = ({ pct, suffix }) => {
  if (pct === null || !isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: up ? "rgba(76,175,130,.12)" : "rgba(224,90,90,.12)", color: up ? "#4caf82" : "#e05a5a", borderRadius: 6, padding: "3px 8px", fontSize: ".7rem", fontFamily: "'DM Mono',monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
};

const Sparkline = ({ values, color = "#ffbf00", w = 64, h = 20 }) => {
  if (!values || values.length < 2 || values.every(v => v === 0)) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ flexShrink: 0, display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
    </svg>
  );
};

const Pill = ({ children, color, bg }) => (
  <span style={{ background: bg, color, borderRadius: 6, padding: "2px 8px", fontSize: ".68rem", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{children}</span>
);

const rowStyle = (last) => ({ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: last ? "none" : "1px solid #1c1c1c" });

const CAT_CORES = ["#e05a5a", "#e8a020", "#b86fcf", "#6b9fd4", "#4caf82", "#c9a84c", "#888"];

const Dashboard = ({ produtos, clientes, vendas, movimentos, contasReceber, contasPagar, despesas, reload, onNavigate }) => {
  const [periodo, setPeriodo] = useState("mes");
  const [onbCardOff, setOnbCardOff] = useState(() => localStorage.getItem("quasar_onb_card") === "1");
  const isMobile = useMobile();

  const onbPassos = [
    { ok: produtos.length > 0, label: "Cadastrar produtos", desc: "Importe o catálogo ou adicione manualmente", aba: "estoque" },
    { ok: clientes.length > 0, label: "Cadastrar o primeiro cliente", desc: "A barbearia ou estabelecimento que compra", aba: "clientes" },
    { ok: vendas.length > 0, label: "Registrar a primeira venda", desc: "Seu primeiro pedido no sistema", aba: "vendas" },
  ];
  const onbCompleto = onbPassos.every(p => p.ok);
  const mostrarOnbCard = !onbCardOff && !onbCompleto;
  const dispensarOnbCard = () => { localStorage.setItem("quasar_onb_card", "1"); setOnbCardOff(true); };
  const agora = new Date();
  const mesAtual = today().slice(0, 7);
  const semanaAtras = addDays(today(), -7);
  const duasSemanas = addDays(today(), -14);
  const trimestre = addDays(today(), -90);
  const semestre = addDays(today(), -180);
  const dAnt = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const mesAnterior = `${dAnt.getFullYear()}-${String(dAnt.getMonth() + 1).padStart(2, "0")}`;

  const fp = periodo === "mes" ? v => v.data?.startsWith(mesAtual)
    : periodo === "semana" ? v => v.data >= semanaAtras
    : v => v.data >= trimestre;

  const fpPrev = periodo === "mes" ? v => v.data?.startsWith(mesAnterior)
    : periodo === "semana" ? v => v.data >= duasSemanas && v.data < semanaAtras
    : v => v.data >= semestre && v.data < trimestre;

  const vp = vendas.filter(v => fp(v) && v.status !== "cancelado");
  const vpPrev = vendas.filter(v => fpPrev(v) && v.status !== "cancelado");
  const fat = vp.reduce((a, v) => a + Number(v.total), 0);
  const fatPrev = vpPrev.reduce((a, v) => a + Number(v.total), 0);
  const tkt = vp.length > 0 ? fat / vp.length : 0;

  const lucroDe = (lista, total) => {
    let custo = 0;
    lista.forEach(v => (v.venda_itens || []).forEach(it => {
      const prod = produtos.find(p => p.id === it.produto_id);
      if (prod) custo += Number(prod.custo || 0) * Number(it.quantidade || 0);
    }));
    return total - custo;
  };

  const lucroPeriodo = useMemo(() => lucroDe(vp, fat), [vp, fat]); // eslint-disable-line react-hooks/exhaustive-deps
  const lucroPrev = useMemo(() => lucroDe(vpPrev, fatPrev), [vpPrev, fatPrev]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltaFat = fatPrev > 0 ? ((fat - fatPrev) / fatPrev) * 100 : null;
  const deltaLucro = lucroPrev > 0 ? ((lucroPeriodo - lucroPrev) / lucroPrev) * 100 : null;

  const custoEstoque = useMemo(
    () => produtos.reduce((a, p) => a + Number(p.custo || 0) * Number(p.estoque || 0), 0),
    [produtos]
  );

  const baixo = useMemo(
    () => produtos.filter(p => p.estoque < 10).sort((a, b) => a.estoque - b.estoque),
    [produtos]
  );

  const contasVencidas = useMemo(() => {
    if (!contasReceber) return [];
    return contasReceber
      .filter(cr => cr.status !== "pago" && cr.data_vencimento < today())
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  }, [contasReceber]);

  const totalVencido = contasVencidas.reduce((a, c) => a + saldoCr(c), 0);
  const totalAReceber = (contasReceber || []).filter(cr => cr.status !== "pago").reduce((a, c) => a + saldoCr(c), 0);

  const proximos = useMemo(() => {
    const lim = addDays(today(), 14);
    return [
      ...(contasReceber || []).filter(c => c.status !== "pago" && c.data_vencimento >= today() && c.data_vencimento <= lim)
        .map(c => ({ ...c, tipo: "receber", nome: clientes.find(x => x.id === c.cliente_id)?.nome || c.descricao || "Cobrança" })),
      ...(contasPagar || []).filter(c => c.status !== "pago" && c.data_vencimento >= today() && c.data_vencimento <= lim)
        .map(c => ({ ...c, tipo: "pagar", nome: c.descricao || "Conta" })),
    ].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).slice(0, 6);
  }, [contasReceber, contasPagar, clientes]);

  const dp = (despesas || []).filter(fp);
  const totalDespesas = dp.reduce((a, d) => a + Number(d.valor), 0);

  const despPorCat = useMemo(() => {
    const m = {};
    dp.forEach(d => { const k = d.categoria || "outros"; m[k] = (m[k] || 0) + Number(d.valor); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [dp]);

  // "Recebido" conta só o que entrou de fato: venda paga = total; venda pendente parcelada = entrada + parciais já pagos na cobrança vinculada.
  const totalRecebidoVendas = useMemo(() => vendas.filter(v => v.status !== "cancelado").reduce((a, v) => {
    if (v.status === "pago") return a + Number(v.total);
    if (v.forma_pagamento !== "parcelado") return a + Number(v.total);
    const cr = (contasReceber || []).find(c => c.venda_id === v.id);
    return a + Number(v.valor_entrada || 0) + Number(cr?.valor_pago || 0);
  }, 0), [vendas, contasReceber]);

  const saldoCaixa = useMemo(() => {
    const saidasCP = (contasPagar || []).filter(cp => cp.status === "pago").reduce((a, c) => a + Number(c.valor), 0);
    const saidasDesp = (despesas || []).reduce((a, d) => a + Number(d.valor), 0);
    return totalRecebidoVendas - saidasCP - saidasDesp;
  }, [totalRecebidoVendas, contasPagar, despesas]);

  const diasPeriodo = useMemo(() => [...new Set(vp.map(v => v.data).filter(Boolean))].sort(), [vp]);

  const sparkProd = (id) => diasPeriodo.map(d =>
    vp.filter(v => v.data === d).reduce((a, v) => a + (v.venda_itens || []).filter(it => it.produto_id === id).reduce((s, it) => s + Number(it.quantidade), 0), 0)
  );
  const sparkCli = (id) => diasPeriodo.map(d =>
    vp.filter(v => v.data === d && v.cliente_id === id).reduce((a, v) => a + Number(v.total), 0)
  );

  const topProd = useMemo(() => {
    const m = {};
    vp.forEach(v => (v.venda_itens || []).forEach(it => {
      if (!m[it.produto_id]) m[it.produto_id] = { qty: 0, valor: 0 };
      m[it.produto_id].qty += Number(it.quantidade);
      m[it.produto_id].valor += Number(it.quantidade) * Number(it.preco);
    }));
    return Object.entries(m).map(([id, d]) => ({ id: Number(id), ...d })).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [vp]);

  const topCli = useMemo(() => {
    const m = {};
    vp.forEach(v => {
      if (!v.cliente_id) return;
      if (!m[v.cliente_id]) m[v.cliente_id] = { total: 0, pedidos: 0 };
      m[v.cliente_id].total += Number(v.total);
      m[v.cliente_id].pedidos += 1;
    });
    return Object.entries(m).map(([id, d]) => ({ id: Number(id), ...d })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [vp]);

  const grafico = useMemo(() => {
    if (periodo === "mes") {
      const m = {};
      vp.forEach(v => {
        const d = v.data?.slice(8, 10);
        if (d) { if (!m[d]) m[d] = { valor: 0, qtd: 0 }; m[d].valor += Number(v.total); m[d].qtd += 1; }
      });
      return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([d, x]) => ({ label: d, valor: x.valor, qtd: x.qtd }));
    } else if (periodo === "semana") {
      const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]; const m = {};
      vp.forEach(v => {
        if (!v.data) return;
        const k = dias[new Date(v.data + "T12:00:00").getDay()];
        if (!m[k]) m[k] = { valor: 0, qtd: 0 }; m[k].valor += Number(v.total); m[k].qtd += 1;
      });
      return dias.map(d => ({ label: d, valor: m[d]?.valor || 0, qtd: m[d]?.qtd || 0 }));
    } else {
      const m = {};
      vp.forEach(v => {
        const mes = v.data?.slice(0, 7);
        if (mes) { if (!m[mes]) m[mes] = { valor: 0, qtd: 0 }; m[mes].valor += Number(v.total); m[mes].qtd += 1; }
      });
      return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, x]) => ({ label: mes.slice(5), valor: x.valor, qtd: x.qtd }));
    }
  }, [vp, periodo]);

  const labelPeriodo = periodo === "mes" ? "do mês" : periodo === "semana" ? "da semana" : "do trimestre";
  const labelAnterior = periodo === "mes" ? "vs mês anterior" : periodo === "semana" ? "vs semana anterior" : "vs trimestre anterior";

  const diasAte = (data) => Math.round((new Date(data + "T12:00:00") - new Date(today() + "T12:00:00")) / 86400000);
  const diasAtraso = (data) => Math.round((new Date(today() + "T12:00:00") - new Date(data + "T12:00:00")) / 86400000);
  const fmtDia = (data) => { const d = diasAte(data); return d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`; };

  const grid3 = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14, marginBottom: 14 };
  const custoVendido = fat - lucroPeriodo;

  return (
    <div>
      {mostrarOnbCard && (
        <div style={{ ...card, marginBottom: 14, border: "1px solid #3a3320", background: "linear-gradient(135deg,#161410,#141414)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.1rem", color: "#c9a84c" }}>Primeiros passos</div>
              <div style={{ fontSize: ".78rem", color: "#777", marginTop: 3 }}>{onbPassos.filter(p => p.ok).length} de {onbPassos.length} concluídos · faça do cadastro à 1ª venda</div>
            </div>
            <button onClick={dispensarOnbCard} title="Ocultar" style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4, display: "flex" }}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
            {onbPassos.map((p, i) => (
              <button key={i} onClick={() => !p.ok && onNavigate?.(p.aba)} disabled={p.ok}
                style={{ textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start", padding: "12px", borderRadius: 10, cursor: p.ok ? "default" : "pointer",
                  background: p.ok ? "rgba(76,175,130,.06)" : "#101010", border: `1px solid ${p.ok ? "#2e5a44" : "#222"}` }}>
                <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: p.ok ? "#4caf82" : "transparent", border: `1px solid ${p.ok ? "#4caf82" : "#333"}`, color: p.ok ? "#0a0a08" : "#555", fontSize: ".72rem", fontWeight: 700 }}>
                  {p.ok ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: ".84rem", color: p.ok ? "#888" : "#ddd", textDecoration: p.ok ? "line-through" : "none" }}>{p.label}</span>
                  <span style={{ display: "block", fontSize: ".7rem", color: "#555", marginTop: 2 }}>{p.ok ? "Feito" : p.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>Dashboard</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["semana", "mes", "trimestre"].map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: periodo === p ? "#ffbf00" : "#1a1a1a", color: periodo === p ? "#0a0a08" : "#888", fontSize: ".8rem", fontWeight: periodo === p ? 700 : 400 }}>
              {p === "mes" ? "Mês" : p === "semana" ? "Semana" : "Trimestre"}
            </button>
          ))}
          <button onClick={reload} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #2a2a2a", background: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: ".8rem" }}>
            <Icon name="refresh" size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Hero: faturamento + chart | saldo + lucro */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, minWidth: 0 }}>
          <CardHead title={`Faturamento ${labelPeriodo}`} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: "2.4rem", fontWeight: 700, color: "#ffbf00", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(fat)}</span>
            <Delta pct={deltaFat} />
            {deltaFat !== null && <span style={{ fontSize: ".7rem", color: "#555" }}>{labelAnterior}</span>}
          </div>
          <div style={{ display: "flex", gap: "1.75rem", margin: "12px 0 16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: ".78rem", color: "#666" }}>Ticket médio <b style={{ color: "#c9a84c", fontFamily: "'DM Mono',monospace" }}>{fmt(tkt)}</b></span>
            <span style={{ fontSize: ".78rem", color: "#666" }}>Vendas <b style={{ color: "#e8e4d8", fontFamily: "'DM Mono',monospace" }}>{vp.length}</b></span>
            {fat > 0 && <span style={{ fontSize: ".78rem", color: "#666" }}>Margem <b style={{ color: lucroPeriodo >= 0 ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace" }}>{((lucroPeriodo / fat) * 100).toFixed(1)}%</b></span>}
          </div>
          <LineAreaChart dados={grafico} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ ...card, flex: 1 }}>
            <CardHead title="Saldo no caixa" action="Fluxo" onAction={() => onNavigate?.("financeiro")} />
            <div style={{ fontSize: "1.8rem", fontWeight: 700, color: saldoCaixa >= 0 ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 12 }}>{fmt(saldoCaixa)}</div>
            <div style={{ fontSize: ".74rem", color: "#555", lineHeight: 1.9 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Recebido</span><span style={{ color: "#4caf82", fontFamily: "'DM Mono',monospace" }}>{fmt(totalRecebidoVendas)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Fornecedores</span><span style={{ color: "#e05a5a", fontFamily: "'DM Mono',monospace" }}>−{fmt((contasPagar || []).filter(cp => cp.status === "pago").reduce((a, c) => a + Number(c.valor), 0))}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Despesas</span><span style={{ color: "#e05a5a", fontFamily: "'DM Mono',monospace" }}>−{fmt((despesas || []).reduce((a, d) => a + Number(d.valor), 0))}</span></div>
            </div>
          </div>
          <div style={{ ...card, flex: 1 }}>
            <CardHead title={`Lucro ${labelPeriodo}`} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.8rem", fontWeight: 700, color: lucroPeriodo >= 0 ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(lucroPeriodo)}</span>
              <Delta pct={deltaLucro} />
            </div>
            <div style={{ fontSize: ".72rem", color: "#555", marginTop: 10 }}>A receber <b style={{ color: totalVencido > 0 ? "#e05a5a" : "#e8e4d8", fontFamily: "'DM Mono',monospace" }}>{fmt(totalAReceber)}</b>{totalVencido > 0 && <> · <span style={{ color: "#e05a5a" }}>{fmt(totalVencido)} em atraso</span></>}</div>
          </div>
        </div>
      </div>

      {/* Pendências */}
      <div style={grid3}>
        <div style={card}>
          <CardHead title="Cobranças em atraso" action="Ver todas" onAction={() => onNavigate?.("financeiro")} />
          {contasVencidas.length === 0 && <div style={{ color: "#444", fontSize: ".82rem", padding: "8px 0" }}>Nenhuma cobrança em atraso</div>}
          {contasVencidas.slice(0, 5).map((cr, i, arr) => {
            const cli = clientes.find(c => c.id === cr.cliente_id);
            return (
              <div key={cr.id} style={rowStyle(i === arr.length - 1)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".84rem", color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cli?.nome ?? cr.descricao ?? "Cobrança"}</div>
                  <div style={{ fontSize: ".7rem", color: "#555" }}>venceu {cr.data_vencimento}</div>
                </div>
                <Pill color="#e05a5a" bg="rgba(224,90,90,.12)">{diasAtraso(cr.data_vencimento)}d</Pill>
                <span style={{ fontSize: ".82rem", color: "#e05a5a", fontFamily: "'DM Mono',monospace", fontWeight: 600, flexShrink: 0 }}>{fmt(cr.valor)}</span>
              </div>
            );
          })}
          {contasVencidas.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1c1c1c", display: "flex", justifyContent: "space-between", fontSize: ".74rem", color: "#666" }}>
              <span>{contasVencidas.length} pendência{contasVencidas.length > 1 ? "s" : ""}</span>
              <span style={{ color: "#e05a5a", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(totalVencido)}</span>
            </div>
          )}
        </div>

        <div style={card}>
          <CardHead title="Próximos 14 dias" action="Financeiro" onAction={() => onNavigate?.("financeiro")} />
          {proximos.length === 0 && <div style={{ color: "#444", fontSize: ".82rem", padding: "8px 0" }}>Nenhum vencimento nos próximos 14 dias</div>}
          {proximos.map((c, i, arr) => (
            <div key={`${c.tipo}${c.id}`} style={rowStyle(i === arr.length - 1)}>
              <span style={{ color: c.tipo === "receber" ? "#4caf82" : "#e05a5a", flexShrink: 0, display: "flex" }}>
                <Icon name={c.tipo === "receber" ? "down" : "up"} size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".84rem", color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome}</div>
                <div style={{ fontSize: ".7rem", color: "#555" }}>{c.tipo === "receber" ? "receber" : "pagar"} · {fmtDia(c.data_vencimento)}</div>
              </div>
              <span style={{ fontSize: ".82rem", color: c.tipo === "receber" ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace", fontWeight: 600, flexShrink: 0 }}>
                {c.tipo === "receber" ? "+" : "−"}{fmt(c.valor)}
              </span>
            </div>
          ))}
        </div>

        <div style={card}>
          <CardHead title="Estoque baixo" action="Estoque" onAction={() => onNavigate?.("estoque")} />
          {baixo.length === 0 && <div style={{ color: "#444", fontSize: ".82rem", padding: "8px 0" }}>Nenhum produto abaixo de 10 unidades</div>}
          {baixo.slice(0, 5).map((p, i, arr) => (
            <div key={p.id} style={rowStyle(i === arr.length - 1)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".84rem", color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
                <div style={{ fontSize: ".7rem", color: "#555" }}>{p.categoria || "sem categoria"}</div>
              </div>
              <Pill color={p.estoque === 0 ? "#e05a5a" : "#e8a020"} bg={p.estoque === 0 ? "rgba(224,90,90,.12)" : "rgba(232,160,32,.12)"}>
                {p.estoque} {p.unidade || "un"}
              </Pill>
            </div>
          ))}
          {baixo.length > 5 && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1c1c1c", fontSize: ".74rem", color: "#666" }}>+ {baixo.length - 5} outro{baixo.length - 5 > 1 ? "s" : ""} produto{baixo.length - 5 > 1 ? "s" : ""}</div>}
        </div>
      </div>

      {/* Rankings + resumo */}
      <div style={grid3}>
        <div style={card}>
          <CardHead title="Top produtos" action="Relatórios" onAction={() => onNavigate?.("relatorios")} />
          {topProd.length === 0 && <div style={{ color: "#444", fontSize: ".82rem", padding: "8px 0" }}>Sem vendas no período</div>}
          {topProd.map((tp, i, arr) => {
            const p = produtos.find(x => x.id === tp.id);
            return (
              <div key={tp.id} style={rowStyle(i === arr.length - 1)}>
                <span style={{ fontSize: ".75rem", fontFamily: "'DM Mono',monospace", color: i === 0 ? "#ffbf00" : "#3a3a3a", width: 18, flexShrink: 0, fontWeight: 700 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".84rem", color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p?.nome ?? `Produto #${tp.id}`}</div>
                  <div style={{ fontSize: ".7rem", color: "#555" }}>{fmt(tp.valor)}</div>
                </div>
                <Sparkline values={sparkProd(tp.id)} />
                <span style={{ fontSize: ".8rem", color: "#ffbf00", fontFamily: "'DM Mono',monospace", fontWeight: 600, flexShrink: 0, minWidth: 44, textAlign: "right" }}>{tp.qty} un</span>
              </div>
            );
          })}
        </div>

        <div style={card}>
          <CardHead title="Top clientes" action="Clientes" onAction={() => onNavigate?.("clientes")} />
          {topCli.length === 0 && <div style={{ color: "#444", fontSize: ".82rem", padding: "8px 0" }}>Sem vendas no período</div>}
          {topCli.map((tc, i, arr) => {
            const c = clientes.find(x => x.id === tc.id);
            return (
              <div key={tc.id} style={rowStyle(i === arr.length - 1)}>
                <span style={{ fontSize: ".75rem", fontFamily: "'DM Mono',monospace", color: i === 0 ? "#ffbf00" : "#3a3a3a", width: 18, flexShrink: 0, fontWeight: 700 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: ".84rem", color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c?.nome ?? `Cliente #${tc.id}`}</div>
                  <div style={{ fontSize: ".7rem", color: "#555" }}>{c?.cidade ? `${c.cidade} · ` : ""}{tc.pedidos} pedido{tc.pedidos > 1 ? "s" : ""}</div>
                </div>
                <Sparkline values={sparkCli(tc.id)} color="#4caf82" />
                <span style={{ fontSize: ".8rem", color: "#ffbf00", fontFamily: "'DM Mono',monospace", flexShrink: 0, minWidth: 70, textAlign: "right" }}>{fmt(tc.total)}</span>
              </div>
            );
          })}
        </div>

        <div style={card}>
          <CardHead title={`Resumo ${labelPeriodo}`} />
          <div style={{ fontSize: ".72rem", color: "#555", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Entradas</span><span style={{ fontFamily: "'DM Mono',monospace", color: "#e8e4d8" }}>{fmt(fat)}</span>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#1c1c1c", marginBottom: 6 }}>
            {fat > 0 && <>
              <div style={{ width: `${Math.max((lucroPeriodo / fat) * 100, 0)}%`, background: "#4caf82" }} title={`Lucro ${fmt(lucroPeriodo)}`} />
              <div style={{ width: `${Math.min((custoVendido / fat) * 100, 100)}%`, background: "#5a4a00" }} title={`Custo ${fmt(custoVendido)}`} />
            </>}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: ".68rem", color: "#666", marginBottom: 16, flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#4caf82", marginRight: 5 }} />Lucro {fmt(lucroPeriodo)}</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#5a4a00", marginRight: 5 }} />Custo {fmt(custoVendido)}</span>
          </div>

          <div style={{ fontSize: ".72rem", color: "#555", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Despesas</span><span style={{ fontFamily: "'DM Mono',monospace", color: totalDespesas > 0 ? "#e05a5a" : "#e8e4d8" }}>{fmt(totalDespesas)}</span>
          </div>
          {totalDespesas > 0 ? (
            <>
              <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#1c1c1c", marginBottom: 6 }}>
                {despPorCat.map(([cat, val], i) => (
                  <div key={cat} style={{ width: `${(val / totalDespesas) * 100}%`, background: CAT_CORES[i % CAT_CORES.length] }} title={`${cat} ${fmt(val)}`} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: ".68rem", color: "#666", flexWrap: "wrap", marginBottom: 16 }}>
                {despPorCat.slice(0, 4).map(([cat, val], i) => (
                  <span key={cat}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CAT_CORES[i % CAT_CORES.length], marginRight: 5 }} />{cat} {fmt(val)}</span>
                ))}
              </div>
            </>
          ) : <div style={{ fontSize: ".74rem", color: "#444", marginBottom: 16 }}>Sem despesas no período</div>}

          <div style={{ borderTop: "1px solid #1c1c1c", paddingTop: 12, fontSize: ".74rem", color: "#666", lineHeight: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Custo do estoque</span><span style={{ fontFamily: "'DM Mono',monospace", color: "#e8e4d8" }}>{fmt(custoEstoque)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Produtos cadastrados</span><span style={{ fontFamily: "'DM Mono',monospace", color: "#e8e4d8" }}>{produtos.length}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>A receber (aberto)</span><span style={{ fontFamily: "'DM Mono',monospace", color: totalVencido > 0 ? "#e05a5a" : "#e8e4d8" }}>{fmt(totalAReceber)}</span></div>
          </div>
        </div>
      </div>

      {/* Movimentos recentes */}
      <div style={{ ...card, padding: 0 }}>
        <div style={{ padding: "1.25rem 1.25rem 0" }}>
          <CardHead title="Movimentos recentes" action="Estoque" onAction={() => onNavigate?.("estoque")} />
        </div>
        {movimentos.slice(0, 6).map(m => {
          const p = produtos.find(x => x.id === m.produto_id);
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: ".8rem 1.25rem", borderTop: "1px solid #1a1a1a" }}>
              <div style={{ color: m.tipo === "entrada" ? "#4caf82" : "#e05a5a", flexShrink: 0 }}><Icon name={m.tipo === "entrada" ? "up" : "down"} size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".88rem", color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p?.nome ?? "Produto removido"}</div>
                <div style={{ fontSize: ".74rem", color: "#555" }}>{m.obs || m.tipo} · {m.data}</div>
              </div>
              <div style={{ fontSize: ".88rem", fontWeight: 600, color: m.tipo === "entrada" ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace" }}>
                {m.tipo === "entrada" ? "+" : "-"}{m.quantidade} un
              </div>
            </div>
          );
        })}
        {movimentos.length === 0 && <div style={{ padding: "1.5rem", color: "#555", textAlign: "center", fontSize: ".85rem", borderTop: "1px solid #1a1a1a" }}>Nenhum movimento registrado</div>}
      </div>
    </div>
  );
};

export default Dashboard;
