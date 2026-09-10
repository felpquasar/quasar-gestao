export const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formata em YYYY-MM-DD usando a data LOCAL (toISOString é UTC e vira o dia
// às 21h no Brasil — agendamentos caíam no dia seguinte).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = () => isoLocal(new Date());

// Saldo real de uma conta a receber: valor - o que já foi pago em parciais.
export const saldoCr = (cr) => Math.max(0, Number(cr.valor) - Number(cr.valor_pago || 0));
export const addDays = (date, days) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoLocal(d);
};

export const brDate = (ymd) => {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// Escapa uma célula de CSV: aspas quando tem ; " ou quebra de linha, e neutraliza
// caractere de fórmula (= + - @) no início — abrir no Excel/Sheets não deve
// interpretar texto de usuário (obs, nome) como fórmula.
export const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCSV = (rows, filename) => {
  const csv = rows.map(r => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
