import { dailyPracticeService } from '../services/dailyPracticeService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const dailyPracticeController = {
  list: asyncHandler(async (req, res) => {
    const payload = await dailyPracticeService.getDailyPractice(req.user.id);
    return sendSuccess(res, payload, 'Daily practice questions');
  }),

  complete: asyncHandler(async (req, res) => {
    const result = await dailyPracticeService.completeDailyPractice(req.user.id);
    return sendSuccess(
      res,
      {
        streakCount: result.streakCount,
        lastPracticeDate: result.lastPracticeDate,
        alreadyCompletedToday: result.alreadyCompletedToday,
      },
      result.alreadyCompletedToday
        ? 'Daily practice already completed today'
        : 'Daily practice completed'
    );
  }),
};
