import { userService } from '../services/userService.js';
import { profileAnalyticsService } from '../services/profileAnalyticsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const userController = {
  me: asyncHandler(async (req, res) => {
    const user = await userService.getProfile(req.user.id);
    return sendSuccess(res, { user }, 'Profile');
  }),

  changePassword: asyncHandler(async (req, res) => {
    await userService.changePassword(req.user.id, req.body);
    return sendSuccess(res, null, 'Password updated successfully');
  }),

  profileAnalytics: asyncHandler(async (req, res) => {
    const analytics = await profileAnalyticsService.getForUser(req.user.id);
    return sendSuccess(res, analytics, 'Profile analytics');
  }),
};
