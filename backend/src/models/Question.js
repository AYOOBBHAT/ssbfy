import mongoose from 'mongoose';
import { DIFFICULTY } from '../constants/difficulty.js';

const questionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswerIndex: { type: Number, required: true, min: 0 },
    correctAnswerValue: { type: String, required: true, trim: true },
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

questionSchema.pre('validate', function validateOptions(next) {
  if (!Array.isArray(this.options) || this.options.length < 2) {
    return next(new Error('Question must have at least two options'));
  }
  if (
    typeof this.correctAnswerIndex !== 'number' ||
    !Number.isInteger(this.correctAnswerIndex) ||
    this.correctAnswerIndex < 0 ||
    this.correctAnswerIndex >= this.options.length
  ) {
    return next(new Error('correctAnswerIndex must be a valid option index'));
  }
  const expected = String(this.options[this.correctAnswerIndex]).trim();
  const stored = String(this.correctAnswerValue ?? '').trim();
  if (expected !== stored) {
    return next(new Error('correctAnswerValue must match options[correctAnswerIndex]'));
  }
  return next();
});

export const Question = mongoose.model('Question', questionSchema);
