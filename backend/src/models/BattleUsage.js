import mongoose from 'mongoose';

/**
 * Per-user daily battle quota (UTC dateKey).
 * Backend-authoritative — never trust device counters for gating.
 */
const battleUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** UTC calendar day `YYYY-MM-DD`. */
    dateKey: { type: String, required: true, trim: true },
    createdCount: { type: Number, default: 0, min: 0 },
    joinedCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

battleUsageSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const BattleUsage = mongoose.model('BattleUsage', battleUsageSchema);
