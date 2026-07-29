/**
 * Single source of truth for whether ads may be requested/rendered.
 * Reuses `userHasPremiumAccess` — no parallel premium logic.
 */

import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { useAdsReady } from '../services/ads/AdsReadyProvider';
import { isAdsConsentReady } from '../services/ads/adsConsentGate';
import { isGoogleMobileAdsNativeAvailable } from '../services/ads/adsNative';

/**
 * @param {{
 *   screenAllowsAds?: boolean,
 * }} [options]
 * `screenAllowsAds` — false on Test/exam, login, payment, PDF reader, etc.
 */
export function useAdsEligibility(options = {}) {
  const { screenAllowsAds = true } = options;
  const { user, token, isAuthenticated, initializing } = useAuth();
  const { adsReady, adsInitAttempted } = useAdsReady();

  return useMemo(() => {
    const premiumUnresolved = initializing;
    const isPremium = !premiumUnresolved && userHasPremiumAccess(user);
    const nativeOk = isGoogleMobileAdsNativeAvailable();
    const consentReady = isAdsConsentReady();

    // App is auth-gated; do not show ads before login.
    const authenticated = !!isAuthenticated && !!token && !!user;

    const canRequestAds =
      screenAllowsAds &&
      !premiumUnresolved &&
      !isPremium &&
      authenticated &&
      nativeOk &&
      consentReady &&
      adsReady;

    return {
      eligible: canRequestAds,
      /** True while auth/premium is still bootstrapping — render nothing. */
      premiumUnresolved,
      isPremium,
      isAuthenticated: authenticated,
      canRequestAds,
      nativeAvailable: nativeOk,
      adsInitAttempted,
    };
  }, [
    screenAllowsAds,
    user,
    token,
    isAuthenticated,
    initializing,
    adsReady,
    adsInitAttempted,
  ]);
}
