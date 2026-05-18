import api from './api.js';
import {
  filterValidMongoIds,
  joinValidMongoIds,
  resolveMongoId,
  sanitizeSmartPracticeBody,
  sanitizeTestAnswers,
} from '../utils/mongoId.js';
import { getDeviceId } from '../utils/deviceId.js';

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
  const { signal } = opts;
  const { data } = await api.get('/tests/status/mine', { signal });
  return data?.data ?? { status: {} };
}

/**
 * Read-only free mock quota for this device (does not consume slots).
 * @returns {Promise<{ unlimited?: boolean, limit?: number, used?: number, remaining?: number, exhausted?: boolean }>}
 */
export async function getMockQuota(opts = {}) {
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const { data } = await api.get('/tests/quota/device', {
    params: { deviceId },
    signal,
  });
  return data?.data ?? {};
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
  return data?.data ?? { questions: [] };
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
  return data?.data ?? { questions: [] };
}
