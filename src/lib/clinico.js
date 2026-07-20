// Gate por sub_segmento (dentista/fisio/nutri) — eixo independente do plano
// tier (planos.js). NÃO é cascata: sub-tipos são mutuamente exclusivos,
// então não reusar `can`/`capsDo` daqui.

export const SUB_SEGMENTO_LABEL = {
  dentista: "Dentista",
  fisio: "Fisioterapeuta",
  nutri: "Nutricionista",
};

const FEATURES_POR_SUBSEGMENTO = {
  dentista: ["odontograma", "plano_tratamento"],
  fisio: [],
  nutri: [],
};

export const ehClinico = (segmento) => segmento === "saude";

export const podeSubSegmento = (subSegmento, feature) =>
  !feature || (FEATURES_POR_SUBSEGMENTO[subSegmento] || []).includes(feature);
