import api from './api.js';

/**
 * Fetch today's daily practice questions.
 * @returns {Promise<{ questions: object[] }>}
 */
export async function getDailyPractice() {
  const { data } = await api.get('/daily-practice');
  return data?.data ?? { questions: [] };
}

/**
 * Mark daily practice as completed and update streak.
 * @returns {Promise<{ streakCount: number, lastPracticeDate: string, alreadyCompletedToday: boolean }>}
 */
export async function completeDailyPractice() {
  const { data } = await api.post('/daily-practice/complete');
  return data?.data ?? {};
}
