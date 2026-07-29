/**
 * Consent / privacy gate for AdMob requests.
 *
 * No fabricated UMP UI. Currently resolves as "ready" so ads can load
 * outside regulated consent flows. Structure allows plugging in
 * AdsConsent.gatherConsent() before initialize/request without changing
 * call sites.
 */

import logger from '../../utils/logger';

/** @typedef {'unknown' | 'ready' | 'blocked'} AdsConsentReadyState */

let consentState = /** @type {AdsConsentReadyState} */ ('unknown');
let resolvePromise = null;

/**
 * Default request options — do not hard-code all traffic as personalized.
 * Leave room for `requestNonPersonalizedAdsOnly` once UMP decisions exist.
 *
 * @returns {Record<string, unknown>}
 */
export function getAdsRequestOptions() {
  return {
    // Intentionally omit requestNonPersonalizedAdsOnly until UMP is wired.
    // Keywords help fill quality without forcing personalization flags.
    keywords: ['education', 'exam', 'study', 'ssb', 'defense'],
  };
}

export function getAdsConsentState() {
  return consentState;
}

export function isAdsConsentReady() {
  return consentState === 'ready';
}

/**
 * Resolve consent before Mobile Ads init / ad requests.
 * Today: immediately ready. Later: call AdsConsent here and set blocked/ready.
 */
export async function ensureAdsConsentResolved() {
  if (consentState === 'ready' || consentState === 'blocked') {
    return consentState;
  }
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    try {
      // Hook point for Google UMP:
      // const { AdsConsent } = getGoogleMobileAdsModule() || {};
      // await AdsConsent.gatherConsent();
      // const info = await AdsConsent.getConsentInfo();
      // consentState = info.canRequestAds ? 'ready' : 'blocked';
      consentState = 'ready';
      if (__DEV__) {
        logger.debug('[ads] consent gate ready (UMP not yet wired)');
      }
      return consentState;
    } catch (e) {
      // Fail open for non-EEA apps without UMP config; never crash startup.
      consentState = 'ready';
      if (__DEV__) {
        logger.warn('[ads] consent resolve failed — continuing without UMP', {
          message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
        });
      }
      return consentState;
    } finally {
      resolvePromise = null;
    }
  })();

  return resolvePromise;
}

/** Test / future UMP helper — force blocked so no ads are requested. */
export function __setAdsConsentStateForTests(next) {
  consentState = next;
}
