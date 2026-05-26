const startupEpochMs = Date.now();
const seenMarks = new Set();

/**
 * DEV-only startup timing breadcrumbs.
 */
export function markStartup(label, detail = {}) {
  if (!__DEV__) return;
  const deltaMs = Date.now() - startupEpochMs;
  // Avoid noisy duplicate milestones during fast refresh / re-renders.
  const key = JSON.stringify([label, detail?.routeName ?? null]);
  if (seenMarks.has(key)) return;
  seenMarks.add(key);
  // eslint-disable-next-line no-console
  console.log(`[Startup] ${label} +${deltaMs}ms`, detail);
}

export function getStartupElapsedMs() {
  return Date.now() - startupEpochMs;
}
