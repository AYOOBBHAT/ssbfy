import api from './api.js';

/**
 * Fetches the authenticated user's profile analytics.
 *
 * Returns an object shaped like:
 *   {
 *     totalMocks, bestScore, latestScore, averageScore, overallAccuracy,
 *     totalQuestionsSolved, currentStreak, dailyPracticeCount, smartPracticeCount
 *     recentAttempts
 *   }
 *
 * All numeric fields are guaranteed to be safe integers (>= 0).
 */
export async function getProfileAnalytics() {
  const { data } = await api.get('/users/profile-analytics');
  const payload = data?.data ?? {};
  return {
    totalMocks: toSafeInt(payload.totalMocks),
    bestScore: toSafeInt(payload.bestScore),
    latestScore: toSafeInt(payload.latestScore),
    averageScore: toSafeInt(payload.averageScore),
    overallAccuracy: toSafeInt(payload.overallAccuracy),
    totalQuestionsSolved: toSafeInt(payload.totalQuestionsSolved),
    currentStreak: toSafeInt(payload.currentStreak),
    dailyPracticeCount: toSafeInt(payload.dailyPracticeCount),
    smartPracticeCount: toSafeInt(payload.smartPracticeCount),
    recentAttempts: Array.isArray(payload.recentAttempts) ? payload.recentAttempts : [],
  };
}

function toSafeInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
