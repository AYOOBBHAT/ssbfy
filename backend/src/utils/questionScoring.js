import mongoose from 'mongoose';
import {
  WEAK_TOPIC_LIMIT,
  computeIsCorrect,
  filterSelectedOptionIndexes,
  getCorrectIndexSet,
  indexSetsEqual,
} from './attemptResultSnapshot.js';

/** @typedef {import('mongoose').Types.ObjectId} ObjectId */

export { getCorrectIndexSet as normalizeCorrectSet };

/**
 * @param {unknown} questionId
 * @param {{ questionType?: string, correctAnswers?: number[], correctAnswerIndex?: number }} q
 */
export function buildCorrectAnswerPayload(questionId, q) {
  const correctSet = getCorrectIndexSet(q);
  const qid = questionId != null ? questionId : q._id;
  return {
    questionId: qid,
    correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
    correctAnswers: correctSet,
    questionType: q.questionType || 'single_correct',
  };
}

/**
 * @param {Map<string, number>} topicMistakes
 * @returns {Array<{ topicId: ObjectId, mistakeCount: number }>}
 */
export function computeWeakTopics(topicMistakes) {
  if (!(topicMistakes instanceof Map) || topicMistakes.size === 0) {
    return [];
  }
  return [...topicMistakes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WEAK_TOPIC_LIMIT)
    .map(([topicIdStr, count]) => ({
      topicId: new mongoose.Types.ObjectId(topicIdStr),
      mistakeCount: count,
    }));
}

/**
 * @param {{
 *   totalQuestions: number,
 *   correctCount: number,
 *   answeredQ: number,
 *   score?: number,
 * }} params
 */
export function computePracticeSummary({ totalQuestions, correctCount, answeredQ, score }) {
  const total = Math.max(0, Number(totalQuestions) || 0);
  const correct = Math.max(0, Number(correctCount) || 0);
  const answered = Math.max(0, Math.min(Number(answeredQ) || 0, total));
  const unanswered = Math.max(0, total - answered);
  const incorrect = Math.max(0, answered - correct);
  const resolvedScore = score != null ? Math.max(0, Number(score) || 0) : correct;
  const accuracy =
    total === 0
      ? 0
      : Math.round(((correct / total) * 100 + Number.EPSILON) * 100) / 100;

  return {
    score: resolvedScore,
    totalQuestions: total,
    answeredQ: answered,
    accuracy,
    correct,
    incorrect,
    unanswered,
  };
}

/**
 * Canonical per-question scoring (mock submit + practice reveal).
 *
 * @param {{
 *   orderedQuestionIds: ObjectId[],
 *   questionsById: Map<string, object>,
 *   userAnswersByQid: Map<string, number[]>,
 *   negativeMarking?: number,
 * }} params
 */
export function scoreQuestionSession({
  orderedQuestionIds,
  questionsById,
  userAnswersByQid,
  negativeMarking = 0,
}) {
  const negative = Math.max(0, Number(negativeMarking) || 0);
  let correctCount = 0;
  let answeredQ = 0;
  let rawScore = 0;
  const topicMistakes = new Map();
  const correctAnswers = [];

  for (const qid of orderedQuestionIds) {
    const sid = qid.toString();
    const q = questionsById.get(sid);
    if (!q) {
      throw new Error(`Question not found for scoring: ${sid}`);
    }

    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const rawUser = userAnswersByQid.has(sid)
      ? userAnswersByQid.get(sid)
      : [];
    const selectedSet = filterSelectedOptionIndexes(rawUser, optionsLen);
    if (selectedSet.length > 0) {
      answeredQ += 1;
    }

    const correctSet = getCorrectIndexSet(q);
    const isCorrect = computeIsCorrect(correctSet, selectedSet);

    correctAnswers.push(buildCorrectAnswerPayload(q._id, q));

    if (isCorrect) {
      correctCount += 1;
      rawScore += 1;
    } else {
      rawScore -= negative;
      if (q.topicId) {
        const tid = q.topicId.toString();
        topicMistakes.set(tid, (topicMistakes.get(tid) || 0) + 1);
      }
    }
  }

  const total = orderedQuestionIds.length;
  const score = Math.max(0, rawScore);
  const weakTopics = computeWeakTopics(topicMistakes);
  const summary = computePracticeSummary({
    totalQuestions: total,
    correctCount,
    answeredQ,
    score,
  });

  return {
    correctAnswers,
    weakTopics,
    summary,
    correctCount,
    indexSetsEqual,
    computeIsCorrect,
  };
}
