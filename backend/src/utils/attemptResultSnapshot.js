import mongoose from 'mongoose';

export const WEAK_TOPIC_LIMIT = 10;

export function getCorrectIndexSet(q) {
  if (Array.isArray(q?.correctAnswers) && q.correctAnswers.length > 0) {
    return Array.from(new Set(q.correctAnswers.map(Number))).sort((a, b) => a - b);
  }
  if (typeof q?.correctAnswerIndex === 'number' && Number.isInteger(q.correctAnswerIndex)) {
    return [q.correctAnswerIndex];
  }
  return [];
}

export function indexSetsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Clamp user selections to valid option indexes for a question. */
export function filterSelectedOptionIndexes(selectedOptionIndexes, optionsLen) {
  const maxIdx = Math.max(0, Number(optionsLen) || 0) - 1;
  return (Array.isArray(selectedOptionIndexes) ? selectedOptionIndexes : []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i <= maxIdx
  );
}

export function computeIsCorrect(correctSet, selectedSet) {
  return (
    Array.isArray(correctSet) &&
    correctSet.length > 0 &&
    indexSetsEqual(selectedSet, correctSet)
  );
}

/**
 * Retry selection only — does NOT affect score, accuracy, or weak-topic analytics.
 * Retry-worthy = not mastered: unanswered/skipped OR answered incorrectly.
 */
export function isRetryWorthyQuestion({ isCorrect, selectedOptionIndexes }) {
  const selected = Array.isArray(selectedOptionIndexes) ? selectedOptionIndexes : [];
  if (selected.length === 0) return true;
  return isCorrect !== true;
}

export function isQuestionDocRetryable(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  return opts.length > 0;
}

/**
 * Ordered retry lists in question display order (attempt.questionIds order).
 */
export function computeRetryListsFromResult({
  questionsOrdered,
  userAnswersByQid = {},
  getCorrectSetForQuestion,
}) {
  const wrongQuestionIds = [];
  const wrongQuestions = [];
  let retrySkippedUnavailableCount = 0;

  for (const q of questionsOrdered) {
    const qid = String(q?._id ?? '');
    if (!qid) continue;

    const userArr = filterSelectedOptionIndexes(
      userAnswersByQid[qid],
      Array.isArray(q.options) ? q.options.length : 0
    );
    const correctArr =
      typeof getCorrectSetForQuestion === 'function'
        ? getCorrectSetForQuestion(qid, q)
        : [];
    const isCorrect = computeIsCorrect(correctArr, userArr);

    if (!isRetryWorthyQuestion({ isCorrect, selectedOptionIndexes: userArr })) {
      continue;
    }

    wrongQuestionIds.push(qid);
    if (isQuestionDocRetryable(q)) {
      wrongQuestions.push(q);
    } else {
      retrySkippedUnavailableCount += 1;
    }
  }

  return { wrongQuestionIds, wrongQuestions, retrySkippedUnavailableCount };
}

export function hasImmutableSnapshot(attempt) {
  return (
    attempt?.resultSnapshot?.version === 1 &&
    Array.isArray(attempt.resultSnapshot.items) &&
    attempt.resultSnapshot.items.length > 0
  );
}

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

export function normalizeAnswers(answers) {
  if (!Array.isArray(answers)) return [];
  return answers.map(normalizeOneAnswer);
}

/**
 * Immutable evaluation snapshot for one attempt (submit + backfill).
 * Does not modify score/accuracy/timeTaken on the attempt document.
 */
export function buildResultSnapshotAtSubmit(attemptQuestionIds, qMap, answerByQ, weakTopics) {
  const items = [];
  const wrongQuestionIds = [];

  for (const qid of attemptQuestionIds) {
    const q = qMap.get(qid.toString());
    if (!q) continue;

    const ans = answerByQ.get(qid.toString());
    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const selectedSet = filterSelectedOptionIndexes(ans?.selectedOptionIndexes, optionsLen);
    const correctSet = getCorrectIndexSet(q);
    const isCorrect = computeIsCorrect(correctSet, selectedSet);

    if (isRetryWorthyQuestion({ isCorrect, selectedOptionIndexes: selectedSet })) {
      wrongQuestionIds.push(q._id);
    }

    items.push({
      questionId: q._id,
      questionText: q.questionText ?? '',
      options: Array.isArray(q.options) ? [...q.options] : [],
      questionType: q.questionType || 'single_correct',
      questionImage: q.questionImage ?? '',
      explanation: q.explanation ?? '',
      topicId: q.topicId ?? null,
      subjectId: q.subjectId ?? null,
      postIds: Array.isArray(q.postIds) ? [...q.postIds] : [],
      correctAnswers: correctSet,
      correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
      selectedOptionIndexes: selectedSet,
      isCorrect,
    });
  }

  return {
    version: 1,
    items,
    weakTopics: (Array.isArray(weakTopics) ? weakTopics : []).map((w) => ({
      topicId: w.topicId,
      mistakeCount: w.mistakeCount ?? 1,
    })),
    wrongQuestionIds,
  };
}

function placeholderSnapshotItem(qid, ans) {
  const selectedSet = Array.isArray(ans?.selectedOptionIndexes) ? [...ans.selectedOptionIndexes] : [];
  return {
    questionId: qid,
    questionText: 'This question is no longer available.',
    options: [],
    questionType: 'single_correct',
    questionImage: '',
    explanation: '',
    topicId: null,
    subjectId: null,
    postIds: [],
    correctAnswers: [],
    correctAnswerIndex: null,
    selectedOptionIndexes: selectedSet,
    isCorrect: false,
  };
}

/**
 * Backfill-oriented snapshot builder: preserves attempt order, includes
 * placeholders for deleted questions, computes weakTopics from frozen rows.
 */
export function buildResultSnapshotForBackfill(attemptQuestionIds, qMap, answerByQ) {
  const items = [];
  const wrongQuestionIds = [];
  const topicMistakes = new Map();
  let resolvedQuestionCount = 0;

  for (const qid of attemptQuestionIds) {
    const sid = qid.toString();
    const ans = answerByQ.get(sid);
    const q = qMap.get(sid);

    if (!q) {
      items.push(placeholderSnapshotItem(qid, ans));
      const selectedSet = filterSelectedOptionIndexes(ans?.selectedOptionIndexes, 0);
      if (isRetryWorthyQuestion({ isCorrect: false, selectedOptionIndexes: selectedSet })) {
        wrongQuestionIds.push(qid);
      }
      continue;
    }

    resolvedQuestionCount += 1;
    const optionsLen = Array.isArray(q.options) ? q.options.length : 0;
    const selectedSet = filterSelectedOptionIndexes(ans?.selectedOptionIndexes, optionsLen);
    const correctSet = getCorrectIndexSet(q);
    const isCorrect = computeIsCorrect(correctSet, selectedSet);

    if (isRetryWorthyQuestion({ isCorrect, selectedOptionIndexes: selectedSet })) {
      wrongQuestionIds.push(q._id);
    }
    if (!isCorrect && selectedSet.length > 0 && q.topicId) {
      const tid = q.topicId.toString();
      topicMistakes.set(tid, (topicMistakes.get(tid) || 0) + 1);
    }

    items.push({
      questionId: q._id,
      questionText: q.questionText ?? '',
      options: Array.isArray(q.options) ? [...q.options] : [],
      questionType: q.questionType || 'single_correct',
      questionImage: q.questionImage ?? '',
      explanation: q.explanation ?? '',
      topicId: q.topicId ?? null,
      subjectId: q.subjectId ?? null,
      postIds: Array.isArray(q.postIds) ? [...q.postIds] : [],
      correctAnswers: correctSet,
      correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
      selectedOptionIndexes: selectedSet,
      isCorrect,
    });
  }

  const weakTopics = [...topicMistakes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WEAK_TOPIC_LIMIT)
    .map(([topicIdStr, count]) => ({
      topicId: new mongoose.Types.ObjectId(topicIdStr),
      mistakeCount: count,
    }));

  return {
    snapshot: {
      version: 1,
      items,
      weakTopics,
      wrongQuestionIds,
    },
    resolvedQuestionCount,
    missingQuestionCount: attemptQuestionIds.length - resolvedQuestionCount,
  };
}

/**
 * Conservative preflight for backfill eligibility (does not throw).
 */
export function validateAttemptShapeForBackfill(attempt) {
  if (!attempt?.endTime) {
    return { ok: false, reason: 'incomplete' };
  }
  if (hasImmutableSnapshot(attempt)) {
    return { ok: false, reason: 'existing_snapshot' };
  }
  if (!Array.isArray(attempt.questionIds) || attempt.questionIds.length === 0) {
    return { ok: false, reason: 'malformed_questionIds' };
  }
  for (const qid of attempt.questionIds) {
    if (!mongoose.Types.ObjectId.isValid(String(qid))) {
      return { ok: false, reason: 'malformed_questionIds' };
    }
  }
  if (!Array.isArray(attempt.answers)) {
    return { ok: false, reason: 'malformed_answers' };
  }
  for (const a of attempt.answers) {
    if (!a?.questionId || !mongoose.Types.ObjectId.isValid(String(a.questionId))) {
      return { ok: false, reason: 'malformed_answers' };
    }
  }
  return { ok: true };
}

/** Mongo filter: completed attempts missing a usable immutable snapshot. */
export function missingSnapshotFilter() {
  return {
    endTime: { $ne: null },
    $or: [
      { resultSnapshot: null },
      { resultSnapshot: { $exists: false } },
      { 'resultSnapshot.version': { $ne: 1 } },
      { 'resultSnapshot.items.0': { $exists: false } },
    ],
  };
}

/** Conditional update filter — never overwrite an existing snapshot. */
export function missingSnapshotUpdateFilter(attemptId) {
  return {
    _id: attemptId,
    ...missingSnapshotFilter(),
  };
}
