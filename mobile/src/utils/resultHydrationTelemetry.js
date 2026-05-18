/**
 * P3: Result historical hydration telemetry, timing, and user-safe error classification.
 */

import logger from './logger';
import { getApiErrorCode, isOfflineError, isTimeoutError } from '../services/api';
import { HYDRATION_PAYLOAD_ERROR } from './resultHydrationPayload';

/** Standardized hydration exit categories. */
export const HYDRATION_OUTCOME = {
  SUCCESS: 'success',
  CACHE_HIT: 'cache-hit',
  CACHE_INVALID: 'cache-invalid',
  NETWORK_TIMEOUT: 'network-timeout',
  REQUEST_CANCELLED: 'request-cancelled',
  STALE_LOAD_IGNORED: 'stale-load-ignored',
  UNSUPPORTED_SNAPSHOT: 'unsupported-snapshot',
  CORRUPT_PAYLOAD: 'corrupt-payload',
  HYDRATION_RECOVERED: 'hydration-recovered',
  HYDRATION_FAILED: 'hydration-failed',
  OFFLINE: 'offline',
  NOT_FOUND: 'not-found',
};

const FAILURE_OUTCOMES = new Set([
  HYDRATION_OUTCOME.NETWORK_TIMEOUT,
  HYDRATION_OUTCOME.UNSUPPORTED_SNAPSHOT,
  HYDRATION_OUTCOME.CORRUPT_PAYLOAD,
  HYDRATION_OUTCOME.HYDRATION_FAILED,
  HYDRATION_OUTCOME.OFFLINE,
  HYDRATION_OUTCOME.NOT_FOUND,
  HYDRATION_OUTCOME.CACHE_INVALID,
]);

function nowMs() {
  return Date.now();
}

function emitProduction(level, event, payload) {
  if (__DEV__) return;
  if (level !== 'warn' && level !== 'error') return;
  if (!FAILURE_OUTCOMES.has(payload?.outcome) && event !== 'hydration-failed') return;
  const line = JSON.stringify({
    scope: 'ResultHydration',
    event,
    ...payload,
  });
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.warn(line);
  }
}

/**
 * @param {{ loadId: number, hydrationMode: string, learningSessionId?: string|null, attemptId?: string|null, retryGeneration?: number }} ctx
 */
export function createResultHydrationTelemetry(ctx) {
  const sessionStartedAt = nowMs();
  const metrics = {
    cacheReadMs: null,
    networkMs: null,
    validationMs: null,
    totalMs: null,
  };
  let outcome = null;
  let outcomeDetail = null;
  let _cacheStart = 0;
  let _networkStart = 0;
  let _validationStart = 0;

  const base = () => ({
    loadId: ctx.loadId,
    hydrationMode: ctx.hydrationMode,
    learningSessionId: ctx.learningSessionId ?? null,
    attemptId: ctx.attemptId ?? null,
    retryGeneration: ctx.retryGeneration ?? 0,
    metrics: { ...metrics },
    outcome,
    outcomeDetail,
  });

  const logDev = (phase, extra = {}) => {
    if (!__DEV__) return;
    logger.debug(`[ResultHydration] ${phase}`, { ...base(), ...extra });
  };

  return {
    markCacheStart() {
      _cacheStart = nowMs();
      logDev('cache-start');
    },
    markCacheEnd({ hit = false, skipped = false } = {}) {
      if (_cacheStart > 0) metrics.cacheReadMs = nowMs() - _cacheStart;
      logDev('cache-end', { hit, skipped, cacheReadMs: metrics.cacheReadMs });
    },
    markNetworkStart() {
      _networkStart = nowMs();
      logDev('network-start');
    },
    markNetworkEnd() {
      if (_networkStart > 0) metrics.networkMs = nowMs() - _networkStart;
      logDev('network-end', { networkMs: metrics.networkMs });
    },
    markValidationStart() {
      _validationStart = nowMs();
    },
    markValidationEnd() {
      if (_validationStart > 0) metrics.validationMs = nowMs() - _validationStart;
    },
    recordOutcome(nextOutcome, detail = null) {
      outcome = nextOutcome;
      outcomeDetail = detail;
      logDev('outcome', { outcome: nextOutcome, detail });
    },
    finish(extra = {}) {
      metrics.totalMs = nowMs() - sessionStartedAt;
      const payload = { ...base(), ...extra };
      logDev('lifecycle-complete', payload);
      if (FAILURE_OUTCOMES.has(outcome)) {
        emitProduction('warn', 'hydration-failed', payload);
      }
      return { outcome, outcomeDetail, metrics: { ...metrics } };
    },
    log(phase, extra = {}) {
      logDev(phase, extra);
    },
    get outcome() {
      return outcome;
    },
    get metrics() {
      return { ...metrics };
    },
  };
}

/**
 * Map API / validation errors to hydration outcomes.
 * @param {unknown} error
 * @param {{ validationCode?: string|null }} [hints]
 */
export function classifyHydrationError(error, hints = {}) {
  const code = hints.validationCode || getApiErrorCode(error);
  if (code === HYDRATION_PAYLOAD_ERROR.UNSUPPORTED) {
    return HYDRATION_OUTCOME.UNSUPPORTED_SNAPSHOT;
  }
  if (
    code === HYDRATION_PAYLOAD_ERROR.INVALID ||
    code === HYDRATION_PAYLOAD_ERROR.EMPTY
  ) {
    return HYDRATION_OUTCOME.CORRUPT_PAYLOAD;
  }
  if (isOfflineError(error)) return HYDRATION_OUTCOME.OFFLINE;
  if (isTimeoutError(error) || /timed out/i.test(String(error?.message || ''))) {
    return HYDRATION_OUTCOME.NETWORK_TIMEOUT;
  }
  const status = error?.response?.status;
  if (status === 404) return HYDRATION_OUTCOME.NOT_FOUND;
  return HYDRATION_OUTCOME.HYDRATION_FAILED;
}

/**
 * User-safe ErrorState copy keyed by failure category.
 * @param {unknown} error
 * @param {{ outcome?: string|null }} [opts]
 */
export function resolveHistoricalHydrationErrorMessage(error, opts = {}) {
  const code = getApiErrorCode(error);
  const outcome = opts.outcome || classifyHydrationError(error, { validationCode: code });

  if (code === 'ATTEMPT_RESULTS_PENDING') {
    return 'Results are still being prepared.';
  }
  if (
    outcome === HYDRATION_OUTCOME.UNSUPPORTED_SNAPSHOT ||
    code === HYDRATION_PAYLOAD_ERROR.UNSUPPORTED
  ) {
    return 'This session uses an older saved format and cannot be opened on this version.';
  }
  if (code === 'SESSION_SNAPSHOT_TOO_LARGE') {
    return 'This session is too large to restore for review.';
  }
  if (
    outcome === HYDRATION_OUTCOME.CORRUPT_PAYLOAD ||
    code === HYDRATION_PAYLOAD_ERROR.INVALID ||
    code === HYDRATION_PAYLOAD_ERROR.EMPTY
  ) {
    return 'This saved session is incomplete or no longer available.';
  }
  if (outcome === HYDRATION_OUTCOME.NOT_FOUND || error?.response?.status === 404) {
    return 'This session could not be found. It may have been removed.';
  }
  if (outcome === HYDRATION_OUTCOME.OFFLINE) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (outcome === HYDRATION_OUTCOME.NETWORK_TIMEOUT) {
    return 'Loading took too long. Please try again.';
  }
  if (outcome === HYDRATION_OUTCOME.HYDRATION_FAILED) {
    const apiMsg = error?.response?.data?.message;
    if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg.trim();
  }
  const fallback =
    typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : '';
  if (fallback && !/^invalid result payload$/i.test(fallback)) {
    return fallback;
  }
  return 'Could not load results.';
}

/**
 * DEV-only invariant checks — never throws in production.
 * @param {string} label
 * @param {Record<string, boolean>} checks
 */
export function assertHydrationInvariants(label, checks) {
  if (!__DEV__) return;
  for (const [name, ok] of Object.entries(checks)) {
    if (ok) continue;
    logger.debug('[ResultHydration/invariant-violation]', { label, name });
  }
}
