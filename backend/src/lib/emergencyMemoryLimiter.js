/**
 * Bounded in-process fixed-window counter for HIGH-sensitivity routes when the
 * Upstash provider throws. Not distributed — one Node process only.
 */

const MAX_KEYS = 10_000;
const PRUNE_TARGET = 2_000;

/** @type {Map<string, { windowStartMs: number, count: number }>} */
const buckets = new Map();

/**
 * @param {string} key
 * @param {number} windowSeconds
 * @param {number} maxRequests
 * @returns {boolean} true if request may proceed
 */
export function tryEmergencyConsume(key, windowSeconds, maxRequests) {
  const k = String(key || '').slice(0, 256);
  if (!k) return false;
  const windowMs = Math.max(1, Number(windowSeconds) || 1) * 1000;
  const cap = Math.max(1, Math.floor(Number(maxRequests) || 1));
  const now = Date.now();

  let b = buckets.get(k);
  if (!b || now - b.windowStartMs >= windowMs) {
    b = { windowStartMs: now, count: 1 };
  } else {
    b.count += 1;
  }
  buckets.set(k, b);

  if (buckets.size > MAX_KEYS) {
    const it = buckets.keys();
    for (let i = 0; i < PRUNE_TARGET; i += 1) {
      const next = it.next().value;
      if (next === undefined) break;
      buckets.delete(next);
    }
  }

  return b.count <= cap;
}

/** Test hook — do not use in production routes. */
export function __resetEmergencyMemoryLimiterForTests() {
  buckets.clear();
}
