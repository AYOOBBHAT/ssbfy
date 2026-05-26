import logger from './logger';

const QUESTION_CACHE_LIMIT = 12;
const questionSnapshotCache = new Map();

function normalizeKey(value) {
  if (value == null) return null;
  const key = String(value).trim();
  return key.length > 0 ? key : null;
}

function collectArraySummary(payload, prefix = '', out = []) {
  if (!payload || typeof payload !== 'object') return out;
  for (const [key, value] of Object.entries(payload)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      out.push({ key: nextKey, count: value.length });
      continue;
    }
    if (value && typeof value === 'object' && prefix === '') {
      collectArraySummary(value, nextKey, out);
    }
  }
  return out;
}

export function estimateNavigationPayloadBytes(payload) {
  try {
    const serialized = JSON.stringify(payload ?? null);
    return typeof serialized === 'string' ? serialized.length : 0;
  } catch {
    return 0;
  }
}

export function logNavigationPayload(routeName, payload, options = {}) {
  const {
    includeDebug = false,
    source = 'nav',
    thresholdBytes = 45000,
    ...rest
  } = options;
  const bytes = estimateNavigationPayloadBytes(payload);
  if (!__DEV__) return bytes;

  const detail = {
    routeName,
    source,
    bytes,
    arrays: collectArraySummary(payload)
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    ...rest,
  };

  if (bytes >= thresholdBytes) {
    logger.warn('[nav-payload] large', detail);
  } else if (includeDebug) {
    logger.debug('[nav-payload]', detail);
  }
  return bytes;
}

function pruneQuestionSnapshotCache() {
  while (questionSnapshotCache.size > QUESTION_CACHE_LIMIT) {
    const oldestKey = questionSnapshotCache.keys().next().value;
    if (!oldestKey) return;
    questionSnapshotCache.delete(oldestKey);
  }
}

export function storeSessionQuestionSnapshot(sessionId, questions, options = {}) {
  const key = normalizeKey(sessionId);
  if (!key) return;
  if (!Array.isArray(questions) || questions.length === 0) return;
  questionSnapshotCache.delete(key);
  questionSnapshotCache.set(key, {
    questions,
    storedAt: Date.now(),
  });
  pruneQuestionSnapshotCache();
  logNavigationPayload(
    'TestQuestionSnapshot',
    { questions },
    {
      includeDebug: true,
      thresholdBytes: 90000,
      source: options.source || 'session_snapshot',
      sessionIdSuffix: key.slice(-8),
      questionCount: questions.length,
    }
  );
}

export function getSessionQuestionSnapshot(sessionId) {
  const key = normalizeKey(sessionId);
  if (!key) return null;
  const entry = questionSnapshotCache.get(key);
  if (!entry) return null;
  questionSnapshotCache.delete(key);
  questionSnapshotCache.set(key, entry);
  return Array.isArray(entry.questions) ? entry.questions : null;
}

export function clearSessionQuestionSnapshot(sessionId) {
  const key = normalizeKey(sessionId);
  if (!key) return;
  questionSnapshotCache.delete(key);
}

export function buildMockAttemptNavSnapshot(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  return {
    _id: attempt._id ?? null,
    questionIds: Array.isArray(attempt.questionIds) ? attempt.questionIds : [],
    answers: Array.isArray(attempt.answers) ? attempt.answers : [],
    startTime: attempt.startTime ?? null,
  };
}
