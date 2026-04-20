import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const payload = error?.response?.data;
    console.log('[API ERROR]:', status || '', payload || error.message);
    if (status === 401) {
      console.log('[AUTH] Token expired or invalid');
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Something went wrong'
  );
}

/* ---------------- Resource helpers ---------------- */

// Backend wraps payloads as { success, message, data }.
// Each helper unwraps `data` so callers get clean values.
function unwrap(res) {
  return res?.data?.data ?? res?.data ?? null;
}

/* ---------------- Auth ---------------- */

/** Login with email + password. Returns { user, token }. */
export async function login({ email, password }) {
  const res = await api.post('/auth/login', { email, password });
  return unwrap(res);
}

/** Fetch the current user using the active token. */
export async function fetchMe() {
  const res = await api.get('/users/me');
  const data = unwrap(res);
  return data?.user ?? data;
}

/**
 * Create a new question (admin only).
 * @param {object} payload  questionText, options, correctAnswerIndex,
 *                          correctAnswerValue, explanation, subjectId,
 *                          topicId, postIds, year, difficulty
 */
export async function createQuestion(payload) {
  const res = await api.post('/questions', payload);
  return unwrap(res);
}

/** List all subjects. */
export async function getSubjects() {
  const res = await api.get('/subjects');
  return unwrap(res);
}

/** List all topics. */
export async function getTopics() {
  const res = await api.get('/topics');
  return unwrap(res);
}

/**
 * List questions with optional filters/pagination.
 * @param {object} params  subjectId, topicId, difficulty, year, limit, skip, sort
 */
export async function getQuestions(params = {}) {
  const res = await api.get('/questions', { params });
  return unwrap(res);
}

/**
 * Create a new test (admin only).
 * @param {object} payload  title, type, questionIds, duration, negativeMarking
 */
export async function createTest(payload) {
  const res = await api.post('/tests', payload);
  return unwrap(res);
}

export default api;
