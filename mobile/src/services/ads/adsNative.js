/**
 * Safe accessors for react-native-google-mobile-ads.
 * Ads must never crash core flows when the native module is missing
 * (Expo Go, incomplete EAS binary, etc.).
 */

import { NativeModules } from 'react-native';
import logger from '../../utils/logger';

let cachedModule = undefined;

export function isGoogleMobileAdsNativeAvailable() {
  return !!(
    NativeModules?.RNGoogleMobileAdsModule ||
    NativeModules?.RNGoogleMobileAdsConsentModule
  );
}

/** @returns {typeof import('react-native-google-mobile-ads') | null} */
export function getGoogleMobileAdsModule() {
  if (cachedModule !== undefined) return cachedModule;
  if (!isGoogleMobileAdsNativeAvailable()) {
    cachedModule = null;
    if (__DEV__) {
      logger.debug('[ads] native module unavailable — skipping ads');
    }
    return null;
  }
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    cachedModule = require('react-native-google-mobile-ads');
    return cachedModule;
  } catch (e) {
    cachedModule = null;
    if (__DEV__) {
      logger.warn('[ads] failed to load google-mobile-ads module', {
        message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
      });
    }
    return null;
  }
}
