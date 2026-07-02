// Fonte única de verdade dos planos. Não espalhar `if plano === 'pro'` pelo
// código — sempre consultar `can(plano, feature)` daqui.

// O que CADA plano destrava (só o que ele adiciona; herança é em cascata).
export const CAPS = {
  nucleo:      ["dashboard", "estoque", "vendas", "clientes", "agenda", "pacotes"],
  quasar_pro:  ["financeiro", "crm_recompra", "relatorios", "descontos", "multi_profissional"],
  constelacao: ["insights", "multi_unidade", "dashboard_consolidado"],
};

// Ordem dos planos (mais barato -> mais caro). Define a herança.
export const ORDEM = ["nucleo", "quasar_pro", "constelacao"];

export const PLANO_LABEL = {
  nucleo: "Núcleo",
  quasar_pro: "Quasar Pro",
  constelacao: "Constelação",
};

export const LIMITES = {
  nucleo:      { unidades: 1, profissionais: 1 },
  quasar_pro:  { unidades: 1, profissionais: Infinity },
  constelacao: { unidades: 3, profissionais: Infinity },
};

// Todas as capacidades de um plano = ele + os anteriores (cascata).
const capsDo = (plano) =>
  ORDEM.slice(0, ORDEM.indexOf(plano) + 1).flatMap((p) => CAPS[p]);

// Plano tem acesso à feature? (feature falsy = sempre liberado)
export const can = (plano, feature) =>
  !feature || capsDo(ORDEM.includes(plano) ? plano : "nucleo").includes(feature);

// Menor plano que destrava a feature (pra mensagem de upsell). Null = base.
export const planoQueDestrava = (feature) => {
  const p = ORDEM.find((p) => CAPS[p].includes(feature));
  return p ? PLANO_LABEL[p] : null;
};
