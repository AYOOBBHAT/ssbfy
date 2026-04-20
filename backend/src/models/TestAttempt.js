import mongoose from 'mongoose';

const answerItemSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
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
    score: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    timeTaken: { type: Number, default: null },
  },
  { timestamps: true }
);

testAttemptSchema.index({ userId: 1, testId: 1 });
testAttemptSchema.index({ userId: 1, testId: 1, endTime: 1 });

export const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);
