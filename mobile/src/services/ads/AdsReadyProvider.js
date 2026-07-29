import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userHasPremiumAccess } from '../../utils/premiumAccess';
import { initializeMobileAds, isMobileAdsInitialized } from './mobileAdsInit';
import {
  onPremiumStatusChanged,
  preloadMockTestInterstitial,
} from './interstitialAdService';

const AdsReadyContext = createContext({
  adsReady: false,
  adsInitAttempted: false,
});

/**
 * Tracks Mobile Ads init completion so eligibility hooks re-render.
 * Does not block splash; init is fire-and-forget after auth.
 */
export function AdsReadyProvider({ children }) {
  const { initializing, user, isAuthenticated } = useAuth();
  const [adsReady, setAdsReady] = useState(() => isMobileAdsInitialized());
  const [adsInitAttempted, setAdsInitAttempted] = useState(() => isMobileAdsInitialized());

  useEffect(() => {
    if (initializing) return undefined;
    let cancelled = false;

    void (async () => {
      const ok = await initializeMobileAds();
      if (cancelled) return;
      setAdsInitAttempted(true);
      setAdsReady(!!ok);
      onPremiumStatusChanged(user);
      if (ok && isAuthenticated && !userHasPremiumAccess(user)) {
        void preloadMockTestInterstitial({ user });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initializing, user, isAuthenticated]);

  useEffect(() => {
    if (initializing) return;
    onPremiumStatusChanged(user);
  }, [initializing, user]);

  const value = useMemo(
    () => ({ adsReady, adsInitAttempted }),
    [adsReady, adsInitAttempted]
  );

  return <AdsReadyContext.Provider value={value}>{children}</AdsReadyContext.Provider>;
}

export function useAdsReady() {
  return useContext(AdsReadyContext);
}
