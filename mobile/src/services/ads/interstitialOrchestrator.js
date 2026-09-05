/**
 * Central interstitial orchestrator — the only place that decides/shows interstitials.
 *
 * Placements:
 * - before mock / PYQ start (after successful start/resume, before Test)
 * - after mock / PYQ finish (before Result)
 * - before Battle start (after successful attempt start, before Test)
 * - after Battle finish (before Battle Result)
 * - after daily practice (before Result)
 * - before PDF open
 *
 * Fail-safe: never throws; if ad unavailable, callers continue immediately.
 * Cooldown: 45–90s between successful shows (starts only after open).
 * Skipped / failed shows do not start cooldown.
 *
 * Project convention is JS (+ JSDoc). File is .js (Expo has no TS check pipeline).
 */

import { userHasPremiumAccess } from '../../utils/premiumAccess';
import logger from '../../utils/logger';
import { monitoringBreadcrumb } from '../../monitoring/sentry';
import {
  isMockTestInterstitialLoaded,
  preloadMockTestInterstitial,
  showInterstitialAwaitingClose,
} from './interstitialAdService';

export const INTERSTITIAL_COOLDOWN_MIN_MS = 45_000;
export const INTERSTITIAL_COOLDOWN_MAX_MS = 90_000;
/** Active cooldown — keep at the 45s floor unless explicitly raised (max 90s). */
export const INTERSTITIAL_COOLDOWN_MS = INTERSTITIAL_COOLDOWN_MIN_MS;

export function clampInterstitialCooldownMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return INTERSTITIAL_COOLDOWN_MIN_MS;
  return Math.min(
    INTERSTITIAL_COOLDOWN_MAX_MS,
    Math.max(INTERSTITIAL_COOLDOWN_MIN_MS, Math.floor(n))
  );
}
/** Max wait for an in-flight load. Already-loaded ads show immediately. */
export const INTERSTITIAL_READY_TIMEOUT_MS = 4000;
export const INTERSTITIAL_CLOSE_WATCHDOG_MS = 15_000;

/** @typedef {'before_mock_start' | 'before_pyq_start' | 'after_mock_finish' | 'before_battle_start' | 'after_battle_finish' | 'after_daily_practice' | 'before_pdf'} InterstitialPlacement */

let lastShownAtMs = 0;
let inFlight = false;

/**
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
function track(event, data = {}) {
  try {
    monitoringBreadcrumb('ads_interstitial', event, data);
  } catch {
    /* ignore */
  }
  if (__DEV__) {
    logger.debug(`[ads:orchestrator] ${event}`, data);
  }
}

function cooldownRemainingMs() {
  if (!lastShownAtMs) return 0;
  const windowMs = clampInterstitialCooldownMs(INTERSTITIAL_COOLDOWN_MS);
  const elapsed = Date.now() - lastShownAtMs;
  return elapsed >= windowMs ? 0 : windowMs - elapsed;
}

/**
 * @param {InterstitialPlacement} placement
 * @param {{ user?: object | null }} [opts]
 * @returns {Promise<'shown' | 'skipped_premium' | 'skipped_cooldown' | 'skipped_not_loaded' | 'skipped_busy' | 'failed'>}
 */
async function runPlacement(placement, opts = {}) {
  const user = opts.user ?? null;

  track('interstitial_placement', { placement });

  if (userHasPremiumAccess(user)) {
    track('interstitial_skipped_premium', { placement });
    return 'skipped_premium';
  }

  const remaining = cooldownRemainingMs();
  if (remaining > 0) {
    track('interstitial_skipped_cap', {
      placement,
      reason: 'cooldown',
      remainingMs: remaining,
    });
    return 'skipped_cooldown';
  }

  if (inFlight) {
    track('interstitial_skipped_busy', { placement });
    return 'skipped_busy';
  }

  inFlight = true;
  try {
    if (!isMockTestInterstitialLoaded()) {
      void preloadMockTestInterstitial({ user });
    }

    const result = await showInterstitialAwaitingClose({
      user,
      readyTimeoutMs: INTERSTITIAL_READY_TIMEOUT_MS,
      closeWatchdogMs: INTERSTITIAL_CLOSE_WATCHDOG_MS,
      // Cooldown starts only when the interstitial actually opens.
      onOpened: () => {
        lastShownAtMs = Date.now();
      },
    });

    if (result === 'shown') {
      track('interstitial_shown', { placement });
      return 'shown';
    }

    if (result === 'skipped_premium') {
      track('interstitial_skipped_premium', { placement });
      return 'skipped_premium';
    }

    if (result === 'skipped_busy') {
      track('interstitial_skipped_busy', { placement });
      return 'skipped_busy';
    }

    if (result === 'skipped_cap') {
      track('interstitial_skipped_cap', { placement, reason: 'session_cap' });
      return 'skipped_not_loaded';
    }

    if (result === 'skipped_not_loaded') {
      track('interstitial_skipped_not_loaded', { placement });
      return 'skipped_not_loaded';
    }

    track('interstitial_show_error', { placement, reason: result });
    return 'failed';
  } catch (e) {
    track('interstitial_show_error', {
      placement,
      code: e?.code ?? null,
      message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
    });
    return 'failed';
  } finally {
    inFlight = false;
    // Keep next ad warm for free users.
    if (!userHasPremiumAccess(user)) {
      void preloadMockTestInterstitial({ user });
    }
  }
}

/** @param {{ user?: object | null }} [opts] */
export function showBeforeMockStart(opts = {}) {
  return runPlacement('before_mock_start', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showBeforePyqStart(opts = {}) {
  return runPlacement('before_pyq_start', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showAfterMockFinish(opts = {}) {
  return runPlacement('after_mock_finish', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showBeforeBattleStart(opts = {}) {
  return runPlacement('before_battle_start', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showAfterBattleFinish(opts = {}) {
  return runPlacement('after_battle_finish', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showAfterDailyPractice(opts = {}) {
  return runPlacement('after_daily_practice', opts);
}

/** @param {{ user?: object | null }} [opts] */
export function showBeforePdf(opts = {}) {
  return runPlacement('before_pdf', opts);
}

/** Test helper — do not use in product flows. */
export function __resetInterstitialOrchestratorForTests() {
  lastShownAtMs = 0;
  inFlight = false;
}
