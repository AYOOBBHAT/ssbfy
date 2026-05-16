import mongoose from 'mongoose';
import { TEST_TYPE } from '../constants/testType.js';
import { TEST_STATUS, TEST_STATUS_VALUES } from '../constants/testStatus.js';

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

export const Test = mongoose.model('Test', testSchema);
