import mongoose from 'mongoose';
import { DIFFICULTY } from '../constants/difficulty.js';

/**
 * Supported question shapes.
 *
 * - `single_correct`  — classic MCQ, exactly one correct option (default)
 * - `multiple_correct`— two or more correct options; UI shows checkboxes
 * - `image_based`     — the prompt is an image (URL in `questionImage`);
 *                       answer arity is otherwise unconstrained (>=1)
 *
 * Kept as a const array so validators / services can import a single source
 * of truth and match/branch on these strings without magic strings drift.
 */
export const QUESTION_TYPES = Object.freeze({
  SINGLE_CORRECT: 'single_correct',
  MULTIPLE_CORRECT: 'multiple_correct',
  IMAGE_BASED: 'image_based',
});

export const QUESTION_TYPE_VALUES = Object.values(QUESTION_TYPES);

const questionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],

    // NEW: flexible question classification. Defaults to `single_correct`
    // so every legacy doc read through Mongoose surfaces with this value
    // even though the field is absent on disk.
    questionType: {
      type: String,
      enum: QUESTION_TYPE_VALUES,
      default: QUESTION_TYPES.SINGLE_CORRECT,
      index: true,
    },

    // NEW: optional image URL for `image_based` (and any type that wants to
    // render a visual prompt). Empty string is the documented "no image"
    // sentinel so downstream code can `if (q.questionImage)` cleanly.
    questionImage: { type: String, default: '', trim: true },

    // NEW canonical answer field — array of option indexes.
    //   single_correct   → length === 1
    //   multiple_correct → length >= 2
    //   image_based      → length >= 1
    // Defaults to [] so old docs read out with a deterministic shape; the
    // pre('validate') hook backfills from `correctAnswerIndex` on save.
    correctAnswers: { type: [Number], default: [] },

    // LEGACY single-answer fields. Kept in the schema and kept in sync by
    // the pre-validate hook below so:
    //   - existing consumers (e.g. testAttemptService scoring) keep working
    //   - old records in Mongo that only have these fields still load fine
    // We relaxed `required` because new callers may only send the array
    // form; the hook guarantees both fields end up populated before insert.
    correctAnswerIndex: { type: Number, default: null, min: 0 },
    correctAnswerValue: { type: String, default: '', trim: true },

    explanation: { type: String, default: '' },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
    },
    postIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    year: { type: Number, default: null },
    difficulty: {
      type: String,
      enum: [DIFFICULTY.EASY, DIFFICULTY.MEDIUM, DIFFICULTY.HARD],
      default: DIFFICULTY.MEDIUM,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

questionSchema.index({ subjectId: 1 });
questionSchema.index({ topicId: 1 });
questionSchema.index({ postIds: 1 });
questionSchema.index({ year: 1 });
questionSchema.index({ isActive: 1, subjectId: 1, topicId: 1 });
questionSchema.index({ isActive: 1, postIds: 1 });
questionSchema.index({ isActive: 1, difficulty: 1, year: 1 });

function isValidHttpUrl(s) {
  if (typeof s !== 'string' || s.trim() === '') return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize + validate answer fields before Mongoose runs built-in checks.
 *
 * Responsibilities:
 *   1. Bridge legacy → new: if `correctAnswers` is empty but the legacy
 *      `correctAnswerIndex` exists, seed the array from it. This is what
 *      lets old documents re-save cleanly without a migration.
 *   2. Enforce per-type arity (1 for single, >=2 for multiple, >=1 for image).
 *   3. Enforce that every index points to a real option.
 *   4. Sync the legacy fields back from `correctAnswers[0]` so readers that
 *      still use `correctAnswerIndex` / `correctAnswerValue` (e.g. scoring)
 *      keep seeing a valid primary answer even on multi-correct questions.
 *   5. If `questionImage` is present, require it to be a valid http(s) URL.
 */
questionSchema.pre('validate', function normalizeAndValidateAnswers(next) {
  if (!Array.isArray(this.options) || this.options.length < 2) {
    return next(new Error('Question must have at least two options'));
  }
  const n = this.options.length;
  const type = this.questionType || QUESTION_TYPES.SINGLE_CORRECT;

  // (1) Legacy bridge — only when correctAnswers is genuinely unset.
  const hasAnswers = Array.isArray(this.correctAnswers) && this.correctAnswers.length > 0;
  if (
    !hasAnswers &&
    typeof this.correctAnswerIndex === 'number' &&
    Number.isInteger(this.correctAnswerIndex)
  ) {
    this.correctAnswers = [this.correctAnswerIndex];
  }

  if (!Array.isArray(this.correctAnswers) || this.correctAnswers.length === 0) {
    return next(new Error('correctAnswers must contain at least one option index'));
  }

  // (3) Range + integer check. Also coerce to Number so string "2" from
  // loose payloads becomes 2 on disk.
  const coerced = [];
  for (const raw of this.correctAnswers) {
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || v >= n) {
      return next(
        new Error(`correctAnswers contains an out-of-range index: ${raw}`)
      );
    }
    coerced.push(v);
  }
  // Dedupe while preserving first-seen order (matters for which index we
  // copy into the legacy `correctAnswerIndex` field below).
  this.correctAnswers = Array.from(new Set(coerced));

  // (2) Per-type arity.
  if (type === QUESTION_TYPES.SINGLE_CORRECT) {
    if (this.correctAnswers.length !== 1) {
      return next(
        new Error('single_correct questions must have exactly one correct answer')
      );
    }
  } else if (type === QUESTION_TYPES.MULTIPLE_CORRECT) {
    if (this.correctAnswers.length < 2) {
      return next(
        new Error('multiple_correct questions require at least two correct answers')
      );
    }
  } else if (type === QUESTION_TYPES.IMAGE_BASED) {
    if (!this.questionImage) {
      return next(
        new Error('image_based questions require a questionImage URL')
      );
    }
  }

  // (5) Image URL format check (applies whenever an image is set, not only
  // for `image_based` — a single_correct question can still carry a figure).
  if (this.questionImage && !isValidHttpUrl(this.questionImage)) {
    return next(new Error('questionImage must be a valid http(s) URL'));
  }

  // (4) Sync legacy fields. For multi-answer questions the primary is the
  // first correct index; this keeps the legacy consumers usable without
  // pretending they know about multi-correct.
  const primary = this.correctAnswers[0];
  this.correctAnswerIndex = primary;
  this.correctAnswerValue = String(this.options[primary]).trim();

  return next();
});

export const Question = mongoose.model('Question', questionSchema);
