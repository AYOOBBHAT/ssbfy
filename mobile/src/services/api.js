import axios from 'axios';

/**
 * API base URL (LAN IP + `/api`). Change once for the whole app.
 * Do not use localhost — devices cannot reach your machine's loopback.
 */
const API_BASE_URL = 'https://ssbfy.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** In-memory JWT; synced from AuthContext via setAuthToken / clearAuthToken. */
let authToken = null;

export function setAuthToken(token) {
  authToken = token ?? null;
}

/** Explicit clear — preferred for logout paths for readability. */
export function clearAuthToken() {
  authToken = null;
}

export function getAuthToken() {
  return authToken;
}

api.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.log('[AUTH] Token expired or invalid');
    }
    console.log('[API ERROR]:', error?.response?.data ?? error?.message ?? error);
    return Promise.reject(error);
  }
);

export { API_BASE_URL };
export default api;

/** Extract user-facing message from axios / API errors. */
export function getApiErrorMessage(error) {
  const d = error?.response?.data;
  if (typeof d?.message === 'string') {
    return d.message;
  }
  if (Array.isArray(d?.details)) {
    return d.details.map((x) => x.message || x.msg || String(x)).join(', ');
  }
  if (error?.message) {
    return error.message;
  }
  return 'Something went wrong';
}

/** Mirrors backend `AppError` copy for free-tier blocks (403). */
export const FREE_TEST_LIMIT_MESSAGE =
  'Free test limit reached. Upgrade to continue.';

export function isFreeTestLimitError(error) {
  if (error?.response?.status !== 403) return false;
  return getApiErrorMessage(error) === FREE_TEST_LIMIT_MESSAGE;
}
