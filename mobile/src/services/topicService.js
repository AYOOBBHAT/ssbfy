import api from './api.js';

/**
 * Module-level cache so all callers share the same topics payload across the
 * app session. Cleared via `clearTopicsCache()` (e.g., on logout).
 */
let topicsCache = null;
let topicsInFlight = null;

/**
 * Fetch all topics. Returns cached data if available; in-flight requests are
 * shared so concurrent callers don't double-fetch.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ topics: object[] }>}
 */
export async function getTopics(opts = {}) {
  if (!opts.force && topicsCache) {
    return topicsCache;
  }
  if (!opts.force && topicsInFlight) {
    return topicsInFlight;
  }

  topicsInFlight = (async () => {
    try {
      const { data } = await api.get('/topics');
      topicsCache = data.data;
      return topicsCache;
    } finally {
      topicsInFlight = null;
    }
  })();

  return topicsInFlight;
}

export function clearTopicsCache() {
  topicsCache = null;
  topicsInFlight = null;
}
