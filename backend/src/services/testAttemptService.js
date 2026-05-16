import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { testRepository } from '../repositories/testRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { resultRepository } from '../repositories/resultRepository.js';
import { testService } from './testService.js';
import {
  WEAK_TOPIC_LIMIT,
  buildResultSnapshotAtSubmit,
  computeIsCorrect,
  computeRetryListsFromResult,
  filterSelectedOptionIndexes,
  getCorrectIndexSet,
  hasImmutableSnapshot,
  indexSetsEqual,
  normalizeAnswers,
} from '../utils/attemptResultSnapshot.js';

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

/**
 * Rebuild the same payload shape as a successful `submit()` response from the
 * latest submitted attempt — used when the client retries after the server
 * already finalized (lost HTTP response, timeout, duplicate tap).
 */
async function buildRecoverPayloadForSubmitConflict(userId, testId) {
  const rows = await testAttemptRepository.listSubmittedByUserAndTest(userId, testId);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const latest = rows[0];
  const questions = await questionRepository.findByIdsForScoring(latest.questionIds);
  if (questions.length !== latest.questionIds.length) return null;

  const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
  const answerByQ = new Map(
    (latest.answers || []).map((a) => [a.questionId.toString(), a])
  );

  const correctAnswers = [];
  const topicMistakes = new Map();

  for (const qid of latest.questionIds) {
    const q = qMap.get(qid.toString());
    if (!q) return null;

    const correctSet = getCorrectIndexSet(q);
    correctAnswers.push({
      questionId: q._id,
      correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
      correctAnswers: correctSet,
      questionType: q.questionType || 'single_correct',
    });

    const ans = answerByQ.get(qid.toString());
    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const maxIdx = optionsLen - 1;
    const selectedSet = (ans?.selectedOptionIndexes || []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i <= maxIdx
    );

    const isCorrect = correctSet.length > 0 && indexSetsEqual(selectedSet, correctSet);
    if (!isCorrect && selectedSet.length > 0) {
      const tid = q.topicId.toString();
      topicMistakes.set(tid, (topicMistakes.get(tid) || 0) + 1);
    }
  }

  const weakTopics = [...topicMistakes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WEAK_TOPIC_LIMIT)
    .map(([topicIdStr, count]) => ({
      topicId: new mongoose.Types.ObjectId(topicIdStr),
      mistakeCount: count,
    }));

  if (hasImmutableSnapshot(latest)) {
    const snap = latest.resultSnapshot;
    return {
      attempt: latest,
      score: latest.score ?? 0,
      accuracy: latest.accuracy ?? 0,
      timeTaken: latest.timeTaken ?? 0,
      weakTopics: (snap.weakTopics || []).map((w) => ({
        topicId: w.topicId,
        mistakeCount: w.mistakeCount ?? 1,
      })),
      correctAnswers: (snap.items || []).map((item) => ({
        questionId: item.questionId,
        correctAnswerIndex: item.correctAnswerIndex ?? null,
        correctAnswers: Array.isArray(item.correctAnswers) ? item.correctAnswers : [],
        questionType: item.questionType || 'single_correct',
      })),
    };
  }

  return {
    attempt: latest,
    score: latest.score ?? 0,
    accuracy: latest.accuracy ?? 0,
    timeTaken: latest.timeTaken ?? 0,
    weakTopics,
    correctAnswers,
  };
}

function questionDocFromSnapshotItem(item) {
  return {
    _id: item.questionId,
    questionText: item.questionText ?? '',
    options: Array.isArray(item.options) ? item.options : [],
    questionType: item.questionType || 'single_correct',
    questionImage: item.questionImage ?? '',
    explanation: item.explanation ?? '',
    topicId: item.topicId ?? null,
    subjectId: item.subjectId ?? null,
    postIds: Array.isArray(item.postIds) ? item.postIds : [],
    correctAnswers: Array.isArray(item.correctAnswers) ? item.correctAnswers : [],
    correctAnswerIndex: item.correctAnswerIndex ?? null,
  };
}

/**
 * Historical Result payload from immutable `resultSnapshot` only.
 * Does not load live Test or Question correctness.
 * Retry lists are derived from frozen snapshot items (not legacy wrongQuestionIds).
 */
async function buildHistoricalPayloadFromImmutableSnapshot(attempt) {
  const snap = attempt.resultSnapshot;
  const test = await testRepository.findById(attempt.testId);
  const itemById = new Map(snap.items.map((it) => [it.questionId.toString(), it]));

  const questions = [];
  const userAnswers = {};
  const correctAnswers = [];

  for (const qid of attempt.questionIds || []) {
    const sid = qid.toString();
    const item = itemById.get(sid);
    if (!item) continue;

    questions.push(questionDocFromSnapshotItem(item));

    if (Array.isArray(item.selectedOptionIndexes) && item.selectedOptionIndexes.length > 0) {
      userAnswers[sid] = [...item.selectedOptionIndexes];
    }

    correctAnswers.push({
      questionId: item.questionId,
      correctAnswerIndex: item.correctAnswerIndex ?? null,
      correctAnswers: Array.isArray(item.correctAnswers) ? item.correctAnswers : [],
      questionType: item.questionType || 'single_correct',
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

  const weakTopics = (snap.weakTopics || []).map((w) => ({
    topicId: w.topicId,
    mistakeCount: w.mistakeCount ?? 1,
  }));

  const totalQ = (attempt.questionIds || []).length;
  const attemptedQs = Object.keys(userAnswers).length;

  return {
    attemptId: String(attempt._id),
    attemptNumber: attempt.attemptNumber ?? null,
    testId: String(attempt.testId),
    testTitle: test?.title ?? null,
    testAvailable: !!test,
    immutableAttemptSnapshot: true,
    score: attempt.score ?? 0,
    accuracy: attempt.accuracy ?? 0,
    timeTaken: attempt.timeTaken ?? 0,
    weakTopics,
    correctAnswers,
    questions,
    userAnswers,
    wrongQuestionIds,
    wrongQuestions,
    retrySkippedUnavailableCount,
    totalQuestions: totalQ,
    attemptedQuestions: attemptedQs,
    unansweredQuestions: Math.max(0, totalQ - attemptedQs),
    skippedQuestions: 0,
    markedForReviewCount: 0,
  };
}

/*
 * Manual QA — historical attempt integrity (run after changes):
 * - Same mock attempted 3+ times: each Profile row opens its own attemptId result.
 * - Admin changes correct answers after submit: old attempt score/review unchanged (snapshot).
 * - Admin deletes a question: historical review shows snapshot text; retry skips missing options.
 * - Test deleted/inactive: review still loads; banner when test gone; retry uses snapshot only.
 * - Rapid Profile taps between attempts: no stale answers (client abort + gen counter).
 * - Retry wrong from historical attempt #1 vs #4: disjoint wrong sets, no shared cache.
 * - Blank submission → retry includes all questions; partial attempt → incorrect + skipped.
 */

/**
 * Full Result-screen payload for one completed attempt (historical review).
 * Prefers immutable `resultSnapshot` when present; legacy attempts may
 * rehydrate from live Question docs (best-effort, may drift if bank edited).
 */
async function buildHistoricalResultViewPayload(attempt) {
  if (hasImmutableSnapshot(attempt)) {
    return buildHistoricalPayloadFromImmutableSnapshot(attempt);
  }
  const test = await testRepository.findById(attempt.testId);
  const testAvailable = !!test;
  const testTitle = test?.title ?? null;

  const rawQuestions = await questionRepository.findByIdsForScoring(attempt.questionIds || []);
  const qById = new Map(rawQuestions.map((q) => [q._id.toString(), q]));

  const questionsOrdered = [];
  for (const qid of attempt.questionIds || []) {
    const q = qById.get(qid.toString());
    if (q) {
      questionsOrdered.push(q);
    } else {
      questionsOrdered.push({
        _id: qid,
        questionText: 'This question is no longer available.',
        options: [],
        topicId: null,
        subjectId: null,
        postIds: [],
        questionType: 'single_correct',
        correctAnswers: [],
        explanation: '',
        questionImage: '',
      });
    }
  }

  const normalizedAnswers = normalizeAnswers(attempt.answers || []);
  const answerByQ = new Map(normalizedAnswers.map((a) => [a.questionId.toString(), a]));

  const userAnswers = {};
  for (const qid of attempt.questionIds || []) {
    const sid = qid.toString();
    const ans = answerByQ.get(sid);
    const arr = Array.isArray(ans?.selectedOptionIndexes) ? [...ans.selectedOptionIndexes] : [];
    if (arr.length > 0) {
      userAnswers[sid] = arr;
    }
  }

  const correctAnswers = [];
  const topicMistakes = new Map();

  for (const qid of attempt.questionIds || []) {
    const q = qById.get(qid.toString());
    if (!q) {
      correctAnswers.push({
        questionId: qid,
        correctAnswerIndex: null,
        correctAnswers: [],
        questionType: 'single_correct',
      });
      continue;
    }

    const correctSet = getCorrectIndexSet(q);
    correctAnswers.push({
      questionId: q._id,
      correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
      correctAnswers: correctSet,
      questionType: q.questionType || 'single_correct',
    });

    const ans = answerByQ.get(qid.toString());
    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const selectedSet = filterSelectedOptionIndexes(ans?.selectedOptionIndexes, optionsLen);

    const isCorrect = computeIsCorrect(correctSet, selectedSet);
    if (!isCorrect && selectedSet.length > 0 && q.topicId) {
      const tid = q.topicId.toString();
      topicMistakes.set(tid, (topicMistakes.get(tid) || 0) + 1);
    }
  }

  const weakTopics = [...topicMistakes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WEAK_TOPIC_LIMIT)
    .map(([topicIdStr, count]) => ({
      topicId: new mongoose.Types.ObjectId(topicIdStr),
      mistakeCount: count,
    }));

  const totalQ = (attempt.questionIds || []).length;
  const attemptedQs = (attempt.questionIds || []).filter((qid) => {
    const v = userAnswers[qid.toString()];
    return Array.isArray(v) && v.length > 0;
  }).length;

  const correctByQid = new Map(
    correctAnswers.map((c) => [String(c.questionId), c])
  );
  const { wrongQuestionIds, wrongQuestions, retrySkippedUnavailableCount } =
    computeRetryListsFromResult({
      questionsOrdered,
      userAnswersByQid: userAnswers,
      getCorrectSetForQuestion: (qid) => {
        const centry = correctByQid.get(qid);
        const arr = Array.isArray(centry?.correctAnswers) ? centry.correctAnswers : [];
        return arr.map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
      },
    });

  return {
    attemptId: String(attempt._id),
    attemptNumber: attempt.attemptNumber ?? null,
    testId: String(attempt.testId),
    testTitle,
    testAvailable,
    immutableAttemptSnapshot: false,
    score: attempt.score ?? 0,
    accuracy: attempt.accuracy ?? 0,
    timeTaken: attempt.timeTaken ?? 0,
    weakTopics,
    correctAnswers,
    questions: questionsOrdered,
    userAnswers,
    wrongQuestionIds,
    wrongQuestions,
    retrySkippedUnavailableCount,
    totalQuestions: totalQ,
    attemptedQuestions: attemptedQs,
    unansweredQuestions: Math.max(0, totalQ - attemptedQs),
    skippedQuestions: 0,
    markedForReviewCount: 0,
  };
}

function throwAlreadySubmittedConflict(recovery) {
  throw new AppError('Test already submitted', HTTP_STATUS.CONFLICT, null, {
    code: 'ATTEMPT_ALREADY_SUBMITTED',
    attemptId: String(recovery.attempt._id),
    resultAvailable: true,
    result: recovery,
  });
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

  /**
   * Persist in-progress answer selections for crash recovery (partial update).
   * Does not finalize scoring — submit() remains the only terminal path.
   */
  async saveProgress(userId, testId, rawAnswers) {
    const answers = normalizeAnswers(rawAnswers);
    if (!answers.length) {
      throw new AppError('answers must include at least one question', HTTP_STATUS.BAD_REQUEST);
    }

    const test = await testRepository.findById(testId);
    if (!test) {
      throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
    }

    const attempt = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
    if (!attempt) {
      throw new AppError('No active attempt — start the test first', HTTP_STATUS.NOT_FOUND);
    }

    const allowed = new Set(attempt.questionIds.map((id) => id.toString()));
    const seen = new Set();
    for (const a of answers) {
      const sid = a.questionId.toString();
      if (!allowed.has(sid)) {
        throw new AppError(
          'answers contain a questionId not in this attempt',
          HTTP_STATUS.BAD_REQUEST
        );
      }
      if (seen.has(sid)) {
        throw new AppError('Duplicate questionId in answers', HTTP_STATUS.BAD_REQUEST);
      }
      seen.add(sid);
    }

    const updated = await testAttemptRepository.mergeAnswersIntoOpenAttempt(
      userId,
      testId,
      answers
    );
    if (!updated) {
      throw new AppError('No active attempt — start the test first', HTTP_STATUS.NOT_FOUND);
    }

    return { attempt: updated };
  },

  async submit(userId, testId, rawAnswers) {
    const answers = normalizeAnswers(rawAnswers);
    const test = await testRepository.findById(testId);
    if (!test) {
      throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
    }

    const attempt = await testAttemptRepository.findInProgressByUserAndTest(userId, testId);
    if (!attempt) {
      const recovery = await buildRecoverPayloadForSubmitConflict(userId, testId);
      if (recovery) {
        throwAlreadySubmittedConflict(recovery);
      }
      throw new AppError('No active attempt — start the test first', HTTP_STATUS.NOT_FOUND);
    }

    if (attempt.userId.toString() !== String(userId)) {
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
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

    // Score against the question docs as they exist now, EVEN IF admin
    // soft-disabled them after this attempt started. The product rule is
    // "start freezes eligibility, submit does not": a student must never
    // lose a submit because of an admin action that happened mid-attempt.
    //
    // We deliberately do NOT use `findActiveByIds` here. That filter is the
    // correct source of truth for *new* test starts and for daily / weak /
    // smart practice (which keep using their existing helpers), so future
    // sessions continue to exclude disabled content. Only this in-progress
    // submit path is allowed to read inactive question docs.
    //
    // Subject / topic disable is automatically handled too: this path never
    // re-checks subject.isActive or topic.isActive — they're only consulted
    // at start time inside `testService.classifyQuestions`. So a disable on
    // any of (question, topic, subject) AFTER start no longer breaks submit.
    const questions = await questionRepository.findByIdsForScoring(attempt.questionIds);
    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    if (questions.length !== attempt.questionIds.length) {
      // Length mismatch can ONLY mean a question doc literally no longer
      // exists in Mongo — admin hard-delete is no longer exposed by the
      // API, so this is a defense-in-depth signal for legacy ops scripts
      // / database corruption. Active vs inactive does not enter the check.
      throw new AppError(
        'A question recorded on this attempt is missing from the database; cannot score',
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

    const resultSnapshot = buildResultSnapshotAtSubmit(
      attempt.questionIds,
      qMap,
      answerByQ,
      weakTopics
    );

    const updated = await testAttemptRepository.finalizeAttempt(attempt._id, userId, testId, {
      answers,
      endTime,
      score,
      accuracy,
      timeTaken,
      resultSnapshot,
    });

    if (!updated) {
      const recovery = await buildRecoverPayloadForSubmitConflict(userId, testId);
      if (recovery) {
        throwAlreadySubmittedConflict(recovery);
      }
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
   * Full Result/review payload for one completed attempt (Profile history).
   * Keyed only by attempt id — never inferred from testId alone.
   */
  async getResultViewByAttemptId(userId, attemptIdRaw) {
    const attemptId = String(attemptIdRaw ?? '').trim();
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      throw new AppError('Invalid attempt id', HTTP_STATUS.BAD_REQUEST);
    }

    const attempt = await testAttemptRepository.findById(attemptId);
    if (!attempt) {
      throw new AppError('Attempt not found', HTTP_STATUS.NOT_FOUND);
    }
    if (attempt.userId.toString() !== String(userId)) {
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }
    if (!attempt.endTime) {
      throw new AppError('Results are still being prepared.', HTTP_STATUS.BAD_REQUEST, null, {
        code: 'ATTEMPT_RESULTS_PENDING',
      });
    }

    return buildHistoricalResultViewPayload(attempt);
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
