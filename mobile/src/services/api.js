import axios from 'axios';
import logger from '../utils/logger';

/**
 * API base URL is env-configurable for release channels.
 * Must be HTTPS for production safety.
 */
const PROD_API_FALLBACK = 'https://ssbfy-production.up.railway.app/api';
const API_BASE_URL =(() => {
  const raw = String(process.env.EXPO_PUBLIC_API_BASE_URL || PROD_API_FALLBACK).trim();
  const normalized = raw.replace(/\/+$/, '');
  if (!normalized.startsWith('https://')) {
    return PROD_API_FALLBACK;
  }
  return normalized;
})();

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
      logger.warn('[AUTH] Token expired or invalid');
    }
    logger.error('[API ERROR]:', error?.response?.data ?? error?.message ?? error);
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
