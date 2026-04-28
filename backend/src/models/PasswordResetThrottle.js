import mongoose from 'mongoose';

/**
 * Per-email throttle for forgot-password / resend OTP so cooldown applies even
 * when no user exists (avoids leaking account existence via 429).
 */
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
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: false }
);

export const PasswordResetThrottle = mongoose.model('PasswordResetThrottle', schema);
