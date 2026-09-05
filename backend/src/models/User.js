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
    /**
     * Required for email/password accounts. Optional when `authProviders.google.sub`
     * is set (Google-only users may add a password later via reset/change flows).
     */
    password: {
      type: String,
      required() {
        return !this.authProviders?.google?.sub;
      },
      select: false,
    },
    emailVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null, trim: true },
    authProviders: {
      google: {
        /**
         * Google subject. No default — email/password users must omit this
         * field. A `null` default plus a unique index collides on E11000.
         */
        sub: { type: String, trim: true },
        email: { type: String, default: null, lowercase: true, trim: true },
        linkedAt: { type: Date, default: null },
      },
    },
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

// Unique email index comes from `unique: true` on the path — do not add a second `schema.index({ email })`.

/**
 * One Google identity per account. Partial `$type: 'string'` so missing/null
 * subs (email/password users) are not indexed. Do not use sparse:true.
 *
 * Live DBs may still have the old sparse unique index under this same name.
 * `createIndexes()` will not replace it. Do not `syncIndexes()`. Replace via
 * Atlas: create `uniq_authProviders_google_sub_v2` (same key + this partial),
 * verify, drop the old sparse `uniq_authProviders_google_sub`, then
 * `npm run build:indexes` to create this name — then drop `_v2`.
 */
userSchema.index(
  { 'authProviders.google.sub': 1 },
  {
    unique: true,
    name: 'uniq_authProviders_google_sub',
    partialFilterExpression: {
      'authProviders.google.sub': { $type: 'string' },
    },
  }
);

export const User = mongoose.model('User', userSchema);
