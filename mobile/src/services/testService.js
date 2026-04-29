import api from './api.js';
import { getDeviceId } from '../utils/deviceId.js';

/** @returns {Promise<{ tests: object[] }>} */
export async function getTests() {
  const { data } = await api.get('/tests');
  return data?.data ?? { tests: [] };
}

/** @returns {Promise<{ attempt: object, resumed: boolean }>} */
export async function startTest(testId) {
  const deviceId = await getDeviceId();
  const { data } = await api.post(`/tests/${testId}/start`, { deviceId });
  return data?.data ?? {};
}

/**
 * @param {string} testId
 * @param {{ questionId: string, selectedOptionIndex: number }[]} answers
 * @returns {Promise<object>} API `data` payload (score, accuracy, timeTaken, weakTopics, correctAnswers, attempt, …)
 */
export async function submitTest(testId, answers) {
  const { data } = await api.post(`/tests/${testId}/submit`, { answers });
  return data?.data ?? {};
}

/** @returns {Promise<{ attempts: object[] }>} */
export async function getTestAttempts(testId) {
  const { data } = await api.get(`/tests/${testId}/attempts`);
  return data?.data ?? { attempts: [] };
}

/** @returns {Promise<{ status: Record<string, {hasOpenAttempt:boolean, hasCompletedAttempt:boolean, canRetry:boolean}> }>} */
export async function getMyTestStatus() {
  const { data } = await api.get('/tests/status/mine');
  return data?.data ?? { status: {} };
}

/**
 * @param {string} topicId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ questions: object[], total: number, limit: number, skip: number }>}
 */
export async function getQuestionsByTopic(topicId, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 10;
  const { data } = await api.get('/questions', {
    params: { topicId, limit },
  });
  return data?.data ?? { questions: [] };
}

/**
 * Fetch a random batch of questions drawn from the user's weak topics,
 * for the "🔥 Practice Weak Topics" flow on `ResultScreen`.
 *
 * The backend accepts either `topicIds=a,b,c` or repeated `topicIds=a&
 * topicIds=b` — we deliberately send the CSV form so the URL stays
 * compact even when the user has many weak topics. Invalid / empty ids
 * are filtered client-side so we never send `topicIds=` (which would
 * trip the validator).
 *
 * @param {Array<string|number>} topicIds
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ questions: object[] }>}
 */
/**
 * Custom topic-wise mock: random active questions matching filters.
 * @param {{ postId?: string, subjectId?: string, topicId?: string, difficulty?: string, limit?: number }} body
 * @returns {Promise<{ questions: object[] }>}
 */
export async function postSmartPractice(body) {
  const { data } = await api.post('/questions/smart-practice', body);
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
  const { data } = await api.get('/questions/weak-practice', {
    params: { topicIds: ids.join(','), limit },
  });
  return data?.data ?? { questions: [] };
}
