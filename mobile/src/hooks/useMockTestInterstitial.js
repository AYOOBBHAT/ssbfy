import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdsEligibility } from './useAdsEligibility';
import { preloadMockTestInterstitial } from '../services/ads/interstitialAdService';

/**
 * Kept for ResultScreen compatibility. Interstitial *display* is owned by
 * `interstitialOrchestrator` (after mock finish). This hook only warms the
 * next interstitial preload for free users — it never shows an ad.
 *
 * @param {{
 *   enabled: boolean,
 *   attemptKey: string | null,
 * }} params
 */
export function useMockTestInterstitial({ enabled, attemptKey: _attemptKey }) {
  const { user } = useAuth();
  const { eligible, isPremium } = useAdsEligibility({ screenAllowsAds: true });

  useEffect(() => {
    if (!enabled || isPremium || !eligible) return undefined;
    void preloadMockTestInterstitial({ user });
    return undefined;
  }, [enabled, eligible, isPremium, user]);
}
