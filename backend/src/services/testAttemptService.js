import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { testRepository } from '../repositories/testRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { resultRepository } from '../repositories/resultRepository.js';
import { testService } from './testService.js';

const WEAK_TOPIC_LIMIT = 10;

/**
 * Coerce one answer payload into the canonical shape used inside the
 * scoring loop. Accepts either the new array form (`selectedOptionIndexes`)
 * or the legacy scalar (`selectedOptionIndex`); the array always wins when
 * both are present.
 *
 * Returns:
 *   {
 *     questionId,
 *     selectedOptionIndexes: number[]  // sorted, deduped, possibly empty
 *     selectedOptionIndex:    number|null  // legacy mirror; arr[0] or null
 *   }
 *
 * Empty array means "unanswered" — explicitly preserved (not coerced into
 * an arbitrary index) so the scorer can treat it as wrong / missing rather
 * than guessing the user picked option A.
 */
function normalizeOneAnswer(a) {
  const out = {
    questionId: new mongoose.Types.ObjectId(a.questionId),
    selectedOptionIndexes: [],
    selectedOptionIndex: null,
  };

  let arr = null;
  if (Array.isArray(a.selectedOptionIndexes) && a.selectedOptionIndexes.length > 0) {
    arr = a.selectedOptionIndexes;
  } else if (
    a.selectedOptionIndex !== null &&
    a.selectedOptionIndex !== undefined &&
    a.selectedOptionIndex !== ''
  ) {
    const n = Number(a.selectedOptionIndex);
    if (Number.isInteger(n) && n >= 0) {
      arr = [n];
    }
  }

  if (!arr) return out;

  const cleaned = [];
  for (const raw of arr) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) cleaned.push(n);
  }
  if (cleaned.length === 0) return out;

  const dedupSorted = Array.from(new Set(cleaned)).sort((a, b) => a - b);
  out.selectedOptionIndexes = dedupSorted;
  out.selectedOptionIndex = dedupSorted[0];
  return out;
}

function normalizeAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers.map(normalizeOneAnswer);
}

/**
 * Read a question's canonical correct-answer set, transparently handling
 * legacy docs that only have `correctAnswerIndex`. Returns a deduped sorted
 * array (possibly empty for malformed docs — caller should treat empty as
 * "no question can be scored correct").
 */
function getCorrectIndexSet(q) {
  if (Array.isArray(q?.correctAnswers) && q.correctAnswers.length > 0) {
    return Array.from(new Set(q.correctAnswers.map(Number))).sort((a, b) => a - b);
  }
  if (typeof q?.correctAnswerIndex === 'number' && Number.isInteger(q.correctAnswerIndex)) {
    return [q.correctAnswerIndex];
  }
  return [];
}

/**
 * Order-independent set equality on already-sorted-deduped index arrays.
 *
 * Multi-correct scoring rule (from the spec):
 *   correctAnswers = [0, 2]
 *     [0,2]   → correct
 *     [2,0]   → correct (sorted before compare)
 *     [0]     → wrong  (length differs)
 *     [0,1,2] → wrong  (length differs)
 *     [1,2]   → wrong  (same length, different members)
 *
 * Both inputs MUST already be sorted+deduped (callers do this above), so
 * this is a tight O(n) walk with no allocation.
 */
function indexSetsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function dedupeQuestionIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const s = id.toString();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(new mongoose.Types.ObjectId(id));
    }
  }
  return out;
}

function validateAnswerCoverage(attemptQuestionIds, answers) {
  const allowed = new Set(attemptQuestionIds.map((id) => id.toString()));
  if (answers.length !== attemptQuestionIds.length) {
    throw new AppError(
      `answers must include exactly one entry per question (${attemptQuestionIds.length} required)`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const seen = new Set();
  for (const a of answers) {
    const qid = a.questionId.toString();
    if (!allowed.has(qid)) {
      throw new AppError('answers contain a questionId not in this attempt', HTTP_STATUS.BAD_REQUEST);
    }
    if (seen.has(qid)) {
      throw new AppError('Duplicate questionId in answers', HTTP_STATUS.BAD_REQUEST);
    }
    seen.add(qid);
  }
  if (seen.size !== allowed.size) {
    throw new AppError('answers must cover every question in the attempt', HTTP_STATUS.BAD_REQUEST);
  }
}

export const testAttemptService = {
  async start(userId, testId, { isPremium = false } = {}) {
    // Use the service view so inactive / orphaned questions are already
    // stripped out before we build the attempt snapshot. This prevents a
    // user from ever being assigned a question whose subject or topic has
    // since been disabled by an admin.
    const test = await testService.getById(testId);
    if (!test.questionIds?.length) {
      throw new AppError('Test has no active questions available', HTTP_STATUS.BAD_REQUEST);
    }

    if (!isPremium) {
      const submitted = await testAttemptRepository.findSubmittedByUserAndTest(userId, testId);
      if (submitted) {
        throw new AppError('Test already completed', HTTP_STATUS.CONFLICT);
      }
    }

    const existing = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
    if (existing) {
      return {
        attempt: existing,
        resumed: true,
      };
    }

    const questionIds = dedupeQuestionIds(test.questionIds);
    if (!questionIds.length) {
      throw new AppError('Test has no questions configured', HTTP_STATUS.BAD_REQUEST);
    }

    const attemptNumber = await testAttemptRepository.getNextAttemptNumber(userId, testId);

    let attempt;
    try {
      attempt = await testAttemptRepository.create({
        userId,
        testId,
        questionIds,
        answers: [],
        startTime: new Date(),
        attemptNumber,
      });
    } catch (e) {
      // If two start requests race for a premium user, the partial unique index
      // on open attempts and the unique attemptNumber index will keep data
      // consistent. In that case, fetch the in-progress attempt and return it.
      const inProgress = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
      if (inProgress) {
        return { attempt: inProgress, resumed: true };
      }
      throw e;
    }

    return { attempt, resumed: false };
  },

  async submit(userId, testId, rawAnswers) {
    const answers = normalizeAnswers(rawAnswers);
    const test = await testRepository.findById(testId);
    if (!test) {
      throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
    }

    const attempt = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
    if (!attempt) {
      throw new AppError('No active attempt — start the test first', HTTP_STATUS.NOT_FOUND);
    }

    if (attempt.userId.toString() !== String(userId)) {
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }
    if (attempt.endTime != null) {
      throw new AppError('Test already submitted', HTTP_STATUS.CONFLICT);
    }

    const testQuestionSet = new Set(test.questionIds.map((id) => id.toString()));
    for (const qid of attempt.questionIds) {
      if (!testQuestionSet.has(qid.toString())) {
        throw new AppError(
          'Attempt snapshot no longer matches this test; start a new attempt',
          HTTP_STATUS.CONFLICT
        );
      }
    }

    validateAnswerCoverage(attempt.questionIds, answers);

    const questions = await questionRepository.findActiveByIds(attempt.questionIds);
    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    if (questions.length !== attempt.questionIds.length) {
      throw new AppError(
        'Some questions are missing or inactive; cannot score this attempt',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const answerByQ = new Map(answers.map((a) => [a.questionId.toString(), a]));
    const negative = Number(test.negativeMarking) || 0;
    const total = attempt.questionIds.length;

    let correctCount = 0;
    let rawScore = 0;
    const topicMistakes = new Map();
    const correctAnswers = [];

    for (const qid of attempt.questionIds) {
      const q = qMap.get(qid.toString());
      if (!q) {
        throw new AppError('Question not found for this attempt', HTTP_STATUS.BAD_REQUEST);
      }
      const ans = answerByQ.get(qid.toString());

      const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
      const maxIdx = optionsLen - 1;

      // Normalize selection — drop any index that points outside the
      // question's options. A malformed selection is treated the same way
      // as "unanswered" rather than throwing, so one bad payload can't
      // poison the whole submit.
      const selectedSet = (ans.selectedOptionIndexes || []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i <= maxIdx
      );

      const correctSet = getCorrectIndexSet(q);

      // Order-independent set comparison. This is the SINGLE scoring rule
      // for every question type:
      //   - single_correct / image_based: correctSet has length 1, so the
      //     user's selectedSet must also be exactly [thatIndex].
      //   - multiple_correct: correctSet has length >=2; user must have
      //     selected exactly the same set (no missing, no extra).
      // This is identical to the single-index `selected === correctIndex`
      // check for legacy single-correct questions, so existing scoring is
      // unchanged for the old data path.
      const isCorrect =
        correctSet.length > 0 && indexSetsEqual(selectedSet, correctSet);

      correctAnswers.push({
        questionId: q._id,
        // Legacy mirror for any client still reading the scalar field.
        correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
        // New canonical shape — full set of correct option indexes.
        correctAnswers: correctSet,
        // Useful for the result screen so it doesn't have to re-classify.
        questionType: q.questionType || 'single_correct',
      });

      if (isCorrect) {
        correctCount += 1;
        rawScore += 1;
      } else {
        rawScore -= negative;
        const tid = q.topicId.toString();
        topicMistakes.set(tid, (topicMistakes.get(tid) || 0) + 1);
      }
    }

    const score = Math.max(0, rawScore);
    const accuracy =
      total === 0 ? 0 : Math.round(((correctCount / total) * 100 + Number.EPSILON) * 100) / 100;

    const endTime = new Date();
    const timeTaken = Math.max(
      0,
      Math.round((endTime.getTime() - new Date(attempt.startTime).getTime()) / 1000)
    );

    const weakTopics = [...topicMistakes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, WEAK_TOPIC_LIMIT)
      .map(([topicIdStr, count]) => ({
        topicId: new mongoose.Types.ObjectId(topicIdStr),
        mistakeCount: count,
      }));

    const weakTopicIds = weakTopics.map((w) => w.topicId);

    const updated = await testAttemptRepository.finalizeAttempt(attempt._id, userId, testId, {
      answers,
      endTime,
      score,
      accuracy,
      timeTaken,
    });

    if (!updated) {
      throw new AppError('Test already submitted', HTTP_STATUS.CONFLICT);
    }

    await resultRepository.create({
      userId,
      testId,
      score,
      accuracy,
      weakTopics: weakTopicIds,
      timeTaken,
    });

    return {
      attempt: updated,
      score,
      accuracy,
      timeTaken,
      weakTopics,
      correctAnswers,
    };
  },

  /**
   * Previous completed attempts for a given user+test.
   * Intended for future UI use (attempt history).
   */
  async listHistory(userId, testId) {
    const rows = await testAttemptRepository.listSubmittedByUserAndTest(userId, testId);
    // Backfill legacy null attemptNumbers in response only (do not write).
    // We assign based on oldest-first ordering so attempt 1 is the earliest.
    const oldestFirst = [...rows].sort((a, b) => {
      const ta = new Date(a.endTime || a.createdAt || 0).getTime();
      const tb = new Date(b.endTime || b.createdAt || 0).getTime();
      return ta - tb;
    });
    const derivedMap = new Map();
    for (let i = 0; i < oldestFirst.length; i += 1) {
      const id = String(oldestFirst[i]._id);
      derivedMap.set(id, i + 1);
    }

    return rows.map((a) => ({
      _id: a._id,
      testId: a.testId,
      attemptNumber: a.attemptNumber ?? derivedMap.get(String(a._id)) ?? null,
      score: a.score,
      accuracy: a.accuracy,
      timeTaken: a.timeTaken,
      startTime: a.startTime,
      endTime: a.endTime,
      createdAt: a.createdAt,
    }));
  },
};
