import api from './api.js';
import { getDeviceId } from '../utils/deviceId.js';

/**
 * Fetch today's daily practice questions.
 * @returns {Promise<{ questions: object[] }>}
 */
export async function getDailyPractice(opts = {}) {
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const { data } = await api.get('/daily-practice', {
    params: { deviceId },
    signal,
  });
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
