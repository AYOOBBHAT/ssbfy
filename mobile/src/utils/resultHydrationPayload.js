/**
 * P2: Canonical validator/normalizer for ResultScreen historical hydration payloads.
 * Single entry point — do not scatter integrity checks across ResultScreen.
 */

import logger from './logger';
import { resolveMongoId } from './mongoId';

/** Matches backend LEARNING_SESSION_SNAPSHOT_VERSION. */
export const SUPPORTED_LEARNING_SNAPSHOT_VERSION = 1;

export const HYDRATION_PAYLOAD_ERROR = {
  UNSUPPORTED: 'SESSION_SNAPSHOT_UNSUPPORTED',
  INVALID: 'SESSION_SNAPSHOT_INVALID',
  EMPTY: 'SESSION_SNAPSHOT_EMPTY',
};

/**
 * Error shape compatible with ResultScreen `getApiErrorCode()`.
 * @param {string} code
 * @param {string} [message]
 */
export function createHydrationPayloadError(code, message) {
  const msg = typeof message === 'string' && message.trim() ? message.trim() : code;
  const err = new Error(msg);
  err.response = { data: { code, message: msg } };
  return err;
}

function logHydration(event, extra = {}) {
  if (!__DEV__) return;
  logger.debug(`[Result/hydration-payload] ${event}`, extra);
}

function toIndexArray(raw) {
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

function questionDocId(q) {
  if (!q || typeof q !== 'object') return null;
  return resolveMongoId(q._id, 'questionId') || resolveMongoId(q.questionId, 'questionId');
}

function resolveSnapshotVersion(payload, rawApi) {
  const snap = rawApi?.snapshot;
  if (snap && typeof snap === 'object' && snap.version != null) {
    const v = Number(snap.version);
    return Number.isNaN(v) ? null : v;
  }
  if (payload?.snapshotVersion != null) {
    const v = Number(payload.snapshotVersion);
    return Number.isNaN(v) ? null : v;
  }
  return null;
}

function checkSnapshotVersion(version) {
  if (version == null || Number.isNaN(version)) return { ok: true };
  if (version === SUPPORTED_LEARNING_SNAPSHOT_VERSION) return { ok: true };
  return {
    ok: false,
    code: HYDRATION_PAYLOAD_ERROR.UNSUPPORTED,
    reason: `unsupported_snapshot_version_${version}`,
  };
}

/**
 * Legacy retry-only navigation params → canonical review shape.
 * @param {object} payload
 */
function normalizeLegacyRetryShape(payload) {
  const repairs = [];
  const isRetry = !!payload.retry;
  let questions = Array.isArray(payload.questions) ? [...payload.questions] : [];
  if (questions.length === 0 && isRetry && Array.isArray(payload.retryQuestions)) {
    questions = [...payload.retryQuestions];
    repairs.push('legacy_retryQuestions_promoted');
  }
  let userAnswers =
    payload.userAnswers && typeof payload.userAnswers === 'object'
      ? { ...payload.userAnswers }
      : {};
  if (
    Object.keys(userAnswers).length === 0 &&
    isRetry &&
    payload.retryAnswers &&
    typeof payload.retryAnswers === 'object'
  ) {
    userAnswers = { ...payload.retryAnswers };
    repairs.push('legacy_retryAnswers_promoted');
  }
  return {
    payload: { ...payload, questions, userAnswers },
    repairs,
  };
}

function sanitizeWeakTopics(weakTopics) {
  const repairs = [];
  if (!Array.isArray(weakTopics)) {
    return { weakTopics: [], repairs: ['weakTopics_missing'] };
  }
  const out = [];
  for (const w of weakTopics) {
    if (!w || typeof w !== 'object') continue;
    const topicId = w.topicId != null ? String(w.topicId).trim() : '';
    if (!topicId) continue;
    out.push({
      ...w,
      topicId,
      topicName: typeof w.topicName === 'string' ? w.topicName : '',
      canonicalTopicId: w.canonicalTopicId ?? w.topicId ?? null,
      mistakeCount: Math.max(1, Number(w.mistakeCount) || 1),
    });
  }
  if (out.length !== weakTopics.length) repairs.push('weakTopics_filtered');
  return { weakTopics: out, repairs };
}

function sanitizeQuestions(questions) {
  const repairs = [];
  const out = [];
  for (const q of questions) {
    if (!q || typeof q !== 'object') {
      repairs.push('question_dropped_invalid');
      continue;
    }
    const qid = questionDocId(q);
    if (!qid) {
      repairs.push('question_dropped_no_id');
      continue;
    }
    const options = Array.isArray(q.options)
      ? q.options.map((o) => (o != null ? String(o) : ''))
      : [];
    if (options.length === 0) {
      repairs.push('question_dropped_no_options');
      continue;
    }
    out.push({
      ...q,
      _id: q._id ?? qid,
      options,
      questionType: typeof q.questionType === 'string' ? q.questionType : 'single_correct',
    });
  }
  return { questions: out, repairs };
}

function correctIndexesFromEntry(entry, questionDoc) {
  if (entry && typeof entry === 'object') {
    const fromEntry = toIndexArray(
      Array.isArray(entry.correctAnswers) && entry.correctAnswers.length > 0
        ? entry.correctAnswers
        : entry.correctAnswerIndex
    );
    if (fromEntry.length > 0) return fromEntry;
  }
  if (questionDoc) {
    return toIndexArray(
      Array.isArray(questionDoc.correctAnswers) && questionDoc.correctAnswers.length > 0
        ? questionDoc.correctAnswers
        : questionDoc.correctAnswerIndex
    );
  }
  return [];
}

function sanitizeCorrectAnswers(correctAnswers, questions) {
  const repairs = [];
  const byQid = new Map();
  if (Array.isArray(correctAnswers)) {
    for (const c of correctAnswers) {
      if (!c || typeof c !== 'object') continue;
      const qid = resolveMongoId(c.questionId, 'questionId');
      if (!qid) continue;
      const indexes = toIndexArray(
        Array.isArray(c.correctAnswers) && c.correctAnswers.length > 0
          ? c.correctAnswers
          : c.correctAnswerIndex
      );
      if (indexes.length === 0) continue;
      byQid.set(qid, {
        questionId: qid,
        correctAnswers: indexes,
        correctAnswerIndex: indexes[0] ?? null,
        questionType: typeof c.questionType === 'string' ? c.questionType : 'single_correct',
      });
    }
  }

  const out = [];
  for (const q of questions) {
    const qid = questionDocId(q);
    if (!qid) continue;
    let entry = byQid.get(qid);
    const indexes = correctIndexesFromEntry(entry, q);
    if (indexes.length === 0) {
      repairs.push(`correctAnswers_missing_for_${qid}`);
      continue;
    }
    const maxIdx = q.options.length - 1;
    const filtered = indexes.filter((i) => i <= maxIdx);
    if (filtered.length === 0) {
      repairs.push(`correctAnswers_out_of_range_${qid}`);
      continue;
    }
    if (filtered.length !== indexes.length) repairs.push(`correctAnswers_clamped_${qid}`);
    entry = {
      questionId: qid,
      correctAnswers: filtered,
      correctAnswerIndex: filtered[0] ?? null,
      questionType: entry?.questionType || q.questionType || 'single_correct',
    };
    out.push(entry);
    byQid.set(qid, entry);
  }

  if (out.length !== questions.length) {
    repairs.push('correctAnswers_rebuilt_partial');
  } else if (!Array.isArray(correctAnswers) || correctAnswers.length !== out.length) {
    repairs.push('correctAnswers_rebuilt');
  }

  return { correctAnswers: out, repairs, missingCount: questions.length - out.length };
}

function sanitizeUserAnswers(userAnswers, questions) {
  const repairs = [];
  const optionLenByQid = new Map();
  const qidSet = new Set();
  for (const q of questions) {
    const qid = questionDocId(q);
    if (!qid) continue;
    qidSet.add(qid);
    optionLenByQid.set(qid, q.options.length);
  }

  const src =
    userAnswers && typeof userAnswers === 'object' ? userAnswers : {};
  const out = {};
  for (const [key, raw] of Object.entries(src)) {
    const qid = resolveMongoId(key, 'questionId') || String(key).trim();
    if (!qidSet.has(qid)) {
      repairs.push(`userAnswers_stripped_unknown_${qid}`);
      continue;
    }
    const maxIdx = (optionLenByQid.get(qid) ?? 0) - 1;
    const indexes = toIndexArray(raw).filter((i) => i <= maxIdx);
    if (indexes.length > 0) out[qid] = indexes;
    else if (toIndexArray(raw).length > 0) repairs.push(`userAnswers_clamped_${qid}`);
  }

  if (!userAnswers || typeof userAnswers !== 'object') repairs.push('userAnswers_missing');
  return { userAnswers: out, repairs };
}

function sanitizeSummary(summary, questionCount) {
  const repairs = [];
  const base =
    summary && typeof summary === 'object' ? { ...summary } : {};
  const totalQuestions = Math.max(
    0,
    Number(base.totalQuestions) || questionCount || 0
  );
  const score = Number(base.score);
  const accuracy = Number(base.accuracy);
  const out = {
    ...base,
    totalQuestions: totalQuestions || questionCount,
    score: Number.isFinite(score) ? score : 0,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    answeredQ: Math.max(0, Number(base.answeredQ) || 0),
    correct: Math.max(0, Number(base.correct) || 0),
    incorrect: Math.max(0, Number(base.incorrect) || 0),
    unanswered: Math.max(0, Number(base.unanswered) || 0),
  };
  if (!summary || typeof summary !== 'object') repairs.push('summary_missing');
  return { summary: out, repairs };
}

function sanitizeRetryMeta(retryMeta, isRetry) {
  if (!isRetry) {
    return { retryMeta: null, repairs: retryMeta != null ? ['retryMeta_stripped'] : [] };
  }
  if (!retryMeta || typeof retryMeta !== 'object') {
    return { retryMeta: null, repairs: [] };
  }
  const out = { ...retryMeta };
  const repairs = [];
  if (out.sourceAttemptId != null && !resolveMongoId(out.sourceAttemptId, 'sourceAttemptId')) {
    delete out.sourceAttemptId;
    repairs.push('retryMeta_sourceAttemptId_stripped');
  }
  return { retryMeta: out, repairs };
}

function sanitizeIdArrays(ids, label) {
  const repairs = [];
  if (!Array.isArray(ids)) return { values: [], repairs: [`${label}_missing`] };
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    const qid = resolveMongoId(id, label) || (typeof id === 'string' ? id.trim() : null);
    if (!qid || seen.has(qid)) continue;
    seen.add(qid);
    out.push(qid);
  }
  if (out.length !== ids.length) repairs.push(`${label}_filtered`);
  return { values: out, repairs };
}

/**
 * Validate and normalize a Result navigation / hydration payload.
 *
 * @param {object|null|undefined} rawPayload
 * @param {{ source?: string, rawApi?: object|null, requireTestId?: boolean }} [options]
 * @returns {{
 *   valid: boolean,
 *   normalizedPayload: object|null,
 *   errorReason?: string,
 *   recoverable?: boolean,
 *   errorCode?: string,
 *   repairs?: string[],
 * }}
 */
export function validateAndNormalizeHistoricalPayload(rawPayload, options = {}) {
  const source = options.source || 'unknown';
  const repairs = [];

  logHydration('validation start', { source });

  if (!rawPayload || typeof rawPayload !== 'object') {
    logHydration('validation failed', {
      source,
      errorReason: 'payload_missing',
      recoverable: false,
    });
    return {
      valid: false,
      normalizedPayload: null,
      errorReason: 'payload_missing',
      recoverable: false,
      errorCode: HYDRATION_PAYLOAD_ERROR.EMPTY,
      repairs,
    };
  }

  const snapshotVersion = resolveSnapshotVersion(rawPayload, options.rawApi);
  const versionGate = checkSnapshotVersion(snapshotVersion);
  if (!versionGate.ok) {
    logHydration('unsupported snapshot version', {
      source,
      snapshotVersion,
      errorReason: versionGate.reason,
    });
    return {
      valid: false,
      normalizedPayload: null,
      errorReason: versionGate.reason,
      recoverable: false,
      errorCode: versionGate.code,
      repairs,
    };
  }

  const legacy = normalizeLegacyRetryShape(rawPayload);
  repairs.push(...legacy.repairs);
  let payload = legacy.payload;

  const weak = sanitizeWeakTopics(payload.weakTopics);
  repairs.push(...weak.repairs);

  const qs = sanitizeQuestions(
    Array.isArray(payload.questions) ? payload.questions : []
  );
  repairs.push(...qs.repairs);

  const correct = sanitizeCorrectAnswers(payload.correctAnswers, qs.questions);
  repairs.push(...correct.repairs);

  const ua = sanitizeUserAnswers(payload.userAnswers, qs.questions);
  repairs.push(...ua.repairs);

  const summary = sanitizeSummary(payload.summary, qs.questions.length);
  repairs.push(...summary.repairs);

  const isRetry = !!payload.retry || payload.sessionType === 'retry';
  const retryMeta = sanitizeRetryMeta(payload.retryMeta, isRetry);
  repairs.push(...retryMeta.repairs);

  const wrongIds = sanitizeIdArrays(payload.wrongQuestionIds, 'wrongQuestionIds');
  repairs.push(...wrongIds.repairs);

  const requireTestId =
    options.requireTestId ?? source === 'attempt';
  if (requireTestId && !resolveMongoId(payload.testId, 'testId')) {
    logHydration('validation failed', {
      source,
      errorReason: 'attempt_testId_missing',
      recoverable: false,
    });
    return {
      valid: false,
      normalizedPayload: null,
      errorReason: 'attempt_testId_missing',
      recoverable: false,
      errorCode: HYDRATION_PAYLOAD_ERROR.INVALID,
      repairs,
    };
  }

  if (qs.questions.length === 0) {
    logHydration('validation failed', {
      source,
      errorReason: 'questions_empty',
      recoverable: false,
    });
    return {
      valid: false,
      normalizedPayload: null,
      errorReason: 'questions_empty',
      recoverable: false,
      errorCode: HYDRATION_PAYLOAD_ERROR.EMPTY,
      repairs,
    };
  }

  if (correct.missingCount > 0) {
    logHydration('validation failed', {
      source,
      errorReason: 'review_arrays_misaligned',
      missingCorrect: correct.missingCount,
      recoverable: false,
    });
    return {
      valid: false,
      normalizedPayload: null,
      errorReason: 'review_arrays_misaligned',
      recoverable: false,
      errorCode: HYDRATION_PAYLOAD_ERROR.INVALID,
      repairs,
    };
  }

  const normalizedPayload = {
    ...payload,
    questions: qs.questions,
    correctAnswers: correct.correctAnswers,
    userAnswers: ua.userAnswers,
    weakTopics: weak.weakTopics,
    summary: summary.summary,
    retryMeta: retryMeta.retryMeta,
    retry: isRetry,
    wrongQuestionIds: wrongIds.values,
    wrongQuestions: Array.isArray(payload.wrongQuestions)
      ? payload.wrongQuestions.filter((q) => questionDocId(q))
      : [],
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : summary.summary.score,
    accuracy: Number.isFinite(Number(payload.accuracy))
      ? Number(payload.accuracy)
      : summary.summary.accuracy,
    timeTaken: Math.max(0, Number(payload.timeTaken) || 0),
    totalQuestions:
      Math.max(0, Number(payload.totalQuestions) || 0) || qs.questions.length,
    attemptedQuestions: Math.max(0, Number(payload.attemptedQuestions) || 0),
    unansweredQuestions: Math.max(0, Number(payload.unansweredQuestions) || 0),
    skippedQuestions: Math.max(0, Number(payload.skippedQuestions) || 0),
    markedForReviewCount: Math.max(0, Number(payload.markedForReviewCount) || 0),
    retrySkippedUnavailableCount: Math.max(
      0,
      Number(payload.retrySkippedUnavailableCount) || 0
    ),
    immutableAttemptSnapshot: payload.immutableAttemptSnapshot === true,
    practiceRevealed: payload.practiceRevealed !== false,
  };

  const recoverable = repairs.length > 0;
  logHydration('validation ok', {
    source,
    recoverable,
    repairs,
    questionCount: qs.questions.length,
  });
  if (repairs.length > 0) {
    logHydration('repairs applied', { source, repairs });
  }

  return {
    valid: true,
    normalizedPayload,
    errorReason: null,
    recoverable,
    errorCode: null,
    repairs,
  };
}

/**
 * Last-line render guard for review params (historical / immutable paths).
 * @param {object} params
 * @param {{ source?: string }} [options]
 */
export function ensureRenderSafeReviewParams(params, options = {}) {
  const result = validateAndNormalizeHistoricalPayload(params, {
    source: options.source || 'review',
    requireTestId: false,
  });
  if (result.valid) {
    return { ...params, ...result.normalizedPayload };
  }
  logHydration('render-safe fallback', {
    source: options.source || 'review',
    errorReason: result.errorReason,
  });
  return {
    ...params,
    questions: [],
    correctAnswers: [],
    userAnswers: {},
    weakTopics: [],
    summary: params?.summary && typeof params.summary === 'object' ? params.summary : null,
  };
}
