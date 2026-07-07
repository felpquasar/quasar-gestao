export const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formata em YYYY-MM-DD usando a data LOCAL (toISOString é UTC e vira o dia
// às 21h no Brasil — agendamentos caíam no dia seguinte).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = () => isoLocal(new Date());
export const addDays = (date, days) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoLocal(d);
};
