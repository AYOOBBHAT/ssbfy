import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  FORGOT_PASSWORD_GENERIC_MESSAGE,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_MAX_OTP_ATTEMPTS,
  PASSWORD_RESET_OTP_BCRYPT_ROUNDS,
  PASSWORD_RESET_OTP_TTL_MS,
} from '../constants/passwordReset.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { PasswordResetThrottle } from '../models/PasswordResetThrottle.js';
import { userRepository } from '../repositories/userRepository.js';
import { sendPasswordResetOtp } from './emailService.js';

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function generateSixDigitOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function assertCooldownOrThrow(email) {
  const row = await PasswordResetThrottle.findOne({ email }).lean();
  if (row?.lastSentAt) {
    const elapsed = Date.now() - new Date(row.lastSentAt).getTime();
    if (elapsed < PASSWORD_RESET_COOLDOWN_MS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((PASSWORD_RESET_COOLDOWN_MS - elapsed) / 1000)
      );
      throw new AppError(
        'Please wait before requesting another code.',
        HTTP_STATUS.TOO_MANY_REQUESTS,
        { retryAfterSeconds }
      );
    }
  }
}

async function touchCooldown(email) {
  await PasswordResetThrottle.findOneAndUpdate(
    { email },
    { $set: { email, lastSentAt: new Date() } },
    { upsert: true }
  );
}

async function clearResetOtpFields(userId) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpAttempts: 0,
      },
    }
  ).exec();
}

export const passwordResetService = {
  /**
   * Always returns the same user-facing message when the email format is valid.
   * Throttle is per email (including non-registered) to avoid leaking existence via 429.
   */
  async forgotPassword({ email: rawEmail }) {
    const email = normalizeEmail(rawEmail);

    await assertCooldownOrThrow(email);
    await touchCooldown(email);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      return {
        message: FORGOT_PASSWORD_GENERIC_MESSAGE,
      };
    }

    const otp = generateSixDigitOtp();
    const passwordResetOtpHash = await bcrypt.hash(otp, PASSWORD_RESET_OTP_BCRYPT_ROUNDS);
    const passwordResetOtpExpiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_MS);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetOtpHash,
          passwordResetOtpExpiresAt,
          passwordResetOtpAttempts: 0,
        },
      }
    ).exec();

    try {
      await sendPasswordResetOtp({
        email: user.email,
        otp,
        userName: user.name,
      });
    } catch (err) {
      // Log full provider error server-side only; same response shape as success
      // so delivery failures do not reveal whether the account exists.
      console.error('[forgot-password] Resend / email delivery failed:', err?.message || err);
      await clearResetOtpFields(user._id);
    }

    return {
      message: FORGOT_PASSWORD_GENERIC_MESSAGE,
    };
  },

  /**
   * Validates OTP and sets a new password. Generic errors for invalid OTP / expiry.
   */
  async resetPassword({ email: rawEmail, otp: rawOtp, newPassword }) {
    const email = normalizeEmail(rawEmail);
    const otp = String(rawOtp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError('Invalid or expired reset code.', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await userRepository.findByEmailForPasswordReset(email);
    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      throw new AppError('Invalid or expired reset code.', HTTP_STATUS.BAD_REQUEST);
    }

    if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
      await clearResetOtpFields(user._id);
      throw new AppError('Invalid or expired reset code.', HTTP_STATUS.BAD_REQUEST);
    }

    const attempts = Number(user.passwordResetOtpAttempts) || 0;
    if (attempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS) {
      await clearResetOtpFields(user._id);
      throw new AppError('Invalid or expired reset code.', HTTP_STATUS.BAD_REQUEST);
    }

    const match = await bcrypt.compare(otp, user.passwordResetOtpHash);
    if (!match) {
      await User.updateOne({ _id: user._id }, { $inc: { passwordResetOtpAttempts: 1 } }).exec();
      const nextAttempts = attempts + 1;
      if (nextAttempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS) {
        await clearResetOtpFields(user._id);
      }
      throw new AppError('Invalid or expired reset code.', HTTP_STATUS.BAD_REQUEST);
    }

    const hashedPassword = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
          passwordResetOtpAttempts: 0,
        },
      }
    ).exec();

    return { message: 'Password has been reset. You can sign in with your new password.' };
  },
};
