import api from './api.js';

/**
 * Fetch today's daily practice questions (auth required; not tied to mock quota).
 * @returns {Promise<{ questions: object[] }>}
 */
export async function getDailyPractice(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/daily-practice', { signal });
  return data?.data ?? { questions: [] };
}

/**
 * Mark daily practice as completed and update streak.
 * @returns {Promise<{ streakCount: number, lastPracticeDate: string, alreadyCompletedToday: boolean }>}
 */
export async function completeDailyPractice(opts = {}) {
  const { signal } = opts;
  const { data } = await api.post('/daily-practice/complete', {}, { signal });
  return data?.data ?? {};
}
