import mongoose from 'mongoose';
import { TEST_TYPE } from '../constants/testType.js';

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
  },
  { timestamps: true }
);

testSchema.index({ type: 1 });

export const Test = mongoose.model('Test', testSchema);
