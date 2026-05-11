import axios from 'axios';
import logger from '../utils/logger';
import { isRequestCancelled } from '../utils/requestCancel.js';
import { recordHttpFailure } from '../monitoring/apiTrack';

export { isRequestCancelled };

/**
 * API base URL is env-configurable for release channels.
 * Must be HTTPS for production safety.
 */
const PROD_API_FALLBACK = 'https://ssbfy-production.up.railway.app/api';
const API_BASE_URL = (() => {
  const raw = String(process.env.EXPO_PUBLIC_API_BASE_URL || PROD_API_FALLBACK).trim();
  const normalized = raw.replace(/\/+$/, '');
  if (!normalized.startsWith('https://')) {
    return PROD_API_FALLBACK;
  }
  return normalized;
})();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
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
    config.metadata = { startTime: Date.now() };
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
    if (isRequestCancelled(error)) {
      if (__DEV__) {
        logger.debug('[API] request cancelled', {
          url: String(error?.config?.url || '').split('?')[0],
        });
      }
      return Promise.reject(error);
    }

    const cfg = error.config || {};
    const start = cfg.metadata?.startTime ?? Date.now();
    const latencyMs = Date.now() - start;
    const method = String(cfg.method || 'get').toUpperCase();
    const path = String(cfg.url || '').split('?')[0];
    const status = error?.response?.status;
    const code = error.code;
    const recoverable409 =
      error?.response?.status === 409 &&
      error?.response?.data?.code === 'ATTEMPT_ALREADY_SUBMITTED';

    if (error?.response?.status === 401) {
      logger.warn('[AUTH] Unauthorized request');
    }

    if (recoverable409) {
      logger.debug('[submit] recoverable 409 — attempt already submitted');
    } else if (__DEV__) {
      logger.error('[API ERROR]', {
        path,
        method,
        status: status ?? null,
        code: code ?? null,
        latencyMs,
      });
    }

    recordHttpFailure({
      method,
      url: path,
      status,
      latencyMs,
      axiosCode: code,
      flow: 'mobile_api',
    });

    return Promise.reject(error);
  }
);

export { API_BASE_URL };
export default api;

/** Safe user-facing copy — never echoes tokens or stack traces. */
export function getApiErrorMessage(error) {
  if (isRequestCancelled(error)) {
    return '';
  }
  const d = error?.response?.data;

  if (typeof d?.message === 'string' && d.message.trim()) {
    return d.message;
  }
  if (Array.isArray(d?.details)) {
    return d.details.map((x) => x.message || x.msg || String(x)).join(', ');
  }

  if (!error?.response) {
    const msg = String(error?.message || '');
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(msg)) {
      return 'Request timed out. Please try again.';
    }
    if (
      error?.code === 'ERR_NETWORK' ||
      msg.toLowerCase().includes('network error') ||
      msg.toLowerCase().includes('network request failed')
    ) {
      return 'Unable to reach the server. Check your connection.';
    }
    return 'Unable to reach the server. Check your connection.';
  }

  const st = error.response.status;
  if (st === 401) {
    return 'Session expired. Please sign in again.';
  }
  if (st === 403) {
    return typeof d?.message === 'string' && d.message.trim()
      ? d.message
      : 'You do not have access to this action.';
  }
  if (st === 404) {
    return 'This resource was not found.';
  }
  if (st === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (st >= 500) {
    return 'The server is temporarily unavailable. Please try again shortly.';
  }

  if (error?.message) {
    return error.message;
  }
  return 'Something went wrong';
}

export function isTimeoutError(error) {
  if (!error?.response) {
    const msg = String(error?.message || '');
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(msg)) return true;
  }
  return false;
}

export function isOfflineError(error) {
  if (error?.response) return false;
  const msg = String(error?.message || '').toLowerCase();
  if (
    error?.code === 'ERR_NETWORK' ||
    msg.includes('network error') ||
    msg.includes('network request failed')
  ) {
    return true;
  }
  return false;
}

export function isAuthExpiredError(error) {
  return error?.response?.status === 401;
}

/** Mirrors backend `AppError` copy for free-tier blocks (403). */
export const FREE_TEST_LIMIT_MESSAGE =
  'Free test limit reached. Upgrade to continue.';

export function isFreeTestLimitError(error) {
  if (error?.response?.status !== 403) return false;
  return getApiErrorMessage(error) === FREE_TEST_LIMIT_MESSAGE;
}

/** POST /tests/:id/submit — server finalized the attempt but the client may retry (lost response). */
export function isAttemptAlreadySubmittedError(error) {
  if (error?.response?.status !== 409) return false;
  const dat = error?.response?.data;
  if (dat?.code === 'ATTEMPT_ALREADY_SUBMITTED') return true;
  const msg = typeof dat?.message === 'string' ? dat.message.toLowerCase() : '';
  return msg.includes('already submitted');
}

/** Same shape as a successful submit `data` payload when present on 409 recovery. */
export function getSubmitConflictRecoveryResult(error) {
  return error?.response?.data?.result ?? null;
}
