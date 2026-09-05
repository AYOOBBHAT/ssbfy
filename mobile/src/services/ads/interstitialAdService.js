/**
 * Shared interstitial load/show primitives used by interstitialOrchestrator.
 *
 * - Preloads after SDK init / close / failed load (bounded retry)
 * - Never throws to callers
 * - Respects premium at load and immediately before show
 * - Single-flight load/show
 * - Production-safe Sentry breadcrumbs (no full ad unit IDs)
 */

import { userHasPremiumAccess } from '../../utils/premiumAccess';
import logger from '../../utils/logger';
import { monitoringBreadcrumb } from '../../monitoring/sentry';
import {
  getAdUnitId,
  getAdUnitIds,
  sanitizeAdUnitIdForLog,
  shouldUseProductionAdUnits,
} from '../../config/admob';
import { getGoogleMobileAdsModule } from './adsNative';
import { canRequestAdsNow, initializeMobileAds, isMobileAdsInitialized } from './mobileAdsInit';
import { getAdsRequestOptions } from './adsConsentGate';

/** Soft per-session ceiling; primary rate limit is the orchestrator cooldown. */
const MAX_SESSION_SHOWS = 24;
const LOAD_RETRY_DELAY_MS = 12_000;
const MAX_LOAD_RETRIES = 3;
/** Max wait for an in-flight load before navigation continues. */
const DEFAULT_READY_TIMEOUT_MS = 4000;
/** If CLOSED never arrives after a successful show, unblock callers. */
const DEFAULT_CLOSE_WATCHDOG_MS = 15_000;

let interstitial = null;
let unsubscribers = [];
let loaded = false;
let loading = false;
let showing = false;
let loadRetries = 0;
let retryTimer = null;
let sessionShows = 0;
let premiumUserRef = null;
/** @type {((result: string) => void) | null} */
let pendingCloseResolve = null;
/** @type {(() => void) | null} */
let pendingOpenedCallback = null;
let openedCallbackFired = false;

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
    logger.debug(`[ads] ${event}`, data);
  }
}

/**
 * @param {unknown} err
 * @returns {{ code: unknown, message: string, usingProductionUnits: boolean }}
 */
function safeErrorFields(err) {
  return {
    code: err && typeof err === 'object' && 'code' in err ? err.code ?? null : null,
    message:
      err && typeof err === 'object' && err.message
        ? String(err.message).slice(0, 120)
        : 'unknown',
    usingProductionUnits: shouldUseProductionAdUnits(),
  };
}

function clearListeners() {
  for (const unsub of unsubscribers) {
    try {
      unsub?.();
    } catch {
      /* ignore */
    }
  }
  unsubscribers = [];
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function discardLoadedAd() {
  clearListeners();
  clearRetry();
  interstitial = null;
  loaded = false;
  loading = false;
  showing = false;
  pendingOpenedCallback = null;
  openedCallbackFired = false;
  if (pendingCloseResolve) {
    const resolve = pendingCloseResolve;
    pendingCloseResolve = null;
    resolve('discarded');
  }
}

function fireOpenedOnce() {
  if (openedCallbackFired) return;
  openedCallbackFired = true;
  const cb = pendingOpenedCallback;
  pendingOpenedCallback = null;
  if (cb) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

function scheduleRetry() {
  if (loadRetries >= MAX_LOAD_RETRIES) return;
  if (userHasPremiumAccess(premiumUserRef)) return;
  clearRetry();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (userHasPremiumAccess(premiumUserRef)) return;
    if (!canRequestAdsNow()) {
      track('interstitial_consent_blocked', { phase: 'retry' });
      return;
    }
    loadRetries += 1;
    void preloadMockTestInterstitial({ user: premiumUserRef });
  }, LOAD_RETRY_DELAY_MS);
}

function attachListeners(ad, AdEventType) {
  clearListeners();
  unsubscribers.push(
    ad.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      loading = false;
      loadRetries = 0;
      track('interstitial_loaded', {
        usingProductionUnits: shouldUseProductionAdUnits(),
      });
    })
  );

  // OPENED exists in react-native-google-mobile-ads 16.x; guard for safety.
  if (AdEventType?.OPENED) {
    unsubscribers.push(
      ad.addAdEventListener(AdEventType.OPENED, () => {
        showing = true;
        track('interstitial_opened', {
          usingProductionUnits: shouldUseProductionAdUnits(),
        });
        fireOpenedOnce();
      })
    );
  }

  unsubscribers.push(
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      showing = false;
      loaded = false;
      track('interstitial_closed', {
        usingProductionUnits: shouldUseProductionAdUnits(),
      });
      if (pendingCloseResolve) {
        const resolve = pendingCloseResolve;
        pendingCloseResolve = null;
        resolve('closed');
      }
      void preloadMockTestInterstitial({ force: true, user: premiumUserRef });
    })
  );
  unsubscribers.push(
    ad.addAdEventListener(AdEventType.ERROR, (err) => {
      loading = false;
      loaded = false;
      showing = false;
      track('interstitial_load_error', safeErrorFields(err));
      if (pendingCloseResolve) {
        const resolve = pendingCloseResolve;
        pendingCloseResolve = null;
        resolve('error');
      }
      scheduleRetry();
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ force?: boolean, user?: object | null }} [opts]
 */
export async function preloadMockTestInterstitial(opts = {}) {
  const { force = false, user = premiumUserRef } = opts;
  premiumUserRef = user ?? premiumUserRef;

  if (userHasPremiumAccess(premiumUserRef)) {
    discardLoadedAd();
    track('interstitial_skipped_premium', { phase: 'preload' });
    return false;
  }

  if (!force && (loaded || loading || showing)) return loaded;

  try {
    if (!isMobileAdsInitialized()) {
      const ok = await initializeMobileAds();
      if (!ok) {
        track('interstitial_sdk_init_failed', {
          usingProductionUnits: shouldUseProductionAdUnits(),
        });
        return false;
      }
    }
    if (!canRequestAdsNow()) {
      track('interstitial_consent_blocked', { phase: 'preload' });
      return false;
    }

    const ads = getGoogleMobileAdsModule();
    if (!ads?.InterstitialAd || !ads?.AdEventType) return false;

    const unitId = getAdUnitId('mockTestInterstitial');
    if (!unitId) {
      track('interstitial_invalid_unit', {
        usingProductionUnits: shouldUseProductionAdUnits(),
      });
      return false;
    }

    loading = true;
    loaded = false;
    clearListeners();

    interstitial = ads.InterstitialAd.createForAdRequest(unitId, getAdsRequestOptions());
    attachListeners(interstitial, ads.AdEventType);
    interstitial.load();

    track('interstitial_load_requested', {
      unit: sanitizeAdUnitIdForLog(unitId),
      usingProductionUnits: shouldUseProductionAdUnits(),
      force: !!force,
    });
    return true;
  } catch (e) {
    loading = false;
    loaded = false;
    track('interstitial_load_error', safeErrorFields(e));
    scheduleRetry();
    return false;
  }
}

/**
 * Attempt to show a loaded interstitial. Never throws.
 * @param {{ user?: object | null }} [opts]
 * @returns {Promise<'shown' | 'skipped_not_loaded' | 'skipped_premium' | 'skipped_cap' | 'skipped_busy' | 'failed'>}
 */
export async function showMockTestInterstitialIfReady(opts = {}) {
  const user = opts.user ?? premiumUserRef;
  premiumUserRef = user;

  if (userHasPremiumAccess(user)) {
    discardLoadedAd();
    track('interstitial_skipped_premium', { phase: 'show' });
    return 'skipped_premium';
  }
  if (sessionShows >= MAX_SESSION_SHOWS) {
    track('interstitial_skipped_cap', { sessionShows });
    return 'skipped_cap';
  }
  // Allow show when an ad is already loaded even if a prior flag raced;
  // only treat as busy when another interstitial is on screen or still loading
  // without a ready creative.
  if (showing) {
    track('interstitial_skipped_busy', { reason: 'showing' });
    return 'skipped_busy';
  }
  if (loading && !loaded) {
    track('interstitial_skipped_busy', { reason: 'loading' });
    return 'skipped_busy';
  }
  if (!loaded || !interstitial) {
    track('interstitial_skipped_not_loaded', { phase: 'show' });
    return 'skipped_not_loaded';
  }

  try {
    showing = true;
    openedCallbackFired = false;
    await interstitial.show();
    sessionShows += 1;
    loaded = false;
    // Fallback if OPENED is unavailable or delayed past show() resolve.
    fireOpenedOnce();
    return 'shown';
  } catch (e) {
    showing = false;
    loaded = false;
    pendingOpenedCallback = null;
    openedCallbackFired = false;
    track('interstitial_show_error', safeErrorFields(e));
    void preloadMockTestInterstitial({ force: true, user });
    return 'failed';
  }
}

/**
 * Wait briefly for a loaded ad, show it, then resolve when closed (or fail-safe).
 * Never throws. Ready wait is capped so navigation is not blocked.
 * After a successful open, a close watchdog guarantees the Promise settles once.
 *
 * @param {{
 *   user?: object | null,
 *   readyTimeoutMs?: number,
 *   closeWatchdogMs?: number,
 *   onOpened?: () => void,
 * }} [opts]
 * @returns {Promise<'shown' | 'skipped_not_loaded' | 'skipped_premium' | 'skipped_cap' | 'skipped_busy' | 'failed'>}
 */
export async function showInterstitialAwaitingClose(opts = {}) {
  const user = opts.user ?? premiumUserRef;
  const readyTimeoutMs =
    typeof opts.readyTimeoutMs === 'number' ? opts.readyTimeoutMs : DEFAULT_READY_TIMEOUT_MS;
  const closeWatchdogMs =
    typeof opts.closeWatchdogMs === 'number' ? opts.closeWatchdogMs : DEFAULT_CLOSE_WATCHDOG_MS;
  const onOpened = typeof opts.onOpened === 'function' ? opts.onOpened : null;

  premiumUserRef = user;

  if (userHasPremiumAccess(user)) {
    discardLoadedAd();
    track('interstitial_skipped_premium', { phase: 'await_close' });
    return 'skipped_premium';
  }

  if (!loaded && !loading) {
    void preloadMockTestInterstitial({ user });
  }

  // Poll until loaded or timeout. Returns immediately if already loaded.
  const deadline = Date.now() + Math.max(0, readyTimeoutMs);
  while (!isMockTestInterstitialLoaded() && Date.now() < deadline) {
    await sleep(40);
  }

  if (!isMockTestInterstitialLoaded()) {
    track('interstitial_skipped_not_loaded', {
      phase: 'await_ready',
      waitedMs: readyTimeoutMs,
    });
    return 'skipped_not_loaded';
  }

  if (showing) {
    track('interstitial_skipped_busy', { reason: 'showing_before_show' });
    return 'skipped_busy';
  }
  if (sessionShows >= MAX_SESSION_SHOWS) {
    track('interstitial_skipped_cap', { sessionShows });
    return 'skipped_cap';
  }

  let settled = false;
  let watchdogTimer = null;

  pendingOpenedCallback = onOpened;
  openedCallbackFired = false;

  const closePromise = new Promise((resolve) => {
    const finishOnce = (reason) => {
      if (settled) return;
      settled = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      pendingCloseResolve = null;
      resolve(reason);
    };

    pendingCloseResolve = (reason) => finishOnce(reason || 'closed');
    watchdogTimer = setTimeout(() => {
      showing = false;
      track('interstitial_close_watchdog', { ms: closeWatchdogMs });
      finishOnce('timeout');
    }, Math.max(1_000, closeWatchdogMs));
  });

  const showResult = await showMockTestInterstitialIfReady({ user });
  if (showResult !== 'shown') {
    pendingOpenedCallback = null;
    openedCallbackFired = false;
    if (!settled) {
      settled = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      pendingCloseResolve = null;
    }
    return showResult;
  }

  await closePromise;
  return 'shown';
}

export function onPremiumStatusChanged(user) {
  premiumUserRef = user;
  if (!user) {
    discardLoadedAd();
    track('interstitial_discarded_logout', { phase: 'auth_changed' });
    return;
  }
  if (userHasPremiumAccess(user)) {
    discardLoadedAd();
    track('interstitial_skipped_premium', { phase: 'premium_changed' });
  }
}

export function isMockTestInterstitialLoaded() {
  return loaded && !!interstitial && !showing;
}

export function cleanupMockTestInterstitial() {
  discardLoadedAd();
  loadRetries = 0;
}

/**
 * Dev/diagnostics snapshot — no full ad unit IDs or PII.
 * @returns {Record<string, unknown>}
 */
export function getInterstitialDiagnostics() {
  const ids = getAdUnitIds();
  return {
    initialized: isMobileAdsInitialized(),
    canRequestAds: canRequestAdsNow(),
    usingProductionUnits: !!ids.usingProductionUnits,
    interstitialUnit: sanitizeAdUnitIdForLog(ids.mockTestInterstitial),
    loaded,
    loading,
    showing,
    sessionShows,
    premium: userHasPremiumAccess(premiumUserRef),
    retryCount: loadRetries,
  };
}

/** Emit a one-shot sanitized startup breadcrumb for unit-mode visibility. */
export function logInterstitialUnitModeBreadcrumb() {
  const ids = getAdUnitIds();
  track('interstitial_unit_mode', {
    usingProductionUnits: !!ids.usingProductionUnits,
    interstitialUnit: sanitizeAdUnitIdForLog(ids.mockTestInterstitial),
  });
}
