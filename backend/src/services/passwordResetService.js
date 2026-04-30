import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  FORGOT_PASSWORD_GENERIC_MESSAGE,
  INVALID_OR_EXPIRED_OTP_MESSAGE,
  INVALID_OR_EXPIRED_TOKEN_MESSAGE,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_MAX_OTP_ATTEMPTS,
  PASSWORD_RESET_OTP_BCRYPT_ROUNDS,
  PASSWORD_RESET_OTP_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../constants/passwordReset.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { PasswordResetThrottle } from '../models/PasswordResetThrottle.js';
import { userRepository } from '../repositories/userRepository.js';
import { sendPasswordResetOtp } from './emailService.js';
import { logger } from '../utils/logger.js';

/* -------------------- helpers -------------------- */

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function generateSixDigitOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Generate an opaque, URL-safe reset token. 32 random bytes ≈ 256 bits of
 * entropy — comfortably above brute-force range. The plaintext leaves the
 * server exactly once (verify-otp response). The DB stores only its hash.
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashResetToken(token) {
  // SHA-256 (not bcrypt): we want constant-time DB lookups via direct
  // equality on the hash. Token is high-entropy and short-lived (15 min),
  // so a fast hash is correct here. bcrypt is reserved for low-entropy
  // user-chosen secrets (passwords, OTPs).
  return crypto.createHash('sha256').update(token).digest('hex');
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

/**
 * Wipe BOTH OTP and reset-token state on this user. Used when:
 *  - OTP expired or attempts exceeded
 *  - reset-token expired
 *  - password reset succeeded (single-use guarantee)
 *  - email send failed (we do not want a dangling OTP record the user
 *    can't act on).
 */
async function clearAllResetState(userId) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpAttempts: 0,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    }
  ).exec();
}

/* -------------------- service -------------------- */

export const passwordResetService = {
  /**
   * STEP 1 — send OTP.
   *
   * Always returns the same generic message (regardless of whether the
   * email maps to a real user) and applies the throttle even when no
   * user exists — both signals are necessary to avoid leaking account
   * existence via response shape, status code, or timing.
   */
  async sendOtp({ email: rawEmail }) {
    const email = normalizeEmail(rawEmail);

    await assertCooldownOrThrow(email);
    await touchCooldown(email);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Do not branch on existence in any client-visible way.
      return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
    }

    const otp = generateSixDigitOtp();
    const passwordResetOtpHash = await bcrypt.hash(
      otp,
      PASSWORD_RESET_OTP_BCRYPT_ROUNDS
    );
    const passwordResetOtpExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_OTP_TTL_MS
    );

    // Issuing a new OTP invalidates any prior OTP/token on this account —
    // single-use, no replay across overlapping requests.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetOtpHash,
          passwordResetOtpExpiresAt,
          passwordResetOtpAttempts: 0,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
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
      // Provider failure is logged server-side only. Response shape stays
      // identical to success so deliverability issues never reveal account
      // existence. We also clear OTP state so the account does not sit on
      // an unactionable hash.
      logger.error(
        '[forgot-password] Resend / email delivery failed:',
        err?.message || err
      );
      await clearAllResetState(user._id);
    }

    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  },

  /**
   * STEP 2 — verify OTP, issue reset token.
   *
   * On success: returns `{ resetToken, expiresAt }`. The token is stored
   * server-side as a SHA-256 hash, which means the OTP is consumed RIGHT
   * NOW and cannot be replayed. The plaintext token replaces the OTP for
   * step 3 — the OTP never needs to leave the user's device again.
   *
   * On any failure path (no user, no pending OTP, expired, used, attempts
   * exceeded, wrong code): throws a uniform AppError with a generic
   * message so attackers cannot distinguish the failure mode.
   */
  async verifyOtp({ email: rawEmail, otp: rawOtp }) {
    const email = normalizeEmail(rawEmail);
    const otp = String(rawOtp ?? '').trim();
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError(
        INVALID_OR_EXPIRED_OTP_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const user = await userRepository.findByEmailForPasswordReset(email);
    if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      throw new AppError(
        INVALID_OR_EXPIRED_OTP_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (new Date(user.passwordResetOtpExpiresAt).getTime() < Date.now()) {
      await clearAllResetState(user._id);
      throw new AppError(
        INVALID_OR_EXPIRED_OTP_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const attempts = Number(user.passwordResetOtpAttempts) || 0;
    if (attempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS) {
      await clearAllResetState(user._id);
      throw new AppError(
        INVALID_OR_EXPIRED_OTP_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const match = await bcrypt.compare(otp, user.passwordResetOtpHash);
    if (!match) {
      await User.updateOne(
        { _id: user._id },
        { $inc: { passwordResetOtpAttempts: 1 } }
      ).exec();
      const nextAttempts = attempts + 1;
      if (nextAttempts >= PASSWORD_RESET_MAX_OTP_ATTEMPTS) {
        await clearAllResetState(user._id);
      }
      throw new AppError(
        INVALID_OR_EXPIRED_OTP_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // OTP matched. Mint a single-use reset token, store its hash, and
    // invalidate the OTP atomically. From here on the OTP is dead — the
    // only way forward is the plaintext token returned below.
    const resetToken = generateResetToken();
    const passwordResetTokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
          passwordResetOtpAttempts: 0,
          passwordResetTokenHash,
          passwordResetTokenExpiresAt: expiresAt,
        },
      }
    ).exec();

    return {
      resetToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Code verified. You can now set a new password.',
    };
  },

  /**
   * STEP 3 — reset password via token.
   *
   * Expects `{ email, resetToken, newPassword, confirmPassword }`.
   * - confirmPassword must match newPassword (server-side, not just UI).
   * - newPassword must not equal the existing password (best-effort
   *   reuse block; bcrypt-compare against the current hash).
   * - On success: token is consumed (single-use) AND we DO NOT auto-login.
   *   Caller must navigate to Login and authenticate normally.
   */
  async resetPassword({
    email: rawEmail,
    resetToken: rawToken,
    newPassword,
    confirmPassword,
  }) {
    const email = normalizeEmail(rawEmail);
    const token = String(rawToken ?? '').trim();
    if (!token) {
      throw new AppError(
        INVALID_OR_EXPIRED_TOKEN_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      throw new AppError('Password is required.', HTTP_STATUS.BAD_REQUEST);
    }
    if (newPassword.length < 8) {
      throw new AppError(
        'Password must be at least 8 characters.',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    if (newPassword !== confirmPassword) {
      throw new AppError(
        'New password and confirmation do not match.',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const user = await User.findOne({ email })
      .select('+password +passwordResetTokenHash')
      .exec();
    if (
      !user ||
      !user.passwordResetTokenHash ||
      !user.passwordResetTokenExpiresAt
    ) {
      throw new AppError(
        INVALID_OR_EXPIRED_TOKEN_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (new Date(user.passwordResetTokenExpiresAt).getTime() < Date.now()) {
      await clearAllResetState(user._id);
      throw new AppError(
        INVALID_OR_EXPIRED_TOKEN_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const tokenHash = hashResetToken(token);
    // Constant-time equality on hex strings of equal length.
    const a = Buffer.from(tokenHash, 'hex');
    const b = Buffer.from(user.passwordResetTokenHash, 'hex');
    const tokenValid =
      a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!tokenValid) {
      throw new AppError(
        INVALID_OR_EXPIRED_TOKEN_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Best-effort same-password reuse block. We compare against the
    // current bcrypt hash; if it matches, refuse so users don't "reset"
    // back to the same secret.
    if (user.password) {
      try {
        const sameAsOld = await bcrypt.compare(newPassword, user.password);
        if (sameAsOld) {
          throw new AppError(
            'New password must be different from your current password.',
            HTTP_STATUS.BAD_REQUEST
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Defensive: if bcrypt errors for any reason, do not block
        // legitimate reset — just skip the reuse check.
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, env.bcryptSaltRounds);

    // Atomic single-use consumption: only succeeds if the same token hash
    // is still on the doc. If a concurrent request already consumed it,
    // matchedCount === 0 and we reject. This closes the replay window.
    const result = await User.updateOne(
      { _id: user._id, passwordResetTokenHash: user.passwordResetTokenHash },
      {
        $set: {
          password: hashedPassword,
          passwordResetOtpHash: null,
          passwordResetOtpExpiresAt: null,
          passwordResetOtpAttempts: 0,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
        },
      }
    ).exec();

    if (!result || result.matchedCount === 0) {
      throw new AppError(
        INVALID_OR_EXPIRED_TOKEN_MESSAGE,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    return {
      message:
        'Password has been reset. You can sign in with your new password.',
    };
  },
};
