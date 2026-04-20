import { authService } from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../utils/response.js';

export const authController = {
  signup: asyncHandler(async (req, res) => {
    const { user, token } = await authService.signup(req.body);
    return sendCreated(res, { user, token }, 'Account created');
  }),

  login: asyncHandler(async (req, res) => {
    const { user, token } = await authService.login(req.body);
    return sendSuccess(res, { user, token }, 'Logged in');
  }),
};
