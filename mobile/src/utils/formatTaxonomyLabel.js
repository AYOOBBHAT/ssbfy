/**
 * Display-only labels for subjects, topics, posts (backend slugs preserved in API).
 */
export function formatTaxonomyLabel(raw) {
  if (raw == null || raw === '') return '—';
  const s = String(raw).trim();
  if (!s) return '—';

  const paren = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/i);
  if (paren) {
    const base = humanizeWords(paren[1]);
    const inner = paren[2]
      .split(/[&/,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.toUpperCase())
      .join(' & ');
    return inner ? `${base} (${inner})` : base;
  }

  return humanizeWords(s);
}

function humanizeWords(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'gk') return 'GK';
      if (lower === 'cs') return 'CS';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
