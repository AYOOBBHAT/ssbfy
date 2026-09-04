import mongoose from 'mongoose';
import { TEST_TYPE } from '../constants/testType.js';
import { TEST_STATUS, TEST_STATUS_VALUES } from '../constants/testStatus.js';
import {
  TEST_DESCRIPTION_MAX,
  TEST_KIND,
  TEST_KIND_VALUES,
  TEST_YEAR_MAX,
  TEST_YEAR_MIN,
} from '../constants/testKind.js';

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        TEST_TYPE.SUBJECT,
        TEST_TYPE.POST,
        TEST_TYPE.TOPIC,
        TEST_TYPE.MIXED,
      ],
      required: true,
    },
    /**
     * Product kind. Distinct from `type` (taxonomy).
     * Default `mock` — omitted on legacy documents; treat missing as mock.
     */
    kind: {
      type: String,
      enum: TEST_KIND_VALUES,
      default: TEST_KIND.MOCK,
    },
    /** Calendar year of the original paper. Required for previous_year; unused for mock. */
    year: {
      type: Number,
      default: null,
      validate: {
        validator(v) {
          if (v == null) return true;
          return Number.isInteger(v) && v >= TEST_YEAR_MIN && v <= TEST_YEAR_MAX;
        },
        message: `year must be an integer between ${TEST_YEAR_MIN} and ${TEST_YEAR_MAX}`,
      },
    },
    /** Exam / post this PYQ belongs to. Required for previous_year. */
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: TEST_DESCRIPTION_MAX,
    },
    /** Optional source PDF. Supplementary only — the playable paper is this Test. */
    pdfNoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PdfNote',
      default: null,
    },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    duration: { type: Number, required: true, min: 1 },
    negativeMarking: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: TEST_STATUS_VALUES,
      default: TEST_STATUS.ACTIVE,
    },
    /** Set when status becomes disabled; cleared on re-enable. */
    disabledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** Admin / analytics filters by test type. */
testSchema.index({ type: 1 }, { name: 'idx_test_type' });

/**
 * Discovery + admin list — `testRepository.findAll` sorts `{ createdAt: -1 }`;
 * `listForDiscovery` filters active tests (status is post-filter in app code).
 */
testSchema.index({ status: 1, createdAt: -1 }, { name: 'idx_test_status_created' });

/**
 * Admin question usage — `questionRepository.getUsageCounts` counts tests referencing a question.
 */
testSchema.index({ questionIds: 1 }, { name: 'idx_test_question_ids' });

/**
 * PYQ discovery — GET /tests?kind=previous_year with optional postId + year.
 * Prefix covers kind-only and kind+postId. status supports the same lifecycle
 * as mocks (active vs disabled) without a second index.
 */
testSchema.index(
  { kind: 1, postId: 1, year: -1, status: 1 },
  { name: 'idx_test_pyq_discovery' }
);

export const Test = mongoose.model('Test', testSchema);
