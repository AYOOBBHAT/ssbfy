import mongoose from 'mongoose';
import { BATTLE_STATUSES, BATTLE_TIMER_MODES } from '../constants/battle.js';

/** Frozen copy of a Question at battle creation — gameplay + scoring. */
const battleQuestionSnapshotSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    questionText: { type: String, required: true },
    options: [{ type: String, required: true }],
    questionType: { type: String, default: 'single_correct' },
    questionImage: { type: String, default: '' },
    presentationKind: { type: String, default: 'plain' },
    content: { type: mongoose.Schema.Types.Mixed, default: null },
    correctAnswers: { type: [Number], default: [] },
    correctAnswerIndex: { type: Number, default: null, min: 0 },
    correctAnswerValue: { type: String, default: '' },
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
    difficulty: { type: String, default: 'medium' },
    year: { type: Number, default: null },
  },
  { _id: false }
);

const battleSessionSchema = new mongoose.Schema(
  {
    inviteCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
      unique: true,
    },
    creatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    opponentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: BATTLE_STATUSES,
      default: 'waiting',
      index: true,
    },
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
    difficulty: { type: String, default: 'all' },
    /** Frozen at creation — never mutated. */
    questionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    ],
    /**
     * Immutable question payloads frozen at creation.
     * Absent / empty on legacy battles — those fall back to live questionIds.
     */
    questionSnapshots: {
      type: [battleQuestionSnapshotSchema],
      default: undefined,
    },
    questionCount: { type: Number, required: true, min: 1 },
    timerMode: {
      type: String,
      enum: BATTLE_TIMER_MODES,
      default: 'none',
    },
    /** Total seconds when timerMode is `total`; per-question seconds when `per_question`. */
    timerSeconds: { type: Number, default: null, min: 0 },
    /** LearningSession ids after successful reveal. */
    creatorAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningSession',
      default: null,
    },
    opponentAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningSession',
      default: null,
    },
    /** In-flight issuance — one start per side. */
    creatorIssuanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PracticeIssuance',
      default: null,
    },
    opponentIssuanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PracticeIssuance',
      default: null,
    },
    creatorStartedAt: { type: Date, default: null },
    opponentStartedAt: { type: Date, default: null },
    creatorScore: { type: Number, default: null },
    opponentScore: { type: Number, default: null },
    creatorIncorrect: { type: Number, default: null },
    opponentIncorrect: { type: Number, default: null },
    creatorTimeTakenMs: { type: Number, default: null, min: 0 },
    opponentTimeTakenMs: { type: Number, default: null, min: 0 },
    winnerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

battleSessionSchema.index({ creatorUserId: 1, createdAt: -1 });
battleSessionSchema.index({ opponentUserId: 1, createdAt: -1 });
battleSessionSchema.index({ status: 1, expiresAt: 1 });

export const BattleSession = mongoose.model('BattleSession', battleSessionSchema);
