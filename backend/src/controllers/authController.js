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

  /**
   * STEP 1 — Forgot Password: send OTP to the email if (and only if) an
   * account exists, while always returning the same generic message and
   * applying the same per-email cooldown so account existence cannot
   * leak via response shape, status code, or timing.
   */
  sendOtp: asyncHandler(async (req, res) => {
    const out = await passwordResetService.sendOtp(req.body);
    return sendSuccess(res, out, out.message);
  }),

  /**
   * STEP 2 — Verify OTP: consume the OTP and mint a short-lived reset
   * token. The caller uses the returned `resetToken` (NOT the OTP again)
   * for the final password update. This decoupling is intentional: it
   * keeps the OTP off the wire after this point and gives us a single,
   * atomically-consumable handle for the actual password change.
   */
  verifyOtp: asyncHandler(async (req, res) => {
    const out = await passwordResetService.verifyOtp(req.body);
    return sendSuccess(res, out, out.message);
  }),

  /**
   * STEP 3 — Reset Password: require the resetToken from step 2, plus
   * matching newPassword + confirmPassword. On success, the token is
   * consumed; we do NOT auto-login (caller must navigate to /login).
   */
  resetPassword: asyncHandler(async (req, res) => {
    const out = await passwordResetService.resetPassword(req.body);
    return sendSuccess(res, out, out.message);
  }),
};
