import api from './api.js';
import {
  filterValidMongoIds,
  joinValidMongoIds,
  resolveMongoId,
  sanitizeSmartPracticeBody,
  sanitizeTestAnswers,
} from '../utils/mongoId.js';
import { getDeviceId } from '../utils/deviceId.js';
import { getActiveCacheUserId } from '../utils/authScopedCache.js';
import { focusRefetchDevLog } from '../utils/focusRefetchDevLog.js';
import { getCacheAgeMs, isCacheFresh } from '../utils/requestFreshness.js';

export const MOCK_QUOTA_STALE_AFTER_MS = 60 * 1000;
export const MY_TEST_STATUS_STALE_AFTER_MS = 90 * 1000;

let mockQuotaCache = null;
let mockQuotaInFlight = null;
let myTestStatusCache = null;
let myTestStatusInFlight = null;

function activeScopeKey() {
  return getActiveCacheUserId() || 'anon';
}

function getScopedCache(entry) {
  if (entry?.scopeKey !== activeScopeKey()) return null;
  return entry;
}

function buildMyTestStatusValue(payload) {
  return {
    status: payload?.status && typeof payload.status === 'object' ? payload.status : {},
  };
}

function setMockQuotaCacheEntry(value, fetchedAt = Date.now()) {
  mockQuotaCache = {
    scopeKey: activeScopeKey(),
    fetchedAt,
    value: value && typeof value === 'object' ? value : {},
  };
  return mockQuotaCache;
}

function setMyTestStatusCacheEntry(value, fetchedAt = Date.now()) {
  myTestStatusCache = {
    scopeKey: activeScopeKey(),
    fetchedAt,
    value: buildMyTestStatusValue(value),
  };
  return myTestStatusCache;
}

function ensureMockQuotaFetch(reason = 'refresh') {
  const scopeKey = activeScopeKey();
  if (mockQuotaInFlight?.scopeKey === scopeKey) {
    focusRefetchDevLog('mock_quota_dedupe_reuse', { reason });
    return mockQuotaInFlight.promise;
  }
  const promise = (async () => {
    try {
      focusRefetchDevLog('mock_quota_refresh_start', { reason });
      const deviceId = await getDeviceId();
      const { data } = await api.get('/tests/quota/device', {
        params: { deviceId },
      });
      const entry = setMockQuotaCacheEntry(data?.data ?? {});
      focusRefetchDevLog('mock_quota_refresh_ok', {
        ageMs: getCacheAgeMs(entry.fetchedAt),
        remaining: entry.value?.remaining ?? null,
        exhausted: !!entry.value?.exhausted,
      });
      return entry.value;
    } finally {
      if (mockQuotaInFlight?.scopeKey === scopeKey) {
        mockQuotaInFlight = null;
      }
    }
  })();
  mockQuotaInFlight = { scopeKey, promise };
  return promise;
}

function ensureMyTestStatusFetch(reason = 'refresh') {
  const scopeKey = activeScopeKey();
  if (myTestStatusInFlight?.scopeKey === scopeKey) {
    focusRefetchDevLog('test_status_dedupe_reuse', { reason });
    return myTestStatusInFlight.promise;
  }
  const promise = (async () => {
    try {
      focusRefetchDevLog('test_status_refresh_start', { reason });
      const { data } = await api.get('/tests/status/mine');
      const entry = setMyTestStatusCacheEntry(data?.data ?? {});
      focusRefetchDevLog('test_status_refresh_ok', {
        ageMs: getCacheAgeMs(entry.fetchedAt),
        count: Object.keys(entry.value.status || {}).length,
      });
      return entry.value;
    } finally {
      if (myTestStatusInFlight?.scopeKey === scopeKey) {
        myTestStatusInFlight = null;
      }
    }
  })();
  myTestStatusInFlight = { scopeKey, promise };
  return promise;
}

export function getCachedMockQuotaSnapshot() {
  return getScopedCache(mockQuotaCache)?.value ?? null;
}

export function isMockQuotaSnapshotFresh(staleAfterMs = MOCK_QUOTA_STALE_AFTER_MS) {
  const entry = getScopedCache(mockQuotaCache);
  return Boolean(entry && isCacheFresh(entry.fetchedAt, staleAfterMs));
}

export function invalidateMockQuotaCache(reason = 'manual') {
  mockQuotaCache = null;
  focusRefetchDevLog('mock_quota_invalidate', { reason });
}

export function getCachedMyTestStatusSnapshot() {
  return getScopedCache(myTestStatusCache)?.value ?? null;
}

export function isMyTestStatusSnapshotFresh(
  staleAfterMs = MY_TEST_STATUS_STALE_AFTER_MS
) {
  const entry = getScopedCache(myTestStatusCache);
  return Boolean(entry && isCacheFresh(entry.fetchedAt, staleAfterMs));
}

export function invalidateMyTestStatusCache(reason = 'manual') {
  myTestStatusCache = null;
  focusRefetchDevLog('test_status_invalidate', { reason });
}

/** @returns {Promise<{ tests: object[] }>} */
export async function getTests(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/tests', { signal });
  return data?.data ?? { tests: [] };
}

/** @returns {Promise<{ attempt: object, resumed: boolean }>} */
export async function startTest(testId, opts = {}) {
  const id = resolveMongoId(testId, 'testId');
  if (!id) return {};
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const { data } = await api.post(`/tests/${id}/start`, { deviceId }, { signal });
  invalidateMockQuotaCache('start_test');
  invalidateMyTestStatusCache('start_test');
  return data?.data ?? {};
}

/**
 * @param {string} testId
 * @param {{ questionId: string, selectedOptionIndex: number }[]} answers
 * @returns {Promise<object>} API `data` payload (score, accuracy, timeTaken, weakTopics, correctAnswers, attempt, …)
 */
export async function submitTest(testId, answers, opts = {}) {
  const id = resolveMongoId(testId, 'testId');
  if (!id) return {};
  const { signal } = opts;
  const payload = sanitizeTestAnswers(answers);
  const { data } = await api.post(`/tests/${id}/submit`, { answers: payload }, { signal });
  invalidateMyTestStatusCache('submit_test');
  return data?.data ?? {};
}

/**
 * Autosave in-progress answers (partial array allowed). Sends deviceId for free-tier access checks.
 * @param {string} testId
 * @param {Array<{ questionId: string, selectedOptionIndexes?: number[], selectedOptionIndex?: number|null }>} answers
 */
export async function saveTestProgress(testId, answers, opts = {}) {
  const id = resolveMongoId(testId, 'testId');
  if (!id) return {};
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const payload = sanitizeTestAnswers(answers);
  const { data } = await api.patch(`/tests/${id}/progress`, { answers: payload, deviceId }, { signal });
  return data?.data ?? {};
}

/** @returns {Promise<{ attempts: object[] }>} */
export async function getTestAttempts(testId, opts = {}) {
  const id = resolveMongoId(testId, 'testId');
  if (!id) return { attempts: [] };
  const { signal } = opts;
  const { data } = await api.get(`/tests/${id}/attempts`, { signal });
  return data?.data ?? { attempts: [] };
}

/** @returns {Promise<{ status: Record<string, {hasOpenAttempt:boolean, hasCompletedAttempt:boolean, canRetry:boolean}> }>} */
export async function getMyTestStatus(opts = {}) {
  const {
    force = false,
    staleAfterMs = MY_TEST_STATUS_STALE_AFTER_MS,
    reason = 'read',
  } = opts;
  const entry = getScopedCache(myTestStatusCache);
  if (!force && entry && isCacheFresh(entry.fetchedAt, staleAfterMs)) {
    focusRefetchDevLog('test_status_skip_fresh', {
      reason,
      ageMs: getCacheAgeMs(entry.fetchedAt),
    });
    return entry.value;
  }
  return ensureMyTestStatusFetch(force ? `${reason}:force` : reason);
}

/**
 * Read-only free mock quota for this device (does not consume slots).
 * @returns {Promise<{ unlimited?: boolean, limit?: number, used?: number, remaining?: number, exhausted?: boolean }>}
 */
export async function getMockQuota(opts = {}) {
  const {
    force = false,
    staleAfterMs = MOCK_QUOTA_STALE_AFTER_MS,
    reason = 'read',
  } = opts;
  const entry = getScopedCache(mockQuotaCache);
  if (!force && entry && isCacheFresh(entry.fetchedAt, staleAfterMs)) {
    focusRefetchDevLog('mock_quota_skip_fresh', {
      reason,
      ageMs: getCacheAgeMs(entry.fetchedAt),
    });
    return entry.value;
  }
  return ensureMockQuotaFetch(force ? `${reason}:force` : reason);
}

/**
 * @param {string} topicId
 * @param {{ limit?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ questions: object[], total: number, limit: number, skip: number }>}
 */
export async function getQuestionsByTopic(topicId, opts = {}) {
  const id = resolveMongoId(topicId, 'topicId');
  if (!id) {
    return { questions: [], total: 0, limit: 0, skip: 0 };
  }
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 10;
  const { signal } = opts;
  const { data } = await api.get('/questions', {
    params: { topicId: id, limit },
    signal,
  });
  return data?.data ?? { questions: [] };
}

/**
 * Fetch questions by id list (CSV). Used by TestScreen when questions are not preloaded.
 * @param {string[]} ids
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function getQuestionsByIds(ids, opts = {}) {
  const { signal } = opts;
  const list = filterValidMongoIds(Array.isArray(ids) ? ids : [], 'questionIds');
  if (list.length === 0) {
    return { questions: [] };
  }
  const { data } = await api.get('/questions', {
    params: { ids: joinValidMongoIds(list, 'questionIds') },
    signal,
  });
  return data?.data ?? { questions: [] };
}

/**
 * @param {{ postId?: string, subjectId?: string, topicId?: string, difficulty?: string, limit?: number }} body
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ questions: object[] }>}
 */
export async function postSmartPractice(body, opts = {}) {
  const { signal } = opts;
  const payload = sanitizeSmartPracticeBody(body);
  const { data } = await api.post('/questions/smart-practice', payload, { signal });
  return data?.data ?? {};
}

export async function getWeakPractice(topicIds, opts = {}) {
  const ids = filterValidMongoIds(Array.isArray(topicIds) ? topicIds : [], 'topicIds');
  if (ids.length === 0) {
    return { questions: [] };
  }
  const limit =
    Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 10;
  const { signal } = opts;
  const { data } = await api.get('/questions/weak-practice', {
    params: { topicIds: ids.join(','), limit },
    signal,
  });
  return data?.data ?? {};
}
