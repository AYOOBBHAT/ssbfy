import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userHasPremiumAccess } from '../../utils/premiumAccess';
import {
  canRequestAdsNow,
  initializeMobileAds,
  isMobileAdsInitialized,
} from './mobileAdsInit';
import {
  logInterstitialUnitModeBreadcrumb,
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
 * Preloads interstitial for free users once SDK + consent allow it.
 */
export function AdsReadyProvider({ children }) {
  const { initializing, user, isAuthenticated } = useAuth();
  const [adsReady, setAdsReady] = useState(() => isMobileAdsInitialized());
  const [adsInitAttempted, setAdsInitAttempted] = useState(() => isMobileAdsInitialized());
  const unitModeLoggedRef = useRef(false);

  useEffect(() => {
    if (initializing) return undefined;
    let cancelled = false;

    void (async () => {
      const ok = await initializeMobileAds();
      if (cancelled) return;
      setAdsInitAttempted(true);
      setAdsReady(!!ok);
      onPremiumStatusChanged(user);

      if (!unitModeLoggedRef.current) {
        unitModeLoggedRef.current = true;
        try {
          logInterstitialUnitModeBreadcrumb();
        } catch {
          /* ignore */
        }
      }

      if (
        ok &&
        canRequestAdsNow() &&
        isAuthenticated &&
        !userHasPremiumAccess(user)
      ) {
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
    // When a free user becomes available after init, warm the interstitial.
    if (
      isMobileAdsInitialized() &&
      canRequestAdsNow() &&
      isAuthenticated &&
      !userHasPremiumAccess(user)
    ) {
      void preloadMockTestInterstitial({ user });
    }
  }, [initializing, user, isAuthenticated]);

  const value = useMemo(
    () => ({ adsReady, adsInitAttempted }),
    [adsReady, adsInitAttempted]
  );

  return <AdsReadyContext.Provider value={value}>{children}</AdsReadyContext.Provider>;
}

export function useAdsReady() {
  return useContext(AdsReadyContext);
}
