export function getCacheAgeMs(fetchedAt) {
  const ts = Number(fetchedAt) || 0;
  if (!ts) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - ts);
}

export function isCacheFresh(fetchedAt, staleAfterMs) {
  const ttl = Number(staleAfterMs) || 0;
  if (ttl <= 0) return false;
  return getCacheAgeMs(fetchedAt) < ttl;
}

export function isCacheStale(fetchedAt, staleAfterMs) {
  return !isCacheFresh(fetchedAt, staleAfterMs);
}
