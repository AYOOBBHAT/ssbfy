/**
 * Canonical Result / Review navigation payload after backend scoring (mock submit,
 * practice reveal, retry reveal).
 */

/**
 * @param {object} revealPayload — `/practice/reveal` or mock-submit-shaped data
 * @param {Record<string, number[]>} userAnswers
 * @param {object} [extras]
 */
export function buildResultParamsFromReveal(revealPayload, userAnswers, extras = {}) {
  const summary =
    revealPayload?.summary && typeof revealPayload.summary === 'object'
      ? revealPayload.summary
      : {};

  const reviewQuestions = Array.isArray(revealPayload?.reviewQuestions)
    ? revealPayload.reviewQuestions
    : Array.isArray(revealPayload?.questions)
    ? revealPayload.questions
    : [];

  const correctAnswers = Array.isArray(revealPayload?.correctAnswers)
    ? revealPayload.correctAnswers
    : [];

  const weakTopics = Array.isArray(revealPayload?.weakTopics) ? revealPayload.weakTopics : [];

  const learningSessionId =
    revealPayload?.learningSessionId != null
      ? String(revealPayload.learningSessionId)
      : extras.learningSessionId != null
      ? String(extras.learningSessionId)
      : null;

  return {
    score: Number(summary.score) || 0,
    accuracy: Number(summary.accuracy) || 0,
    timeTaken: Number(extras.timeTaken) || 0,
    weakTopics,
    totalQuestions: Number(summary.totalQuestions) || reviewQuestions.length,
    attemptedQuestions: Number(summary.answeredQ) || 0,
    unansweredQuestions: Number(summary.unanswered) || 0,
    questions: reviewQuestions,
    userAnswers: userAnswers && typeof userAnswers === 'object' ? userAnswers : {},
    correctAnswers,
    summary,
    practiceRevealed: extras.practiceRevealed !== false,
    immutableAttemptSnapshot: revealPayload?.immutableAttemptSnapshot === true,
    learningSessionId,
    sessionType:
      extras.sessionType ||
      revealPayload?.practiceType ||
      revealPayload?.sessionType ||
      null,
    ...extras,
  };
}

/**
 * Normalize legacy retry-only params into canonical review shape.
 * @param {object} params
 */
export function normalizeResultReviewParams(params = {}) {
  if (!params || typeof params !== 'object') {
    return {
      questions: [],
      userAnswers: {},
      correctAnswers: [],
      summary: null,
      retry: false,
    };
  }

  const isRetry = !!params.retry;
  const questions =
    Array.isArray(params.questions) && params.questions.length > 0
      ? params.questions
      : isRetry && Array.isArray(params.retryQuestions)
      ? params.retryQuestions
      : [];

  const userAnswers =
    params.userAnswers && typeof params.userAnswers === 'object' && Object.keys(params.userAnswers).length > 0
      ? params.userAnswers
      : isRetry && params.retryAnswers && typeof params.retryAnswers === 'object'
      ? params.retryAnswers
      : {};

  const correctAnswers = Array.isArray(params.correctAnswers) ? params.correctAnswers : [];

  const summary =
    params.summary && typeof params.summary === 'object' ? params.summary : null;

  return {
    ...params,
    questions,
    userAnswers,
    correctAnswers,
    summary,
    retry: isRetry,
  };
}

/**
 * @param {object | null} summary
 * @param {boolean} isRetry
 */
export function buildRetryStatsFromSummary(summary, isRetry) {
  if (!isRetry || !summary || typeof summary !== 'object') return null;
  const total = Number(summary.totalQuestions) || 0;
  const correct = Number(summary.correct) || 0;
  const accuracyPct = Number(summary.accuracy) || 0;
  return { correct, total, accuracyPct };
}
