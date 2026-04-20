import { userRepository } from '../repositories/userRepository.js';

const LEADERBOARD_LIMIT = 20;

export const leaderboardService = {
  async getLeaderboard() {
    const users = await userRepository.findLeaderboard(LEADERBOARD_LIMIT);
    return users.map((u) => ({
      name: u.name,
      streakCount: Number(u.streakCount) || 0,
    }));
  },
};
