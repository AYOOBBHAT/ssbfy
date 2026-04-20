import api from './api.js';

/** @returns {Promise<{ tests: object[] }>} */
export async function getTests() {
  const { data } = await api.get('/tests');
  return data.data;
}

/** @returns {Promise<{ attempt: object, resumed: boolean }>} */
export async function startTest(testId) {
  const { data } = await api.post(`/tests/${testId}/start`);
  return data.data;
}

/**
 * @param {string} testId
 * @param {{ questionId: string, selectedOptionIndex: number }[]} answers
 * @returns {Promise<object>} API `data` payload (score, accuracy, timeTaken, weakTopics, correctAnswers, attempt, …)
 */
export async function submitTest(testId, answers) {
  const { data } = await api.post(`/tests/${testId}/submit`, { answers });
  return data.data;
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
  return data.data;
}
