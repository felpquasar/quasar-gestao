export const inp = { width: "100%", background: "#111", border: "1px solid #333", borderRadius: 6, padding: "11px 12px", color: "#e0e0e0", fontSize: ".88rem", outline: "none", boxSizing: "border-box", colorScheme: "dark" };

export const btn = (v = "primary") => ({
  padding: "11px 20px", borderRadius: 6, border: "none", cursor: "pointer",
  background: v === "primary" ? "#ffbf00" : v === "danger" ? "#3a1515" : "#1f1f1f",
  color: v === "primary" ? "#0a0a08" : v === "danger" ? "#e05a5a" : "#aaa",
  fontSize: ".85rem", fontWeight: v === "primary" ? 700 : 400,
  display: "inline-flex", alignItems: "center", gap: 6,
});
