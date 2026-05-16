import api from './api.js';

/** @returns {Promise<{ results: object[] }>} */
export async function getMyResults(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/results', { signal });
  return data?.data ?? { results: [] };
}

/**
 * Full Result-screen payload for a completed mock attempt (history / Profile).
 * @returns {Promise<object>}
 */
export async function getAttemptResult(attemptId, opts = {}) {
  const { signal } = opts;
  const { data } = await api.get(`/results/attempt/${encodeURIComponent(String(attemptId))}`, {
    signal,
  });
  return data?.data ?? null;
}

