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

/**
 * Immutable evaluation + display snapshot written once at submit.
 * Historical review/retry MUST read this — never re-derive correctness from
 * live Question docs (admin edits must not change past attempts).
 */
const resultSnapshotQuestionSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    questionText: { type: String, default: '' },
    options: { type: [String], default: [] },
    questionType: { type: String, default: 'single_correct' },
    questionImage: { type: String, default: '' },
    explanation: { type: String, default: '' },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    postIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    correctAnswers: { type: [Number], default: [] },
    correctAnswerIndex: { type: Number, default: null },
    selectedOptionIndexes: { type: [Number], default: [] },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const resultSnapshotWeakTopicSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    mistakeCount: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const resultSnapshotSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1 },
    /** Frozen question rows in attempt.questionIds order */
    items: { type: [resultSnapshotQuestionSchema], default: [] },
    weakTopics: { type: [resultSnapshotWeakTopicSchema], default: [] },
    /** Subset of questionIds (attempted + wrong), stored in attempt order */
    wrongQuestionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  },
  { _id: false }
);

const testAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test',
      required: true,
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
    /** Populated on submit; source of truth for historical review/retry */
    resultSnapshot: { type: resultSnapshotSchema, default: null },
  },
  { timestamps: true }
);

/*
 * Query map (do not drop partial/uniques without a migration plan):
 * - Open attempt lookup: findInProgressByUserAndTest → partial unique open index.
 * - Per-test submitted history: listSubmittedByUserAndTest → idx_attempt_user_test_completed.
 * - Profile analytics / recent / latest: aggregateProfileStats, findRecentCompletedByUser
 *   → idx_attempt_user_completed_recent (no testId in $match).
 * - Status flags: getStatusFlagsByUser → userId prefix on compounds below.
 * - Max attempt number: getMaxAttemptNumber sort → idx_attempt_user_test_attempt_num_desc.
 * - Open attempts for user: listInProgressByUser, distinctOpenTestIds → idx_attempt_user_open_recent.
 * - Admin usage: questionIds count → idx_attempt_question_ids.
 */

/** General (userId, testId) equality — resume checks, submit guards. */
testAttemptSchema.index({ userId: 1, testId: 1 }, { name: 'idx_attempt_user_test' });

/**
 * findSubmittedByUserAndTest / countCompleted — completed rows per test.
 * Partial avoids indexing in-progress docs that use the open-attempt unique index.
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, endTime: -1, createdAt: -1 },
  {
    name: 'idx_attempt_user_test_completed',
    // Atlas-compatible partial (no `$ne` in partial filters).
    partialFilterExpression: { endTime: { $exists: true } },
  }
);

/**
 * Profile analytics + global recent list (no testId filter).
 * Matches sort `{ endTime: -1, createdAt: -1 }` on completed attempts only.
 */
testAttemptSchema.index(
  { userId: 1, endTime: -1, createdAt: -1 },
  {
    name: 'idx_attempt_user_completed_recent',
    partialFilterExpression: { endTime: { $exists: true } },
  }
);

/**
 * All open attempts for a user — listInProgressByUser, distinctOpenTestIdsByUser.
 */
testAttemptSchema.index(
  { userId: 1, createdAt: -1 },
  {
    name: 'idx_attempt_user_open_recent',
    partialFilterExpression: { endTime: null },
  }
);

/**
 * getMaxAttemptNumber — sort attemptNumber DESC within (userId, testId).
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, attemptNumber: -1 },
  {
    name: 'idx_attempt_user_test_attempt_num_desc',
    partialFilterExpression: { attemptNumber: { $type: 'number' } },
  }
);

/**
 * Prevent duplicate open attempts for the same user+test, regardless of tier.
 * Partial unique: only docs with endTime == null participate.
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, endTime: 1 },
  {
    name: 'uniq_attempt_user_test_open',
    unique: true,
    partialFilterExpression: { endTime: null },
  }
);

/**
 * Stable attempt numbering (unique per user+test).
 * Participates only when attemptNumber is present (legacy null docs ignored).
 */
testAttemptSchema.index(
  { userId: 1, testId: 1, attemptNumber: 1 },
  {
    name: 'uniq_attempt_user_test_attempt_num',
    unique: true,
    partialFilterExpression: { attemptNumber: { $type: 'number' } },
  }
);

/** Admin blast-radius — count attempts that include a question id. */
testAttemptSchema.index({ questionIds: 1 }, { name: 'idx_attempt_question_ids' });

export const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);
