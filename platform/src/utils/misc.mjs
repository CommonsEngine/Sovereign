export const toBool = (v, d = false) => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return d;
  return s === "1" || s === "true" || s === "yes" || s === "on";
};
