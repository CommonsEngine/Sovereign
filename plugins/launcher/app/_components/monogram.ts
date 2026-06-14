/**
 * Two-letter monogram fallback for a plugin tile — used until an icon-serving
 * pipeline exists (see docs/plugins/launcher.md, open question 3).
 *
 * Takes the first letter of each whitespace-separated word, up to two; falls
 * back to the first two characters of the name when that yields nothing (e.g. a
 * single word). Always upper-cased.
 */
export function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}
