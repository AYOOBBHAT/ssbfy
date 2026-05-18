import {
  computeIsCorrect,
  computeRetryListsFromResult,
  filterSelectedOptionIndexes,
  getCorrectIndexSet,
} from './attemptResultSnapshot.js';
import { LEARNING_SESSION_SNAPSHOT_VERSION } from '../constants/learningSessionTypes.js';
import { LEARNING_SESSION_MAX_QUESTION_IMAGE_CHARS } from '../constants/learningSessionLimits.js';

function normalizeQuestionImageForSnapshot(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= LEARNING_SESSION_MAX_QUESTION_IMAGE_CHARS) return trimmed;
  return trimmed.slice(0, LEARNING_SESSION_MAX_QUESTION_IMAGE_CHARS);
}

/**
 * Build canonical immutable snapshot v1 from scored session data.
 */
export function buildLearningSessionSnapshotV1({
  sessionType,
  orderedQuestionIds,
  questionsById,
  userAnswersByQid,
  correctAnswersPayload,
  weakTopics = [],
  summary = {},
  retryMeta = null,
  sourceAttemptId = null,
  sourceTestAttemptId = null,
  topicNameById = new Map(),
  subjectNameById = new Map(),
  canonicalTopicIdByTopicId = new Map(),
}) {
  const correctByQid = new Map(
    (Array.isArray(correctAnswersPayload) ? correctAnswersPayload : []).map((c) => [
      String(c.questionId),
      c,
    ])
  );

  const questions = [];

  for (const qid of orderedQuestionIds) {
    const sid = qid.toString();
    const q = questionsById.get(sid);
    if (!q) continue;

    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const selectedOptionIndexes = filterSelectedOptionIndexes(
      userAnswersByQid.get(sid),
      optionsLen
    );
    const centry = correctByQid.get(sid);
    const correctSet = Array.isArray(centry?.correctAnswers)
      ? centry.correctAnswers.map(Number).filter((n) => Number.isInteger(n))
      : getCorrectIndexSet(q);
    const isCorrect = computeIsCorrect(correctSet, selectedOptionIndexes);

    const tid = q.topicId != null ? String(q.topicId) : null;
    const sidRef = q.subjectId != null ? String(q.subjectId) : null;

    questions.push({
      questionId: q._id,
      questionText: q.questionText ?? '',
      options: Array.isArray(q.options) ? [...q.options] : [],
      questionType: q.questionType || 'single_correct',
      questionImage: normalizeQuestionImageForSnapshot(q.questionImage),
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
      topicId: q.topicId ?? null,
      canonicalTopicId:
        tid && canonicalTopicIdByTopicId.has(tid)
          ? canonicalTopicIdByTopicId.get(tid)
          : q.topicId ?? null,
      topicName: tid ? topicNameById.get(tid)?.name ?? '' : '',
      subjectId: q.subjectId ?? null,
      subjectName: sidRef ? subjectNameById.get(sidRef)?.name ?? '' : '',
      postIds: Array.isArray(q.postIds)
        ? q.postIds.map((p) => (p && typeof p === 'object' && p._id != null ? p._id : p))
        : [],
      selectedOptionIndexes,
      correctAnswers: correctSet,
      correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
      isCorrect,
    });
  }

  const weakTopicsOut = (Array.isArray(weakTopics) ? weakTopics : []).map((w) => {
    const tid = w.topicId != null ? String(w.topicId) : '';
    const canonicalId =
      w.canonicalTopicId ||
      (tid && canonicalTopicIdByTopicId.has(tid)
        ? canonicalTopicIdByTopicId.get(tid)
        : w.topicId);
    return {
      topicId: w.topicId,
      canonicalTopicId: canonicalId ?? null,
      mistakeCount: w.mistakeCount ?? 1,
      topicName: tid ? topicNameById.get(tid)?.name ?? w.topicName ?? '' : w.topicName ?? '',
    };
  });

  return {
    version: LEARNING_SESSION_SNAPSHOT_VERSION,
    sessionType,
    completedAt: new Date(),
    summary: {
      score: Number(summary.score) || 0,
      accuracy: Number(summary.accuracy) || 0,
      totalQuestions: Number(summary.totalQuestions) || questions.length,
      answeredQ: Number(summary.answeredQ) || 0,
      correct: Number(summary.correct) || 0,
      incorrect: Number(summary.incorrect) || 0,
      unanswered: Number(summary.unanswered) || 0,
    },
    weakTopics: weakTopicsOut,
    questions,
    retryMeta: retryMeta && typeof retryMeta === 'object' ? retryMeta : null,
    sourceAttemptId: sourceAttemptId || null,
    sourceTestAttemptId: sourceTestAttemptId || null,
  };
}

function questionDocFromSnapshotRow(row) {
  const tid = row.topicId;
  const topicRef =
    tid != null && row.topicName
      ? { _id: tid, name: row.topicName }
      : tid != null
      ? tid
      : null;

  return {
    _id: row.questionId,
    questionText: row.questionText ?? '',
    options: Array.isArray(row.options) ? [...row.options] : [],
    questionType: row.questionType || 'single_correct',
    questionImage: row.questionImage || '',
    explanation: row.explanation ?? '',
    topicId: topicRef,
    ...(row.topicName ? { topicName: row.topicName } : {}),
    subjectId: row.subjectId ?? null,
    ...(row.subjectName ? { subjectName: row.subjectName } : {}),
    postIds: Array.isArray(row.postIds) ? row.postIds : [],
  };
}

/**
 * Version-aware snapshot → Result view. Returns null when unsupported / corrupt.
 * @returns {{ payload: object | null, reason: 'ok' | 'missing' | 'unsupported' | 'empty' }}
 */
export function resolveLearningSessionResultView(doc) {
  if (!doc?.snapshot || typeof doc.snapshot !== 'object') {
    return { payload: null, reason: 'missing' };
  }

  const version = Number(doc.snapshot.version);
  if (
    version !== LEARNING_SESSION_SNAPSHOT_VERSION &&
    version !== 0 &&
    !Number.isNaN(version)
  ) {
    return { payload: null, reason: 'unsupported' };
  }

  if (version !== LEARNING_SESSION_SNAPSHOT_VERSION) {
    return { payload: null, reason: 'unsupported' };
  }

  const payload = buildResultViewFromSnapshotV1(doc, doc.snapshot);
  if (!payload) return { payload: null, reason: 'empty' };
  return { payload, reason: 'ok' };
}

/**
 * Map persisted snapshot v1 → Result-screen API payload (no live Question/Topic reads).
 */
export function buildResultViewFromLearningSession(doc) {
  return resolveLearningSessionResultView(doc).payload;
}

function buildResultViewFromSnapshotV1(doc, snap) {
  if (!snap || snap.version !== LEARNING_SESSION_SNAPSHOT_VERSION) {
    return null;
  }
  const rows = Array.isArray(snap.questions) ? snap.questions : [];
  if (rows.length === 0) return null;

  const questions = [];
  const userAnswers = {};
  const correctAnswers = [];

  for (const row of rows) {
    const sid = String(row.questionId);
    questions.push(questionDocFromSnapshotRow(row));

    if (Array.isArray(row.selectedOptionIndexes) && row.selectedOptionIndexes.length > 0) {
      userAnswers[sid] = [...row.selectedOptionIndexes];
    }

    correctAnswers.push({
      questionId: row.questionId,
      correctAnswerIndex: row.correctAnswerIndex ?? null,
      correctAnswers: Array.isArray(row.correctAnswers) ? row.correctAnswers : [],
      questionType: row.questionType || 'single_correct',
    });
  }

  const correctByQid = new Map(correctAnswers.map((c) => [String(c.questionId), c]));
  const { wrongQuestionIds, wrongQuestions, retrySkippedUnavailableCount } =
    computeRetryListsFromResult({
      questionsOrdered: questions,
      userAnswersByQid: userAnswers,
      getCorrectSetForQuestion: (qid) => {
        const centry = correctByQid.get(qid);
        const arr = Array.isArray(centry?.correctAnswers) ? centry.correctAnswers : [];
        return arr.map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
      },
    });

  const summary = snap.summary && typeof snap.summary === 'object' ? snap.summary : {};
  const totalQ = Number(summary.totalQuestions) || questions.length;
  const attemptedQs = Number(summary.answeredQ) || Object.keys(userAnswers).length;

  return {
    learningSessionId: String(doc._id),
    sessionType: doc.sessionType || snap.sessionType || 'practice',
    immutableAttemptSnapshot: true,
    score: summary.score ?? 0,
    accuracy: summary.accuracy ?? 0,
    timeTaken: 0,
    weakTopics: (snap.weakTopics || doc.weakTopics || []).map((w) => ({
      topicId: w.topicId,
      mistakeCount: w.mistakeCount ?? 1,
      ...(w.topicName ? { topicName: w.topicName } : {}),
    })),
    correctAnswers,
    questions,
    userAnswers,
    wrongQuestionIds,
    wrongQuestions,
    retrySkippedUnavailableCount,
    summary,
    retryMeta: snap.retryMeta ?? null,
    sourceAttemptId: snap.sourceAttemptId ? String(snap.sourceAttemptId) : null,
    totalQuestions: totalQ,
    attemptedQuestions: attemptedQs,
    unansweredQuestions:
      summary.unanswered != null
        ? Number(summary.unanswered)
        : Math.max(0, totalQ - attemptedQs),
    skippedQuestions: 0,
    markedForReviewCount: 0,
    practiceRevealed: true,
  };
}
