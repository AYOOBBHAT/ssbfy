import api from './api.js';
import { encodeMongoIdPath } from '../utils/mongoId.js';

/** @returns {Promise<{ results: object[] }>} */
export async function getMyResults(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/results', { signal });
  return data?.data ?? { results: [] };
}

/**
 * Full Result-screen payload for a completed mock attempt (history / Profile).
 * @returns {Promise<object|null>}
 */
export async function getAttemptResult(attemptId, opts = {}) {
  const pathId = encodeMongoIdPath(attemptId, 'attemptId');
  if (!pathId) return null;
  const { signal } = opts;
  const { data } = await api.get(`/results/attempt/${pathId}`, { signal });
  return data?.data ?? null;
}
