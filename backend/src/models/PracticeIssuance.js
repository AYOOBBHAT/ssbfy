import mongoose from 'mongoose';

const PRACTICE_TYPES = ['topic', 'smart', 'weak', 'daily', 'practice', 'retry', 'battle'];

const practiceIssuanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    practiceType: {
      type: String,
      required: true,
      enum: PRACTICE_TYPES,
      index: true,
    },
    /** Exact ordered question set the client may reveal (subset for retry). */
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true }],
    /** Retry provenance — required when practiceType is `retry`. */
    sourceAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestAttempt',
      default: null,
    },
    /** Battle friend-challenge — frozen question set from BattleSession. */
    battleSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BattleSession',
      default: null,
      index: true,
    },
    /**
     * When true, reveal may load questions via scoring fetch that includes inactive
     * rows (retry from frozen attempt only). Never set for arbitrary topic/smart/etc.
     */
    allowInactiveScoring: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: true },
    /** After first successful reveal + persist, only idempotent replays allowed. */
    revealFinalized: { type: Boolean, default: false, index: true },
    /** Client idempotency key used for the finalized reveal (empty string if absent). */
    idempotentKey: { type: String, default: '' },
    linkedLearningSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningSession',
      default: null,
    },
    /** Counts non-idempotent reveal attempts while not finalized (abuse / retry budget). */
    scratchRevealAttempts: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

practiceIssuanceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PracticeIssuance = mongoose.model('PracticeIssuance', practiceIssuanceSchema);
