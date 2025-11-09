export const paletteTokens = {
  "violet-500": "#7c3aed",
  "amber-400": "#fbbf24",
  "amber-500": "#f59e0b",
  "slate-400": "#94a3b8",
  "slate-500": "#64748b",
  "slate-600": "#475569",
  "emerald-300": "#6ee7b7",
  "emerald-500": "#10b981",
  "sky-300": "#7dd3fc",
  "sky-500": "#0ea5e9",
  "sky-600": "#0284c7",
  "rose-500": "#f43f5e",
};

export function getPaletteColor(token) {
  if (!token) return undefined;
  return paletteTokens[token] || undefined;
}
