import api from './api.js';
import { filterValidMongoIds, resolveMongoId } from '../utils/mongoId.js';

/**
 * Server-issued practice session ticket (proves question set for /practice/reveal).
 * @param {{ practiceType: string, questionIds: string[], sourceAttemptId?: string }} payload
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function issuePracticeSession(payload, opts = {}) {
  const { signal } = opts;
  const practiceType = String(payload?.practiceType || '').trim().toLowerCase();
  const questionIds = filterValidMongoIds(
    Array.isArray(payload?.questionIds) ? payload.questionIds : [],
    'questionIds'
  );
  if (!practiceType || questionIds.length === 0) {
    throw new Error('practiceType and questionIds are required to issue a practice session.');
  }
  const body = { practiceType, questionIds };
  if (practiceType === 'retry') {
    const sid = resolveMongoId(payload?.sourceAttemptId, 'sourceAttemptId');
    if (!sid) {
      throw new Error('sourceAttemptId is required for retry issuance.');
    }
    body.sourceAttemptId = sid;
  }
  const { data } = await api.post('/practice/issue', body, { signal });
  return data?.data ?? null;
}

/**
 * Keep only answers for questions in this session (prevents reveal 400 on stale keys).
 * @param {Record<string, unknown>} userAnswers
 * @param {string[]} questionIds
 */
export function pickUserAnswersForQuestions(userAnswers, questionIds) {
  const allowed = new Set(
    filterValidMongoIds(Array.isArray(questionIds) ? questionIds : [], 'questionIds')
  );
  const sanitized = sanitizeUserAnswersMap(userAnswers);
  const out = {};
  for (const qid of allowed) {
    if (Object.prototype.hasOwnProperty.call(sanitized, qid)) {
      out[qid] = sanitized[qid];
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} userAnswers
 * @returns {Record<string, number[]>}
 */
function sanitizeUserAnswersMap(userAnswers) {
  if (!userAnswers || typeof userAnswers !== 'object' || Array.isArray(userAnswers)) {
    return {};
  }
  const out = {};
  for (const [key, val] of Object.entries(userAnswers)) {
    const qid = resolveMongoId(key, 'questionId');
    if (!qid) continue;
    const list = Array.isArray(val) ? val : val != null && val !== '' ? [val] : [];
    const indexes = [];
    for (const v of list) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0) indexes.push(n);
    }
    out[qid] = Array.from(new Set(indexes)).sort((a, b) => a - b);
  }
  return out;
}

/**
 * Post-completion scoring + review reveal for practice-family sessions.
 * @param {{
 *   questionIds: string[],
 *   userAnswers: Record<string, number[] | number>,
 *   practiceType?: string,
 * }} payload
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function revealPractice(payload, opts = {}) {
  const { signal } = opts;
  const questionIds = filterValidMongoIds(
    Array.isArray(payload?.questionIds) ? payload.questionIds : [],
    'questionIds'
  );
  if (questionIds.length === 0) {
    throw new Error('No valid questions to score.');
  }

  if (!payload?.practiceSessionId || typeof payload.practiceSessionId !== 'string') {
    throw new Error('practiceSessionId is required to reveal a practice session.');
  }

  const userAnswers = sanitizeUserAnswersMap(payload?.userAnswers);
  const practiceType =
    typeof payload?.practiceType === 'string' && payload.practiceType.trim()
      ? payload.practiceType.trim()
      : 'practice';

  const body = {
    practiceSessionId: String(payload.practiceSessionId).trim(),
    questionIds,
    userAnswers,
    practiceType,
  };
  if (typeof payload?.clientSessionKey === 'string' && payload.clientSessionKey.trim()) {
    body.clientSessionKey = payload.clientSessionKey.trim().slice(0, 128);
  }
  if (payload?.retryMeta && typeof payload.retryMeta === 'object') {
    body.retryMeta = payload.retryMeta;
  }
  if (payload?.sourceAttemptId) {
    body.sourceAttemptId = String(payload.sourceAttemptId);
  }

  const { data } = await api.post('/practice/reveal', body, { signal });
  return data?.data ?? null;
}
