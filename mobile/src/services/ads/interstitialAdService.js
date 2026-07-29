/**
 * Mock-test interstitial manager.
 *
 * - Preloads after SDK init / close / failed load (bounded retry)
 * - Never blocks navigation
 * - Respects premium at load and immediately before show
 * - Session cap to prevent spam
 * - Single-flight load/show
 */

import { userHasPremiumAccess } from '../../utils/premiumAccess';
import logger from '../../utils/logger';
import { getAdUnitId, sanitizeAdUnitIdForLog } from '../../config/admob';
import { getGoogleMobileAdsModule } from './adsNative';
import { canRequestAdsNow, initializeMobileAds, isMobileAdsInitialized } from './mobileAdsInit';
import { getAdsRequestOptions } from './adsConsentGate';

const MAX_SESSION_SHOWS = 2;
const LOAD_RETRY_DELAY_MS = 12_000;
const MAX_LOAD_RETRIES = 3;

let interstitial = null;
let unsubscribers = [];
let loaded = false;
let loading = false;
let showing = false;
let loadRetries = 0;
let retryTimer = null;
let sessionShows = 0;
let premiumUserRef = null;

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
}

function scheduleRetry() {
  if (loadRetries >= MAX_LOAD_RETRIES) return;
  clearRetry();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    loadRetries += 1;
    void preloadMockTestInterstitial();
  }, LOAD_RETRY_DELAY_MS);
}

function attachListeners(ad, AdEventType) {
  clearListeners();
  unsubscribers.push(
    ad.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      loading = false;
      loadRetries = 0;
      if (__DEV__) logger.debug('[ads] interstitial loaded');
    })
  );
  unsubscribers.push(
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      showing = false;
      loaded = false;
      if (__DEV__) logger.debug('[ads] interstitial closed — preloading next');
      void preloadMockTestInterstitial({ force: true });
    })
  );
  unsubscribers.push(
    ad.addAdEventListener(AdEventType.ERROR, (err) => {
      loading = false;
      loaded = false;
      showing = false;
      if (__DEV__) {
        logger.warn('[ads] interstitial error', {
          code: err?.code ?? null,
          message: err?.message ? String(err.message).slice(0, 120) : 'unknown',
        });
      }
      scheduleRetry();
    })
  );
}

/**
 * @param {{ force?: boolean, user?: object | null }} [opts]
 */
export async function preloadMockTestInterstitial(opts = {}) {
  const { force = false, user = premiumUserRef } = opts;
  premiumUserRef = user ?? premiumUserRef;

  if (userHasPremiumAccess(premiumUserRef)) {
    discardLoadedAd();
    return false;
  }

  if (!force && (loaded || loading || showing)) return loaded;

  try {
    if (!isMobileAdsInitialized()) {
      const ok = await initializeMobileAds();
      if (!ok) return false;
    }
    if (!canRequestAdsNow()) return false;

    const ads = getGoogleMobileAdsModule();
    if (!ads?.InterstitialAd || !ads?.AdEventType) return false;

    const unitId = getAdUnitId('mockTestInterstitial');
    if (!unitId) return false;

    loading = true;
    loaded = false;
    clearListeners();

    interstitial = ads.InterstitialAd.createForAdRequest(unitId, getAdsRequestOptions());
    attachListeners(interstitial, ads.AdEventType);
    interstitial.load();

    if (__DEV__) {
      logger.debug('[ads] interstitial load requested', {
        unit: sanitizeAdUnitIdForLog(unitId),
      });
    }
    return true;
  } catch (e) {
    loading = false;
    loaded = false;
    if (__DEV__) {
      logger.warn('[ads] interstitial preload failed', {
        message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
      });
    }
    scheduleRetry();
    return false;
  }
}

/**
 * Attempt to show a loaded interstitial. Never throws; never blocks caller.
 * @param {{ user?: object | null }} [opts]
 * @returns {Promise<'shown' | 'skipped_not_loaded' | 'skipped_premium' | 'skipped_cap' | 'skipped_busy' | 'failed'>}
 */
export async function showMockTestInterstitialIfReady(opts = {}) {
  const user = opts.user ?? premiumUserRef;
  premiumUserRef = user;

  if (userHasPremiumAccess(user)) {
    discardLoadedAd();
    return 'skipped_premium';
  }
  if (sessionShows >= MAX_SESSION_SHOWS) return 'skipped_cap';
  if (showing || loading) return 'skipped_busy';
  if (!loaded || !interstitial) return 'skipped_not_loaded';

  try {
    showing = true;
    await interstitial.show();
    sessionShows += 1;
    loaded = false;
    if (__DEV__) {
      logger.debug('[ads] interstitial shown', { sessionShows });
    }
    return 'shown';
  } catch (e) {
    showing = false;
    loaded = false;
    if (__DEV__) {
      logger.warn('[ads] interstitial show failed', {
        message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
      });
    }
    void preloadMockTestInterstitial({ force: true, user });
    return 'failed';
  }
}

export function onPremiumStatusChanged(user) {
  premiumUserRef = user;
  if (userHasPremiumAccess(user)) {
    discardLoadedAd();
  }
}

export function isMockTestInterstitialLoaded() {
  return loaded && !!interstitial && !showing;
}

export function cleanupMockTestInterstitial() {
  discardLoadedAd();
  loadRetries = 0;
}
