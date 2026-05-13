import logger from './logger.js';
import { isRequestCancelled } from './requestCancel.js';
import { isTimeoutError, isOfflineError } from '../services/api.js';

const RETRY_DELAY_MS = 1200;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * True when a single automatic retry may help (no HTTP response yet).
 * Does NOT retry 401/403/429/4xx/5xx — those always have `error.response`.
 */
export function isTransientAuthNetworkFailure(error) {
  if (!error || isRequestCancelled(error)) return false;
  if (error.response) return false;
  if (isTimeoutError(error)) return true;
  if (isOfflineError(error)) return true;
  const code = error.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return true;
  }
  return false;
}

/**
 * One retry after ~1.2s for login / bootstrap only. Preserves AbortSignal.
 * Sets `lastError.authNetworkRetried = true` when the second attempt also fails.
 */
export async function withSingleAuthNetworkRetry(requestFn, {
  signal,
  onRetrying,
  label = 'auth',
} = {}) {
  let lastError;
  try {
    return await requestFn();
  } catch (e) {
    lastError = e;
    if (signal?.aborted || isRequestCancelled(e)) throw e;
    if (!isTransientAuthNetworkFailure(e)) throw e;
  }

  if (__DEV__) {
    logger.debug(`[auth-retry] ${label}: transient failure, will retry once`, {
      code: lastError?.code ?? null,
    });
  }

  try {
    onRetrying?.();
    await sleep(RETRY_DELAY_MS, signal);
  } catch (abortErr) {
    if (isRequestCancelled(abortErr) || signal?.aborted) {
      throw lastError;
    }
    throw abortErr;
  }

  try {
    const out = await requestFn();
    if (__DEV__) {
      logger.debug(`[auth-retry] ${label}: retry succeeded`);
    }
    return out;
  } catch (e2) {
    if (isRequestCancelled(e2)) throw e2;
    if (e2 && typeof e2 === 'object') {
      e2.authNetworkRetried = true;
    }
    throw e2;
  }
}

/**
 * User-facing copy after a failed login/bootstrap when one automatic retry already ran.
 */
export function getAuthFlowMessageAfterRetry(error) {
  if (!error?.authNetworkRetried) return null;
  if (isRequestCancelled(error)) return '';
  if (isTimeoutError(error)) {
    return 'Still timing out. Try again when you have a stronger signal.';
  }
  if (isOfflineError(error)) {
    return 'Connection still unstable. Try again in a moment.';
  }
  return 'Could not reach the server. Try again shortly.';
}
