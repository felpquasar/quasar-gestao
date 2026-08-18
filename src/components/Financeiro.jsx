import { useState } from 'react';
import { fmt, today } from '../lib/utils';
import ContasReceber from './ContasReceber';
import ContasPagar from './ContasPagar';
import Fornecedores from './Fornecedores';
import FluxoCaixa from './FluxoCaixa';
import Despesas from './Despesas';

const Financeiro = ({ t = (k) => k, contasReceber, setContasReceber, contasPagar, setContasPagar, fornecedores, setFornecedores, clientes, vendas, setVendas, despesas, setDespesas, notify }) => {
  const [aba, setAba] = useState("receber");

  const qtdReceberVencidas = contasReceber.filter(cr => cr.status !== "pago" && cr.data_vencimento < today()).length;
  const qtdPagarVencidas = contasPagar.filter(cp => cp.status !== "pago" && cp.data_vencimento < today()).length;

  // Conta só o que já entrou de fato: venda paga = total; venda pendente parcelada = só a entrada; demais pendentes (sem cobrança rastreada) = total, igual ao resto do app.
  const totalVendas = (vendas || []).filter(v => v.status !== "cancelado").reduce((a, v) => {
    const recebido = v.status === "pago" ? Number(v.total) : (v.forma_pagamento === "parcelado" ? Number(v.valor_entrada || 0) : Number(v.total));
    return a + recebido;
  }, 0);
  const totalFornecedores = contasPagar.filter(cp => cp.status === "pago").reduce((a, c) => a + Number(c.valor), 0);
  const totalDespesas = (despesas || []).reduce((a, d) => a + Number(d.valor), 0);
  const saldoCaixa = totalVendas - totalFornecedores - totalDespesas;

  const tabs = [
    { id: "receber", label: "A Receber", badge: qtdReceberVencidas },
    { id: "pagar", label: "A Pagar", badge: qtdPagarVencidas },
    { id: "fornecedores", label: "Fornecedores" },
    { id: "fluxo", label: "Fluxo de Caixa" },
    { id: "despesas", label: "Despesas" },
  ];

  return (
    <div>
      <div style={{ background: "#141414", border: "1px solid #1f1f1f", borderRadius: 14, padding: "1.1rem 1.5rem", marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 7 }}>Saldo no Caixa</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: saldoCaixa >= 0 ? "#4caf82" : "#e05a5a", fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{fmt(saldoCaixa)}</div>
        </div>
        <div style={{ fontSize: ".74rem", color: "#555", minWidth: 220, lineHeight: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Vendas</span><span style={{ color: "#4caf82", fontFamily: "'DM Mono',monospace" }}>{fmt(totalVendas)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Fornecedores</span><span style={{ color: "#e05a5a", fontFamily: "'DM Mono',monospace" }}>−{fmt(totalFornecedores)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Despesas</span><span style={{ color: "#e05a5a", fontFamily: "'DM Mono',monospace" }}>−{fmt(totalDespesas)}</span></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: "1.75rem", borderBottom: "1px solid #1f1f1f", overflowX: "auto" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setAba(tab.id)}
            style={{ padding: "8px 16px 11px", border: "none", borderBottom: `2px solid ${aba === tab.id ? "#ffbf00" : "transparent"}`, background: "transparent", cursor: "pointer", color: aba === tab.id ? "#e0d6b8" : "#3a3835", fontSize: ".88rem", fontWeight: aba === tab.id ? 600 : 400, display: "inline-flex", alignItems: "center", gap: 7, transition: "all .15s", marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0 }}>
            {tab.label}
            {tab.badge > 0 && (
              <span style={{ background: "#e05a5a", color: "#fff", borderRadius: 6, padding: "1px 6px", fontSize: ".65rem", fontWeight: 700, minWidth: 18, textAlign: "center" }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba === "receber" && (
        <ContasReceber t={t} contasReceber={contasReceber} setContasReceber={setContasReceber} clientes={clientes} vendas={vendas} setVendas={setVendas} notify={notify} />
      )}
      {aba === "pagar" && (
        <ContasPagar contasPagar={contasPagar} setContasPagar={setContasPagar} fornecedores={fornecedores} notify={notify} />
      )}
      {aba === "fornecedores" && (
        <Fornecedores fornecedores={fornecedores} setFornecedores={setFornecedores} contasPagar={contasPagar} notify={notify} />
      )}
      {aba === "fluxo" && (
        <FluxoCaixa t={t} contasReceber={contasReceber} setContasReceber={setContasReceber} contasPagar={contasPagar} setContasPagar={setContasPagar} clientes={clientes} fornecedores={fornecedores} notify={notify} />
      )}
      {aba === "despesas" && (
        <Despesas despesas={despesas} setDespesas={setDespesas} notify={notify} />
      )}
    </div>
  );
};

export default Financeiro;

