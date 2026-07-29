/**
 * One-shot Google Mobile Ads SDK initialization.
 * Non-blocking for splash/auth; failures are swallowed.
 */

import logger from '../../utils/logger';
import { getGoogleMobileAdsModule, isGoogleMobileAdsNativeAvailable } from './adsNative';
import { ensureAdsConsentResolved, isAdsConsentReady } from './adsConsentGate';

let initPromise = null;
let initialized = false;
let initFailed = false;

export function isMobileAdsInitialized() {
  return initialized;
}

export function didMobileAdsInitFail() {
  return initFailed;
}

/**
 * Initialize once after auth bootstrap. Safe to call repeatedly.
 * @returns {Promise<boolean>} true if SDK is ready
 */
export async function initializeMobileAds() {
  if (initialized) return true;
  if (initFailed && initPromise == null) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!isGoogleMobileAdsNativeAvailable()) {
        initFailed = true;
        if (__DEV__) logger.debug('[ads] init skipped — native unavailable');
        return false;
      }

      const consent = await ensureAdsConsentResolved();
      if (consent === 'blocked') {
        initFailed = true;
        if (__DEV__) logger.debug('[ads] init skipped — consent blocked');
        return false;
      }

      const ads = getGoogleMobileAdsModule();
      if (!ads?.default) {
        initFailed = true;
        return false;
      }

      const mobileAds = ads.default();
      if (typeof mobileAds?.setRequestConfiguration === 'function') {
        try {
          await mobileAds.setRequestConfiguration({
            // Do not mark the whole app as child-directed by default.
            testDeviceIdentifiers: __DEV__ ? ['EMULATOR'] : undefined,
          });
        } catch (cfgErr) {
          if (__DEV__) {
            logger.warn('[ads] setRequestConfiguration failed', {
              message: cfgErr?.message
                ? String(cfgErr.message).slice(0, 120)
                : 'unknown',
            });
          }
        }
      }

      await mobileAds.initialize();
      initialized = true;
      initFailed = false;
      if (__DEV__) logger.debug('[ads] Mobile Ads SDK initialized');
      return true;
    } catch (e) {
      initFailed = true;
      if (__DEV__) {
        logger.warn('[ads] initialize failed', {
          message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
        });
      }
      return false;
    } finally {
      // Keep promise so concurrent callers share the same attempt;
      // allow a later retry only if we never initialized.
      if (!initialized) {
        initPromise = null;
      }
    }
  })();

  return initPromise;
}

/** True when consent + SDK are ready enough to request ads. */
export function canRequestAdsNow() {
  return initialized && isAdsConsentReady() && !initFailed;
}
