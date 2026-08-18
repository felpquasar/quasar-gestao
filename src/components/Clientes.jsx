import { useState, useMemo, useEffect } from 'react';
import { useMobile } from '../hooks/useMobile';
import { supabase } from '../lib/supabase';
import { fmt, today, saldoCr } from '../lib/utils';
import { inp, btn } from '../styles/shared';
import { podeSubSegmento } from '../lib/clinico';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import Field from './ui/Field';
import Spinner from './ui/Spinner';
import Confirm from './ui/Confirm';
import EmptyState from './ui/EmptyState';
import { Gate } from './ui/Gate';
import Anamnese from './clinico/Anamnese';
import Evolucao from './clinico/Evolucao';
import DocumentosClinicos from './clinico/DocumentosClinicos';
import PlanoTratamento from './clinico/PlanoTratamento';
import Odontograma from './clinico/Odontograma';

const calcTier = (n) => {
  if (n >= 4) return { nome: "Elite", pct: 20, cor: "#c9a84c" };
  if (n >= 3) return { nome: "Ouro", cor: "#c9a84c", pct: 15 };
  if (n >= 1) return { nome: "Bronze", cor: "#cd7f32", pct: 5 };
  return null;
};

const card = { background: "#141414", border: "1px solid #1f1f1f", borderRadius: 14 };
const Badge = ({ children, color }) => (
  <span style={{ fontSize: ".65rem", padding: "2px 7px", borderRadius: 4, background: color + "22", color, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>
);

const TIPOS = ["Barbearia", "Salão", "Distribuidor", "Outros"];
const tipoCor = { Barbearia: "#ffbf00", Salão: "#b86fcf", Distribuidor: "#6b9fd4", Outros: "#4caf82" };

const Clientes = ({
  t, clientes, setClientes, vendas, produtos, contasReceber, pacotesCliente = [], notify,
  segmento, subSegmento, tenantId, plano,
  anamneses = [], setAnamneses, evolucoes = [], setEvolucoes, agendamentos = [],
  planosTratamento = [], setPlanosTratamento, fasesTratamento = [], setFasesTratamento,
  documentosClinicos = [], setDocumentosClinicos, odontogramas = [], setOdontogramas,
}) => {
  const isMobile = useMobile();
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [ordem, setOrdem] = useState("total");
  const [selId, setSelId] = useState(null);
  const [detalheVenda, setDetalheVenda] = useState(null);
  const [abaFicha, setAbaFicha] = useState("geral");
  const ehSaude = segmento === "saude";

  useEffect(() => { setAbaFicha("geral"); }, [selId]);
  const [form, setForm] = useState({ nome: "", contato: "", telefone: "", cidade: "", tipo: "Barbearia", limite_credito: "", indicado_por: "" });
  const [confirmState, setConfirmState] = useState(null);

  const abrir = (c = null) => {
    setEditando(c);
    setForm(c
      ? { nome: c.nome, contato: c.contato || "", telefone: c.telefone || "", cidade: c.cidade || "", tipo: c.tipo || "Barbearia", limite_credito: c.limite_credito || "", indicado_por: c.indicado_por || "" }
      : { nome: "", contato: "", telefone: "", cidade: "", tipo: "Barbearia", limite_credito: "", indicado_por: "" });
    setModal(true);
  };

  // Ajusta o contador de indicações de um indicador (+1 nova indicação, -1 indicação desfeita).
  const ajustarIndicador = async (refId, delta) => {
    const referrer = clientes.find(c => c.id === refId);
    if (!referrer) return;
    const novasIndicacoes = Math.max(0, (Number(referrer.indicacoes_ativas) || 0) + delta);
    const tier = calcTier(novasIndicacoes);
    const novoDesconto = tier ? tier.pct : 0;
    const { error: eRef } = await supabase.from("clientes")
      .update({ indicacoes_ativas: novasIndicacoes, desconto_pendente: novoDesconto })
      .eq("id", refId);
    if (eRef) { notify("Cliente salvo, mas houve erro ao atualizar a indicação do indicador.", "error"); return; }
    setClientes(prev => prev.map(c => c.id === refId ? { ...c, indicacoes_ativas: novasIndicacoes, desconto_pendente: novoDesconto } : c));
  };

  const salvar = async () => {
    if (!form.nome) return; setSaving(true);
    const novoIndicadoPor = form.indicado_por ? Number(form.indicado_por) : null;
    const payload = {
      nome: form.nome, contato: form.contato, telefone: form.telefone,
      cidade: form.cidade, tipo: form.tipo, limite_credito: Number(form.limite_credito) || 0,
      indicado_por: novoIndicadoPor,
    };
    if (editando) {
      const antigoIndicadoPor = editando.indicado_por ? Number(editando.indicado_por) : null;
      const { data, error } = await supabase.from("clientes").update(payload).eq("id", editando.id).select().single();
      if (error) { setSaving(false); notify("Erro ao salvar", "error"); return; }
      setClientes(prev => prev.map(c => c.id === editando.id ? data : c));
      // Indicação mudou de dono: desfaz do antigo indicador e aplica no novo.
      // Fica dentro do "saving" até terminar, pra não deixar o botão liberar duplo-clique no meio do ajuste.
      if (antigoIndicadoPor !== novoIndicadoPor) {
        if (antigoIndicadoPor) await ajustarIndicador(antigoIndicadoPor, -1);
        if (novoIndicadoPor) await ajustarIndicador(novoIndicadoPor, 1);
      }
      setSaving(false);
    } else {
      const { data, error } = await supabase.from("clientes").insert(payload).select().single();
      if (error) { setSaving(false); notify("Erro ao salvar", "error"); return; }
      setClientes(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setSelId(data.id);
      if (novoIndicadoPor) await ajustarIndicador(novoIndicadoPor, 1);
      setSaving(false);
    }
    setModal(false); notify(`${t("cliente")} ${editando ? "atualizado." : "cadastrado."}`);
  };

  const usarDesconto = (c) => {
    setConfirmState({ msg: `Aplicar ${c.desconto_pendente}% de desconto para ${c.nome}? Isso zerará o contador de indicações.`, danger: false, onConfirm: async () => {
      const { error } = await supabase.from("clientes").update({ indicacoes_ativas: 0, desconto_pendente: 0 }).eq("id", c.id);
      if (error) { notify("Erro ao aplicar desconto", "error"); return; }
      setClientes(prev => prev.map(x => x.id === c.id ? { ...x, indicacoes_ativas: 0, desconto_pendente: 0 } : x));
      notify(`Desconto de ${c.desconto_pendente}% aplicado e zerado.`);
    }});
  };

  const excluir = (id) => {
    setConfirmState({ msg: `Excluir este ${t("cliente").toLowerCase()}?`, onConfirm: async () => {
      const cli = clientes.find(c => c.id === id);
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) { notify(error.code === "23503" ? "Não é possível excluir: existe outro cliente indicado por este." : "Erro ao excluir", "error"); return; }
      setClientes(prev => prev.filter(c => c.id !== id));
      if (selId === id) setSelId(null);
      if (cli?.indicado_por) await ajustarIndicador(Number(cli.indicado_por), -1);
      notify(`${t("cliente")} excluído.`);
    }});
  };

  const metricas = (cid) => { const vs = vendas.filter(v => v.cliente_id === cid && v.status !== "cancelado"); const tot = vs.reduce((a, v) => a + Number(v.total), 0); return { total: tot, pedidos: vs.length, ticket: vs.length > 0 ? tot / vs.length : 0 }; };
  const vcli = (cid) => vendas.filter(v => v.cliente_id === cid).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const statusCor = { pago: "#4caf82", pendente: "#e8a020", cancelado: "#e05a5a" };

  const inadimplente = (cid) => (contasReceber || []).some(cr => cr.cliente_id === cid && cr.status !== "pago" && cr.data_vencimento < today());
  const pendenteCli = (cid) => (contasReceber || []).filter(cr => cr.cliente_id === cid && cr.status !== "pago").reduce((a, c) => a + saldoCr(c), 0);

  const lista = useMemo(() => {
    let l = clientes
      .filter(c => c.nome.toLowerCase().includes(filtro.toLowerCase()) || (c.cidade || "").toLowerCase().includes(filtro.toLowerCase()))
      .filter(c => filtroTipo === "todos" || c.tipo === filtroTipo)
      .map(c => ({ ...c, _m: metricas(c.id), _inadim: inadimplente(c.id) }));
    if (ordem === "total") l.sort((a, b) => b._m.total - a._m.total);
    else l.sort((a, b) => a.nome.localeCompare(b.nome));
    return l;
  }, [clientes, filtro, filtroTipo, ordem, vendas, contasReceber]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = selId ? clientes.find(c => c.id === selId) : null;
  const qtdInadim = clientes.filter(c => inadimplente(c.id)).length;

  const waLink = (tel) => {
    const dig = (tel || "").replace(/\D/g, "");
    if (!dig) return null;
    return `https://wa.me/${dig.length <= 11 ? "55" + dig : dig}`;
  };

  const ordBtn = (key, label) => (
    <button onClick={() => setOrdem(key)}
      style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: ordem === key ? "#262626" : "transparent", color: ordem === key ? "#e0d6b8" : "#555", fontSize: ".72rem", fontWeight: ordem === key ? 600 : 400 }}>
      {label}
    </button>
  );

  const listaPane = (
    <div style={{ ...card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #1c1c1c", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Buscar nome ou cidade..." value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inp, flex: 1, minWidth: 140, padding: "8px 10px", fontSize: ".82rem" }} />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: ".78rem" }}>
          <option value="todos">Todos os tipos</option>
          {TIPOS.map(tp => <option key={tp}>{tp}</option>)}
        </select>
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #1c1c1c", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: ".68rem", color: "#444", textTransform: "uppercase", letterSpacing: ".08em", marginRight: 4 }}>Ordenar</span>
        {ordBtn("total", "Maior total")}
        {ordBtn("nome", "Nome")}
        <span style={{ marginLeft: "auto", fontSize: ".7rem", color: "#444", fontFamily: "'DM Mono',monospace" }}>{lista.length}</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {lista.length === 0 && <EmptyState iconName="users" title={`Nenhum ${t("cliente").toLowerCase()} encontrado`} subtitle={filtro ? `Sem resultados para "${filtro}"` : `Cadastre o primeiro ${t("cliente").toLowerCase()}`} />}
        {lista.map(c => {
          const ativo = selId === c.id;
          return (
            <button key={c.id} onClick={() => { setSelId(c.id); setDetalheVenda(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid #191919", cursor: "pointer", background: ativo ? "rgba(255,191,0,.05)" : "transparent", boxShadow: ativo ? "inset 2px 0 0 #ffbf00" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: ativo ? "#f0ead8" : "#ccc", fontSize: ".88rem" }}>{c.nome}</span>
                  {c._inadim && <span title="Inadimplente" style={{ width: 7, height: 7, borderRadius: "50%", background: "#e05a5a", flexShrink: 0 }} />}
                  {Number(c.desconto_pendente) > 0 && <Badge color="#4caf82">{c.desconto_pendente}%</Badge>}
                </div>
                <div style={{ fontSize: ".7rem", color: "#555", marginTop: 2 }}>
                  <span style={{ color: tipoCor[c.tipo] || "#4caf82" }}>{c.tipo}</span>{c.cidade ? ` · ${c.cidade}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: ".82rem", color: c._m.total > 0 ? "#ffbf00" : "#3a3a3a", fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(c._m.total)}</div>
                <div style={{ fontSize: ".68rem", color: "#444" }}>{c._m.pedidos} pedido{c._m.pedidos !== 1 ? "s" : ""}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const detalhePane = (() => {
    if (!sel) return (
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <EmptyState iconName="users" title={`Selecione um ${t("cliente").toLowerCase()}`} subtitle={`Clique em um ${t("cliente").toLowerCase()} na lista para ver detalhes, pedidos e crédito`} />
      </div>
    );
    const m = metricas(sel.id);
    const pendente = pendenteCli(sel.id);
    const limCred = Number(sel.limite_credito) || 0;
    const pctCred = limCred > 0 ? Math.min(pendente / limCred * 100, 100) : 0;
    const corCred = pctCred >= 90 ? "#e05a5a" : pctCred >= 70 ? "#e8a020" : "#4caf82";
    const tier = calcTier(Number(sel.indicacoes_ativas) || 0);
    const indicador = sel.indicado_por ? clientes.find(x => x.id === sel.indicado_por) : null;
    const inadim = inadimplente(sel.id);
    const wa = waLink(sel.telefone);
    const pedidos = vcli(sel.id);
    const cartelas = (pacotesCliente || []).filter(pc => pc.cliente_id === sel.id);

    return (
      <div style={{ ...card, padding: "1.25rem", minWidth: 0 }}>
        {isMobile && (
          <button onClick={() => setSelId(null)} style={{ ...btn("ghost"), padding: "5px 10px", fontSize: ".75rem", marginBottom: 12 }}>
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="chevron" size={12} /></span> Voltar
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.25rem", color: "#e8e4d8" }}>{sel.nome}</span>
              <Badge color={tipoCor[sel.tipo] || "#4caf82"}>{sel.tipo}</Badge>
              {tier && <Badge color={tier.cor}>{tier.nome}</Badge>}
              {inadim && <Badge color="#e05a5a">Inadimplente</Badge>}
            </div>
            {indicador && <div style={{ fontSize: ".72rem", color: "#555", marginTop: 4 }}>Indicado por {indicador.nome}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={{ ...btn("ghost"), padding: "6px 10px", fontSize: ".75rem" }} onClick={() => abrir(sel)}><Icon name="pencil" size={13} /> Editar</button>
            <button style={{ ...btn("danger"), padding: "6px 10px", fontSize: ".75rem" }} onClick={() => excluir(sel.id)}><Icon name="trash" size={13} /></button>
          </div>
        </div>

        {ehSaude && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
            {[["geral", "Geral"], ["clinico", "Clínico"]].map(([v, label]) => (
              <button key={v} onClick={() => setAbaFicha(v)}
                style={{ padding: "8px 14px", border: "none", borderBottom: `2px solid ${abaFicha === v ? "#ffbf00" : "transparent"}`, background: "transparent",
                  color: abaFicha === v ? "#e0d6b8" : "#555", fontSize: ".82rem", fontWeight: abaFicha === v ? 600 : 400, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {abaFicha === "clinico" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Anamnese</div>
              <Anamnese clienteId={sel.id} anamneses={anamneses} setAnamneses={setAnamneses} notify={notify} />
            </div>
            <div>
              <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Evolução</div>
              <Evolucao clienteId={sel.id} evolucoes={evolucoes} setEvolucoes={setEvolucoes} agendamentos={agendamentos} notify={notify} />
            </div>
            <div>
              <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Documentos</div>
              <DocumentosClinicos tenantId={tenantId} clienteId={sel.id} documentosClinicos={documentosClinicos} setDocumentosClinicos={setDocumentosClinicos} notify={notify} />
            </div>
            {podeSubSegmento(subSegmento, "plano_tratamento") && (
              <div>
                <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Plano de tratamento</div>
                <Gate plano={plano} feature="gestao_clinica" titulo="Plano de tratamento">
                  <PlanoTratamento clienteId={sel.id} planosTratamento={planosTratamento} setPlanosTratamento={setPlanosTratamento} fasesTratamento={fasesTratamento} setFasesTratamento={setFasesTratamento} notify={notify} />
                </Gate>
              </div>
            )}
            {podeSubSegmento(subSegmento, "odontograma") && (
              <div>
                <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Odontograma</div>
                <Gate plano={plano} feature="gestao_clinica" titulo="Odontograma">
                  <Odontograma clienteId={sel.id} odontogramas={odontogramas} setOdontogramas={setOdontogramas} notify={notify} />
                </Gate>
              </div>
            )}
          </div>
        ) : (
        <>
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginBottom: 16, fontSize: ".8rem", color: "#888" }}>
          {sel.contato && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: "#555", display: "flex" }}><Icon name="users" size={13} /></span>{sel.contato}</span>}
          {sel.telefone && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: "#555", display: "flex" }}><Icon name="phone" size={13} /></span>{sel.telefone}</span>}
          {sel.cidade && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: "#555", display: "flex" }}><Icon name="pin" size={13} /></span>{sel.cidade}</span>}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#4caf82", textDecoration: "none", fontWeight: 600 }}>
              <Icon name="chat" size={13} /> WhatsApp
            </a>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, border: "1px solid #1d1d1d", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          {[{ label: "Total gasto", value: fmt(m.total), cor: "#ffbf00" }, { label: "Pedidos", value: m.pedidos, cor: "#e8e4d8" }, { label: "Ticket médio", value: fmt(m.ticket), cor: "#c9a84c" }].map((s, i) => (
            <div key={i} style={{ padding: "12px 14px", borderLeft: i > 0 ? "1px solid #1d1d1d" : "none", background: "#121212" }}>
              <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: s.cor, fontFamily: "'DM Mono',monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {limCred > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", marginBottom: 6 }}>
              <span style={{ color: "#555", textTransform: "uppercase", letterSpacing: ".08em", fontSize: ".62rem" }}>Limite de crédito</span>
              <span style={{ color: corCred, fontFamily: "'DM Mono',monospace" }}>{fmt(pendente)} / {fmt(limCred)}</span>
            </div>
            <div style={{ background: "#1c1c1c", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pctCred}%`, height: "100%", background: corCred, borderRadius: 4, transition: "width .3s" }} />
            </div>
          </div>
        )}

        {(Number(sel.indicacoes_ativas) > 0 || Number(sel.desconto_pendente) > 0) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid #1e3a2a", background: "rgba(76,175,130,.05)", borderRadius: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: ".8rem", color: "#888" }}>
              <b style={{ color: "#e0e0e0" }}>{Number(sel.indicacoes_ativas) || 0}</b> indicaç{Number(sel.indicacoes_ativas) === 1 ? "ão" : "ões"} ativa{Number(sel.indicacoes_ativas) === 1 ? "" : "s"}
              {Number(sel.desconto_pendente) > 0 && <> · desconto de <b style={{ color: "#4caf82", fontFamily: "'DM Mono',monospace" }}>{sel.desconto_pendente}%</b> disponível</>}
            </div>
            {Number(sel.desconto_pendente) > 0 && (
              <button style={{ ...btn("primary"), padding: "6px 12px", fontSize: ".75rem" }} onClick={() => usarDesconto(sel)}>Usar {sel.desconto_pendente}%</button>
            )}
          </div>
        )}

        {cartelas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>{t("pacote")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cartelas.map(pc => {
                const s = pc.sessoes_total - pc.sessoes_usadas;
                const venc = pc.data_validade && pc.data_validade < today();
                const esgotada = s <= 0;
                const pct = pc.sessoes_total > 0 ? (pc.sessoes_usadas / pc.sessoes_total) * 100 : 0;
                return (
                  <div key={pc.id} style={{ border: "1px solid #1d1d1d", borderRadius: 10, padding: "10px 12px", background: "#121212", opacity: esgotada || venc ? .55 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: ".8rem", color: "#ccc" }}>{pc.pacotes?.nome || "—"}{pc.data_validade && <span style={{ fontSize: ".68rem", color: venc ? "#e05a5a" : "#555" }}> · {venc ? "vencida" : `val. ${pc.data_validade}`}</span>}</span>
                      <span style={{ fontSize: ".75rem", fontFamily: "'DM Mono',monospace", color: esgotada ? "#e05a5a" : "#4caf82" }}>{pc.sessoes_usadas}/{pc.sessoes_total}</span>
                    </div>
                    <div style={{ background: "#1c1c1c", borderRadius: 4, height: 5, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: esgotada ? "#e05a5a" : "#4caf82", transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ fontSize: ".62rem", color: "#555", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, margin: "0 0 10px" }}>Pedidos</div>
        {pedidos.length === 0 && <div style={{ color: "#444", fontSize: ".82rem" }}>Nenhuma venda registrada</div>}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {pedidos.map((v, i) => (
            <div key={v.id} style={{ borderTop: i > 0 ? "1px solid #1c1c1c" : "none" }}>
              <button onClick={() => setDetalheVenda(detalheVenda?.id === v.id ? null : v)}
                style={{ width: "100%", background: "transparent", border: "none", padding: "10px 2px", cursor: "pointer", color: "inherit", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: ".75rem", fontFamily: "'DM Mono',monospace", color: "#555" }}>#{String(v.id).slice(-4)}</span>
                      <span style={{ fontSize: ".68rem", padding: "1px 8px", borderRadius: 4, background: (statusCor[v.status] || "#555") + "22", color: statusCor[v.status] || "#888" }}>{v.status}</span>
                    </div>
                    <div style={{ fontSize: ".72rem", color: "#555" }}>{v.data} · {(v.venda_itens || []).length} item(s)</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: ".9rem", fontWeight: 700, color: "#e0e0e0", fontFamily: "'DM Mono',monospace" }}>{fmt(v.total)}</span>
                    <span style={{ color: "#555", display: "flex", transform: detalheVenda?.id === v.id ? "rotate(90deg)" : "none", transition: ".2s" }}><Icon name="chevron" size={14} /></span>
                  </div>
                </div>
              </button>
              {detalheVenda?.id === v.id && (
                <div style={{ background: "#101010", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                  {(v.venda_itens || []).map((it, j) => { const p = produtos.find(x => x.id === it.produto_id); const isSessao = it.pacote_cliente_id != null; return (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: j < (v.venda_itens || []).length - 1 ? "1px solid #1a1a1a" : "none", fontSize: ".8rem" }}>
                      <span style={{ color: "#ccc", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isSessao ? <>{t("atendimento")} <span style={{ color: "#4caf82", fontSize: ".72rem" }}>({t("pacote").toLowerCase()})</span></> : (p?.nome ?? "Produto removido")}
                      </span>
                      <span style={{ color: isSessao ? "#4caf82" : "#888", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>{isSessao ? "grátis" : `${it.quantidade}x ${fmt(it.preco)}`}</span>
                    </div>
                  ); })}
                  {(v.venda_itens || []).length === 0 && <div style={{ color: "#444", fontSize: ".78rem" }}>Sem itens</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
        )}
      </div>
    );
  })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: "1.6rem", color: "#c9a84c", margin: 0 }}>{t("clientes")}</h2>
          <div style={{ fontSize: ".74rem", color: "#555", marginTop: 2 }}>
            {clientes.length} cadastrado{clientes.length !== 1 ? "s" : ""}{qtdInadim > 0 && <> · <span style={{ color: "#e05a5a" }}>{qtdInadim} inadimplente{qtdInadim > 1 ? "s" : ""}</span></>}
          </div>
        </div>
        <button style={btn("primary")} onClick={() => abrir()}><Icon name="plus" size={14} /> Novo {t("cliente")}</button>
      </div>

      {isMobile
        ? (sel ? detalhePane : listaPane)
        : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,2fr) 3fr", gap: 14, alignItems: "start" }}>
            <div style={{ position: "sticky", top: 0, maxHeight: "calc(100dvh - 180px)", display: "flex" }}>{listaPane}</div>
            {detalhePane}
          </div>
        )}

      {modal && (
        <Modal title={`${editando ? "Editar" : "Novo"} ${t("cliente")}`} onClose={() => setModal(false)}>
          <Field label="Nome / Razão Social"><input style={inp} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Nome do Contato"><input style={inp} value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Telefone"><input style={inp} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></Field>
            <Field label="Cidade"><input style={inp} value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem" }}>
            <Field label="Tipo">
              <select style={inp} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map(tp => <option key={tp}>{tp}</option>)}
              </select>
            </Field>
            <Field label="Limite de Crédito (R$)">
              <input style={inp} type="number" step=".01" min="0" placeholder="0,00" value={form.limite_credito} onChange={e => setForm({ ...form, limite_credito: e.target.value })} />
            </Field>
          </div>
          <Field label="Indicado por (opcional)">
            <select style={inp} value={form.indicado_por} onChange={e => setForm({ ...form, indicado_por: e.target.value })}>
              <option value="">— Nenhum —</option>
              {clientes
                .filter(c => !editando || c.id !== editando.id)
                .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btn("ghost")} onClick={() => setModal(false)}>Cancelar</button>
            <button style={btn("primary")} onClick={salvar} disabled={saving}>{saving ? <><Spinner size={14} color="#0a0a08" /> Salvando...</> : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {confirmState && <Confirm msg={confirmState.msg} danger={confirmState.danger !== false} onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default Clientes;
