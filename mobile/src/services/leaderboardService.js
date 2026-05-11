import api from './api.js';

/**
 * Fetch top streak leaderboard.
 * @returns {Promise<{ leaderboard: { name: string, streakCount: number }[] }>}
 */
export async function getLeaderboard(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/leaderboard', { signal });
  return data?.data ?? { leaderboard: [] };
}
