/**
 * Retry selection helpers (client). Must stay aligned with
 * backend/src/utils/attemptResultSnapshot.js — scoring is unchanged.
 */

export function toIndexArray(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const v of list) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

export function indexSetsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

export function filterSelectedOptionIndexes(selectedOptionIndexes, optionsLen) {
  const maxIdx = Math.max(0, Number(optionsLen) || 0) - 1;
  return toIndexArray(selectedOptionIndexes).filter((i) => i <= maxIdx);
}

export function computeIsCorrect(correctSet, selectedSet) {
  return (
    Array.isArray(correctSet) &&
    correctSet.length > 0 &&
    indexSetsEqual(selectedSet, correctSet)
  );
}

/**
 * Retry-worthy = not mastered (unanswered/skipped OR incorrect). Does not affect score.
 */
export function isRetryWorthyQuestion({ isCorrect, selectedOptionIndexes }) {
  const selected = toIndexArray(selectedOptionIndexes);
  if (selected.length === 0) return true;
  return isCorrect !== true;
}

export function isQuestionDocRetryable(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  return opts.length > 0;
}

/**
 * Build ordered retry question lists for Result → Test retry navigation.
 */
export function computeRetryListsFromResult({
  questionsOrdered,
  userAnswers = {},
  getCorrectSetFor,
}) {
  const wrongQuestionIds = [];
  const wrongQuestions = [];
  let retrySkippedUnavailableCount = 0;

  for (const q of questionsOrdered) {
    const qid = String(q?._id ?? '');
    if (!qid) continue;

    const optionsLen = Array.isArray(q?.options) ? q.options.length : 0;
    const userArr = filterSelectedOptionIndexes(userAnswers[qid], optionsLen);
    const correctArr =
      typeof getCorrectSetFor === 'function' ? getCorrectSetFor(qid, q) : [];
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
