import mongoose from 'mongoose';

/**
 * Per-email throttle for forgot-password / resend OTP so cooldown applies even
 * when no user exists (avoids leaking account existence via 429).
 *
 * `lastSentAt` carries a MongoDB TTL index so stale entries auto-expire and
 * the collection can never grow unbounded from spam. The TTL is set high
 * enough (1 hour) that it never fights the in-app cooldown (45 s), but low
 * enough that abandoned reset attempts don't pile up. Reads still rely on
 * `Date.now() - lastSentAt < cooldown` for the actual gate — the TTL is
 * pure janitorial.
 */
const PASSWORD_RESET_THROTTLE_TTL_SECONDS = 60 * 60; // 1 hour

const schema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    lastSentAt: {
      type: Date,
      required: true,
      // MongoDB removes the doc once `lastSentAt` is older than this many
      // seconds. The cooldown logic is unaffected: by the time TTL kicks in,
      // the cooldown is already long satisfied.
      index: { expireAfterSeconds: PASSWORD_RESET_THROTTLE_TTL_SECONDS },
    },
  },
  { timestamps: false }
);

export const PasswordResetThrottle = mongoose.model('PasswordResetThrottle', schema);
