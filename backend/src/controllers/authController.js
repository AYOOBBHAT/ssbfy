import { authService } from '../services/authService.js';
import { passwordResetService } from '../services/passwordResetService.js';
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

  forgotPassword: asyncHandler(async (req, res) => {
    const out = await passwordResetService.forgotPassword(req.body);
    return sendSuccess(res, out, out.message);
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const out = await passwordResetService.resetPassword(req.body);
    return sendSuccess(res, out, out.message);
  }),
};
