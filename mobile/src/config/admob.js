/**
 * Centralized AdMob unit IDs.
 *
 * Development / preview / non-production builds use Google TestIds.
 * Production EAS builds opt in via EXPO_PUBLIC_ADMOB_USE_PRODUCTION=1.
 *
 * Never log full production ad-unit IDs.
 */

import { getGoogleMobileAdsModule } from '../services/ads/adsNative';

/** Android AdMob App ID (native plugin). Contains `~`, not `/`. */
export const ADMOB_ANDROID_APP_ID = 'ca-app-pub-7420252276948628~4551564612';

/**
 * iOS App ID was not supplied. Google's sample App ID keeps iOS native
 * bootstrap from crashing until a real SSBFY iOS AdMob app is created.
 */
export const ADMOB_IOS_APP_ID_PLACEHOLDER = 'ca-app-pub-3940256099942544~1458002511';

const PRODUCTION_UNIT_IDS = Object.freeze({
  homeBanner: 'ca-app-pub-7420252276948628/8115027800',
  profileBanner: 'ca-app-pub-7420252276948628/6721366723',
  notesBanner: 'ca-app-pub-7420252276948628/6223361636',
  mockTestInterstitial: 'ca-app-pub-7420252276948628/3197743041',
});

/** Official Google sample units — fallback if TestIds cannot be read. */
const FALLBACK_TEST_IDS = Object.freeze({
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
});

/**
 * Preview/dev builds stay on test ads unless explicitly opted in.
 * Production EAS profile sets EXPO_PUBLIC_ADMOB_USE_PRODUCTION=1.
 */
export function shouldUseProductionAdUnits() {
  if (__DEV__) return false;
  return String(process.env.EXPO_PUBLIC_ADMOB_USE_PRODUCTION || '').trim() === '1';
}

function resolveTestIds() {
  const ads = getGoogleMobileAdsModule();
  const testIds = ads?.TestIds;
  return {
    BANNER: testIds?.BANNER || FALLBACK_TEST_IDS.BANNER,
    INTERSTITIAL: testIds?.INTERSTITIAL || FALLBACK_TEST_IDS.INTERSTITIAL,
  };
}

/**
 * @typedef {'homeBanner' | 'profileBanner' | 'notesBanner' | 'mockTestInterstitial'} AdPlacementKey
 */

/**
 * @returns {{
 *   homeBanner: string,
 *   profileBanner: string,
 *   notesBanner: string,
 *   mockTestInterstitial: string,
 *   usingProductionUnits: boolean,
 * }}
 */
export function getAdUnitIds() {
  if (!shouldUseProductionAdUnits()) {
    const testIds = resolveTestIds();
    return {
      homeBanner: testIds.BANNER,
      profileBanner: testIds.BANNER,
      notesBanner: testIds.BANNER,
      mockTestInterstitial: testIds.INTERSTITIAL,
      usingProductionUnits: false,
    };
  }
  return {
    ...PRODUCTION_UNIT_IDS,
    usingProductionUnits: true,
  };
}

/** @param {AdPlacementKey | string} key */
export function getAdUnitId(key) {
  const ids = getAdUnitIds();
  return ids[key] || null;
}

/** Sanitize IDs for DEV logs — never print full production unit strings. */
export function sanitizeAdUnitIdForLog(unitId) {
  if (!unitId || typeof unitId !== 'string') return null;
  if (unitId.startsWith('ca-app-pub-3940256099942544')) return 'test_unit';
  if (unitId.includes('~')) {
    return `app_id…${unitId.slice(-4)}`;
  }
  if (unitId.includes('/')) {
    return `unit…${unitId.slice(-4)}`;
  }
  return 'unit_redacted';
}
