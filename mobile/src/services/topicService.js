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
  const { force = false, signal } = opts;
  if (!force && !signal && topicsCache) {
    return topicsCache;
  }
  if (!force && !signal && topicsInFlight) {
    return topicsInFlight;
  }

  const exec = async () => {
    const { data } = await api.get('/topics', { signal });
    const result = data?.data ?? { topics: [] };
    if (!signal) {
      topicsCache = result;
    }
    return result;
  };

  if (signal) {
    return exec();
  }

  topicsInFlight = (async () => {
    try {
      return await exec();
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
