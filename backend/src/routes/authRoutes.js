import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  loginValidators,
  resetPasswordValidators,
  sendOtpValidators,
  signupValidators,
  verifyOtpValidators,
} from '../validators/authValidators.js';
import { authLimiter, otpLimiter } from '../middlewares/upstashRateLimiter.js';

const router = Router();

router.post(
  '/signup',
  authLimiter,
  signupValidators,
  validateRequest,
  authController.signup
);
router.post(
  '/login',
  authLimiter,
  loginValidators,
  validateRequest,
  authController.login
);

/**
 * Forgot Password flow (logged-out users only).
 *
 * Three explicit steps under a dedicated namespace so that recovery is
 * never overloaded onto /login or /signup:
 *
 *   1) POST /auth/forgot-password/send-otp
 *      Body: { email }
 *      Always returns the same generic success message; per-email
 *      cooldown applies even for non-existent accounts.
 *
 *   2) POST /auth/forgot-password/verify-otp
 *      Body: { email, otp }
 *      On success returns { resetToken, expiresAt }. The OTP is consumed
 *      atomically — it cannot be reused after this point.
 *
 *   3) POST /auth/forgot-password/reset-password
 *      Body: { email, resetToken, newPassword, confirmPassword }
 *      Validates token + match + same-password reuse, hashes with bcrypt,
 *      single-use consumes the token. Does NOT auto-login.
 */
router.post(
  '/forgot-password/send-otp',
  authLimiter,
  otpLimiter,
  sendOtpValidators,
  validateRequest,
  authController.sendOtp
);

router.post(
  '/forgot-password/verify-otp',
  authLimiter,
  otpLimiter,
  verifyOtpValidators,
  validateRequest,
  authController.verifyOtp
);

router.post(
  '/forgot-password/reset-password',
  authLimiter,
  resetPasswordValidators,
  validateRequest,
  authController.resetPassword
);

export default router;
