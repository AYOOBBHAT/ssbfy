import mongoose from 'mongoose';

const answerItemSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },

    // NEW canonical answer field — array of option indexes the user picked.
    // Empty array means "unanswered". For single_correct / image_based the
    // array always has length 0 or 1; for multiple_correct it can be longer.
    selectedOptionIndexes: {
      type: [Number],
      default: [],
      validate: {
        validator(arr) {
          if (!Array.isArray(arr)) return false;
          return arr.every((v) => Number.isInteger(v) && v >= 0);
        },
        message: 'selectedOptionIndexes must be an array of non-negative integers',
      },
    },

    // LEGACY scalar — kept so old in-progress attempts in Mongo and any
    // older client that still POSTs only `selectedOptionIndex` keep working.
    // The pre('validate') hook below keeps these two fields in sync.
    selectedOptionIndex: {
      type: Number,
      required: false,
      default: null,
      validate: {
        validator(v) {
          return v == null || (Number.isInteger(v) && v >= 0);
        },
      },
    },
  },
  { _id: false }
);

/**
 * Normalize the two answer fields so callers reading either one always see
 * a consistent picture:
 *   - If the client sent only the legacy scalar, lift it into the array.
 *   - If the client sent only the new array, populate the scalar from
 *     `arr[0]` (or null if empty) for legacy readers (e.g. older mobile
 *     builds resuming an in-progress attempt).
 *   - Always dedupe + sort the array so equality checks elsewhere are
 *     order-insensitive without having to re-sort on every read.
 */
answerItemSchema.pre('validate', function syncAnswerForms(next) {
  const hasArr = Array.isArray(this.selectedOptionIndexes) && this.selectedOptionIndexes.length > 0;
  const hasScalar =
    typeof this.selectedOptionIndex === 'number' && Number.isInteger(this.selectedOptionIndex);

  if (!hasArr && hasScalar) {
    this.selectedOptionIndexes = [this.selectedOptionIndex];
  }

  if (Array.isArray(this.selectedOptionIndexes) && this.selectedOptionIndexes.length > 0) {
    const cleaned = Array.from(new Set(this.selectedOptionIndexes.map(Number))).sort(
      (a, b) => a - b
    );
    this.selectedOptionIndexes = cleaned;
    this.selectedOptionIndex = cleaned[0];
  } else {
    this.selectedOptionIndexes = [];
    this.selectedOptionIndex = null;
  }

  next();
});

const testAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
      index: true,
    },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    answers: { type: [answerItemSchema], default: [] },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    /**
     * Attempt number per (userId, testId).
     *
     * - For new attempts we always set this to 1..N.
     * - Legacy documents may have null; we keep it nullable for safe rollout.
     */
    attemptNumber: { type: Number, default: null, min: 1 },
    score: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    timeTaken: { type: Number, default: null },
  },
  { timestamps: true }
);

testAttemptSchema.index({ userId: 1, testId: 1 });
testAttemptSchema.index({ userId: 1, testId: 1, endTime: 1 });
// Optimizes queries shaped like: { userId, endTime } (status lookup / resume checks).
testAttemptSchema.index({ userId: 1, endTime: 1, testId: 1 });

/**
 * Prevent duplicate open attempts for the same user+test, regardless of tier.
 * This is a partial unique index: only docs with endTime == null participate.
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, endTime: 1 },
  { unique: true, partialFilterExpression: { endTime: null } }
);

/**
 * Stable attempt numbering (unique per user+test).
 * Participates only when attemptNumber is present (legacy null docs ignored).
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, attemptNumber: 1 },
  { unique: true, partialFilterExpression: { attemptNumber: { $type: 'number' } } }
);

export const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);
