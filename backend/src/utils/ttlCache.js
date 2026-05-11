/**
 * Tiny in-process TTL cache for read-heavy metadata (posts, subjects, topics).
 * No invalidation hooks — rely on short TTLs to avoid stale admin UX.
 */

function stableKey(obj) {
  if (obj == null || typeof obj !== 'object') return String(obj);
  const keys = Object.keys(obj).sort();
  const norm = {};
  for (const k of keys) {
    const v = obj[k];
    norm[k] = v && typeof v === 'object' ? stableKey(v) : v;
  }
  return JSON.stringify(norm);
}

export function createTtlCache({ defaultTtlMs = 20000, maxEntries = 80 } = {}) {
  const store = new Map();

  function prune(now) {
    for (const [k, entry] of store) {
      if (entry.expiresAt <= now) store.delete(k);
    }
    while (store.size > maxEntries) {
      const first = store.keys().next().value;
      if (first === undefined) break;
      store.delete(first);
    }
  }

  return {
    /**
     * @param {string} key
     * @param {number} [ttlMs]
     * @param {() => Promise<unknown>} factory
     */
    async getOrSet(key, ttlMs, factory) {
      const now = Date.now();
      prune(now);
      const hit = store.get(key);
      if (hit && hit.expiresAt > now) {
        return hit.value;
      }
      const value = await factory();
      const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : defaultTtlMs;
      store.set(key, { value, expiresAt: now + ttl });
      return value;
    },
    clear() {
      store.clear();
    },
  };
}

const postsListCache = createTtlCache({ defaultTtlMs: 30000, maxEntries: 4 });
const subjectsListCache = createTtlCache({ defaultTtlMs: 15000, maxEntries: 120 });
const topicsListCache = createTtlCache({ defaultTtlMs: 15000, maxEntries: 200 });

export function cachedActivePostsList(factory) {
  return postsListCache.getOrSet('active:v1', 30000, factory);
}

export function cachedSubjectsList(filter, factory) {
  const key = `v1:${stableKey(filter)}`;
  return subjectsListCache.getOrSet(key, 15000, factory);
}

export function cachedTopicsList(filter, factory) {
  const key = `v1:${stableKey(filter)}`;
  return topicsListCache.getOrSet(key, 15000, factory);
}
