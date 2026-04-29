import mongoose from 'mongoose';
import { ROLES } from '../constants/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: [ROLES.ADMIN, ROLES.USER],
      default: ROLES.USER,
    },
    isPremium: { type: Boolean, default: false },
    trialUsed: { type: Boolean, default: false },
    subscriptionEnd: { type: Date, default: null },
    plan: { type: String, default: null },
    currentPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null,
      index: true,
    },
    currentPlanType: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'lifetime', null],
      default: null,
    },
    freeAttemptsUsed: { type: Number, default: 0, min: 0 },
    streakCount: { type: Number, default: 0, min: 0 },
    lastPracticeDate: { type: Date, default: null },
    /**
     * Lifetime total of daily-practice completions. Incremented exactly once
     * per real (non-idempotent) completion in `dailyPracticeService`. Distinct
     * from `streakCount` (which resets on missed days).
     */
    dailyPracticeTotal: { type: Number, default: 0, min: 0 },

    /** Hashed OTP for password reset — never returned by API; bcrypt. */
    passwordResetOtpHash: { type: String, select: false, default: null },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    passwordResetOtpAttempts: { type: Number, default: 0, min: 0 },

    /**
     * Short-lived reset token issued AFTER successful OTP verification.
     * Stored as a SHA-256 hash (never returned by API). The plaintext token
     * is given to the client exactly once and consumed by reset-password.
     * Decoupling reset from OTP means the OTP is invalidated immediately
     * after verification and the password-reset request never carries the
     * OTP secret.
     */
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetTokenExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });

export const User = mongoose.model('User', userSchema);
