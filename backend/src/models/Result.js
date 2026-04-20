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

resultSchema.index({ userId: 1, testId: 1, createdAt: -1 });

export const Result = mongoose.model('Result', resultSchema);
