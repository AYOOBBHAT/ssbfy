import mongoose from 'mongoose';

const snapshotQuestionSchema = new mongoose.Schema(
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
    canonicalTopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      default: null,
    },
    topicName: { type: String, default: '' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName: { type: String, default: '' },
    postIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    selectedOptionIndexes: { type: [Number], default: [] },
    correctAnswers: { type: [Number], default: [] },
    correctAnswerIndex: { type: Number, default: null },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const weakTopicSnapshotSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    mistakeCount: { type: Number, default: 1, min: 1 },
    topicName: { type: String, default: '' },
  },
  { _id: false }
);

const summarySnapshotSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    answeredQ: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    incorrect: { type: Number, default: 0 },
    unanswered: { type: Number, default: 0 },
  },
  { _id: false }
);

const learningSessionSnapshotSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1 },
    sessionType: { type: String, default: 'practice' },
    completedAt: { type: Date, default: null },
    summary: { type: summarySnapshotSchema, default: () => ({}) },
    weakTopics: { type: [weakTopicSnapshotSchema], default: [] },
    questions: { type: [snapshotQuestionSchema], default: [] },
    retryMeta: { type: mongoose.Schema.Types.Mixed, default: null },
    sourceAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestAttempt', default: null },
    sourceTestAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestAttempt',
      default: null,
    },
  },
  { _id: false }
);

const learningSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionType: { type: String, required: true, index: true },
    completedAt: { type: Date, required: true, index: true },
    /** Idempotency key from client (same finish → same session). */
    clientSessionKey: { type: String, default: null },
    summary: { type: summarySnapshotSchema, default: () => ({}) },
    weakTopics: { type: [weakTopicSnapshotSchema], default: [] },
    snapshot: { type: learningSessionSnapshotSchema, required: true },
  },
  { timestamps: true }
);

learningSessionSchema.index({ userId: 1, completedAt: -1 });
learningSessionSchema.index(
  { userId: 1, clientSessionKey: 1 },
  {
    unique: true,
    partialFilterExpression: { clientSessionKey: { $type: 'string' } },
  }
);

export const LearningSession = mongoose.model('LearningSession', learningSessionSchema);
