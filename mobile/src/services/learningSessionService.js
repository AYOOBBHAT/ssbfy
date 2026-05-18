import api from './api.js';
import { encodeMongoIdPath } from '../utils/mongoId.js';

/**
 * Immutable learning session (practice / retry) for historical Result review.
 * @returns {Promise<object|null>}
 */
export async function getLearningSession(sessionId, opts = {}) {
  const pathId = encodeMongoIdPath(sessionId, 'learningSessionId');
  if (!pathId) return null;
  const { signal } = opts;
  const { data } = await api.get(`/learning-sessions/${pathId}`, { signal });
  return data?.data ?? null;
}

/** @returns {Promise<{ sessions: object[] }>} */
export async function getRecentLearningSessions(opts = {}) {
  const { signal, limit = 15 } = opts;
  const { data } = await api.get('/learning-sessions/recent', {
    signal,
    params: { limit },
  });
  const payload = data?.data ?? {};
  return {
    sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
  };
}
