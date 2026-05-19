const SESSION_TYPE_LABELS = {
  topic: 'Topic Practice',
  smart: 'Smart Practice',
  weak: 'Weak Topics',
  daily: 'Daily Practice',
  retry: 'Retry Session',
  practice: 'Practice',
  mock: 'Mock Test',
};

/**
 * Turns backend slugs / snake_case into readable UI titles.
 * Does not mutate API data — display only.
 */
export function formatActivityLabel(raw) {
  if (raw == null || raw === '') return 'Session';
  const key = String(raw).trim();
  if (!key) return 'Session';

  const mapped = SESSION_TYPE_LABELS[key.toLowerCase()];
  if (mapped) return mapped;

  return humanizeSlug(key);
}

function humanizeSlug(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'mock' || lower === 'mcq') return lower === 'mock' ? 'Mock' : 'MCQ';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
