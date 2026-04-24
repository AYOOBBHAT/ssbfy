import mongoose from 'mongoose';

/**
 * Tracks aggregate free test consumption per physical device so limits
 * cannot be bypassed by rotating email accounts on the same phone.
 *
 * `freeAttemptsUsed` is the source of truth for enforcement (paired with
 * FREE_TEST_LIMIT in env). `userId` is the most recent user who consumed
 * a slot — useful for support / analytics, not for gating.
 */
const deviceUsageSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    freeAttemptsUsed: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

deviceUsageSchema.index({ deviceId: 1 }, { unique: true });

export const DeviceUsage = mongoose.model('DeviceUsage', deviceUsageSchema);
