import api from './api.js';

/**
 * Fetch top streak leaderboard.
 * @returns {Promise<{ leaderboard: { name: string, streakCount: number }[] }>}
 */
export async function getLeaderboard() {
  const { data } = await api.get('/leaderboard');
  return data.data;
}
