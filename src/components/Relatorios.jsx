import { useState } from 'react';
import RelatorioDRE from './RelatorioDRE';
import RelatorioVendas from './RelatorioVendas';
import RelatorioInadimplencia from './RelatorioInadimplencia';
import RelatorioMargem from './RelatorioMargem';

const Relatorios = ({ t = (k) => k, vendas, clientes, produtos, contasReceber, contasPagar }) => {
  const [aba, setAba] = useState("dre");

  const tabs = [
    { id: "dre", label: "DRE" },
    { id: "vendas", label: "Análise de Vendas" },
    { id: "inadimplencia", label: "Inadimplência" },
    { id: "margem", label: "Margem por Produto" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: "1.75rem", borderBottom: "1px solid #1f1f1f" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setAba(tab.id)}
            style={{ padding: "8px 20px 11px", border: "none", borderBottom: `2px solid ${aba === tab.id ? "#ffbf00" : "transparent"}`, background: "transparent", cursor: "pointer", color: aba === tab.id ? "#e0d6b8" : "#3a3835", fontSize: ".92rem", fontWeight: aba === tab.id ? 600 : 400, transition: "all .15s", marginBottom: -1 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {aba === "dre" && <RelatorioDRE contasReceber={contasReceber} contasPagar={contasPagar} />}
      {aba === "vendas" && <RelatorioVendas t={t} vendas={vendas} clientes={clientes} produtos={produtos} />}
      {aba === "inadimplencia" && <RelatorioInadimplencia t={t} contasReceber={contasReceber} clientes={clientes} />}
      {aba === "margem" && <RelatorioMargem vendas={vendas} produtos={produtos} />}
    </div>
  );
};

export default Relatorios;
