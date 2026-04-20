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
    freeAttemptsUsed: { type: Number, default: 0, min: 0 },
    streakCount: { type: Number, default: 0, min: 0 },
    lastPracticeDate: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });

export const User = mongoose.model('User', userSchema);
