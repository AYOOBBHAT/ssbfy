import api from './api.js';
import { getDeviceId } from '../utils/deviceId.js';

/** @returns {Promise<{ tests: object[] }>} */
export async function getTests(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/tests', { signal });
  return data?.data ?? { tests: [] };
}

/** @returns {Promise<{ attempt: object, resumed: boolean }>} */
export async function startTest(testId, opts = {}) {
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const { data } = await api.post(`/tests/${testId}/start`, { deviceId }, { signal });
  return data?.data ?? {};
}

/**
 * @param {string} testId
 * @param {{ questionId: string, selectedOptionIndex: number }[]} answers
 * @returns {Promise<object>} API `data` payload (score, accuracy, timeTaken, weakTopics, correctAnswers, attempt, …)
 */
export async function submitTest(testId, answers, opts = {}) {
  const { signal } = opts;
  const { data } = await api.post(`/tests/${testId}/submit`, { answers }, { signal });
  return data?.data ?? {};
}

/**
 * Autosave in-progress answers (partial array allowed). Sends deviceId for free-tier access checks.
 * @param {string} testId
 * @param {Array<{ questionId: string, selectedOptionIndexes?: number[], selectedOptionIndex?: number|null }>} answers
 */
export async function saveTestProgress(testId, answers, opts = {}) {
  const { signal } = opts;
  const deviceId = await getDeviceId();
  const { data } = await api.patch(`/tests/${testId}/progress`, { answers, deviceId }, { signal });
  return data?.data ?? {};
}

/** @returns {Promise<{ attempts: object[] }>} */
export async function getTestAttempts(testId, opts = {}) {
  const { signal } = opts;
  const { data } = await api.get(`/tests/${testId}/attempts`, { signal });
  return data?.data ?? { attempts: [] };
}

/** @returns {Promise<{ status: Record<string, {hasOpenAttempt:boolean, hasCompletedAttempt:boolean, canRetry:boolean}> }>} */
export async function getMyTestStatus(opts = {}) {
  const { signal } = opts;
  const { data } = await api.get('/tests/status/mine', { signal });
  return data?.data ?? { status: {} };
}

/**
 * @param {string} topicId
 * @param {{ limit?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ questions: object[], total: number, limit: number, skip: number }>}
 */
export async function getQuestionsByTopic(topicId, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 10;
  const { signal } = opts;
  const { data } = await api.get('/questions', {
    params: { topicId, limit },
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
  const list = Array.isArray(ids) ? ids.map((id) => String(id).trim()).filter(Boolean) : [];
  if (list.length === 0) {
    return { questions: [] };
  }
  const idsParam = list.join(',');
  const { data } = await api.get('/questions', { params: { ids: idsParam }, signal });
  return data?.data ?? { questions: [] };
}

/**
 * @param {{ postId?: string, subjectId?: string, topicId?: string, difficulty?: string, limit?: number }} body
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ questions: object[] }>}
 */
export async function postSmartPractice(body, opts = {}) {
  const { signal } = opts;
  const { data } = await api.post('/questions/smart-practice', body, { signal });
  return data?.data ?? { questions: [] };
}

export async function getWeakPractice(topicIds, opts = {}) {
  const ids = Array.isArray(topicIds)
    ? topicIds.map((t) => (t == null ? '' : String(t).trim())).filter(Boolean)
    : [];
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
