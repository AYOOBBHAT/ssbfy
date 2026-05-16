import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema(
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
    score: { type: Number, required: true, min: 0 },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    weakTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    timeTaken: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

/**
 * Legacy Result list — `resultRepository.findByUser` filters userId, sorts createdAt DESC.
 * Leading userId + descending createdAt avoids scanning the wider userId+testId compound.
 */
resultSchema.index({ userId: 1, createdAt: -1 }, { name: 'idx_result_user_recent' });

/** Per-test history when testId is present in the filter. */
resultSchema.index({ userId: 1, testId: 1, createdAt: -1 }, { name: 'idx_result_user_test_recent' });

export const Result = mongoose.model('Result', resultSchema);
