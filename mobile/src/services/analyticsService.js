import api from './api.js';

/**
 * Learning intelligence overview (immutable session aggregates).
 * @returns {Promise<object|null>}
 */
export async function getAnalyticsOverview(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/analytics/overview', { signal });
  return data?.data ?? null;
}
