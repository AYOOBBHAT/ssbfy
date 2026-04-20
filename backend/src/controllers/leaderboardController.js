import { leaderboardService } from '../services/leaderboardService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const leaderboardController = {
  list: asyncHandler(async (_req, res) => {
    const leaderboard = await leaderboardService.getLeaderboard();
    return sendSuccess(res, { leaderboard }, 'Leaderboard');
  }),
};
