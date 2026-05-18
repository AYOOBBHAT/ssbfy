import { learningAnalyticsService } from '../services/learningAnalyticsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const analyticsController = {
  overview: asyncHandler(async (req, res) => {
    const overview = await learningAnalyticsService.getOverview(req.user.id);
    return sendSuccess(res, overview, 'Analytics overview');
  }),
};
