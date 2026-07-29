import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import logger from '../utils/logger';
import {
  consumeMockInterstitialOpportunity,
  shouldOfferMockInterstitial,
} from '../services/ads/mockTestAdCounter';
import {
  isMockTestInterstitialLoaded,
  preloadMockTestInterstitial,
  showMockTestInterstitialIfReady,
} from '../services/ads/interstitialAdService';
import { useAdsEligibility } from './useAdsEligibility';

/**
 * After a standard mock Result is stable, maybe show an interstitial
 * (every 3rd successful completion). Never blocks UI.
 *
 * @param {{
 *   enabled: boolean,
 *   attemptKey: string | null,
 * }} params
 */
export function useMockTestInterstitial({ enabled, attemptKey }) {
  const { user } = useAuth();
  const { eligible, isPremium } = useAdsEligibility({ screenAllowsAds: true });
  const handledRef = useRef(/** @type {string | null} */ (null));

  useEffect(() => {
    if (isPremium) return undefined;
    if (!eligible) return undefined;
    void preloadMockTestInterstitial({ user });
    return undefined;
  }, [eligible, isPremium, user]);

  useEffect(() => {
    if (!enabled || !attemptKey) return undefined;
    if (isPremium || userHasPremiumAccess(user)) return undefined;
    if (handledRef.current === attemptKey) return undefined;

    let cancelled = false;
    let timer = null;

    const run = async () => {
      try {
        const offer = await shouldOfferMockInterstitial(attemptKey);
        if (cancelled || !offer) return;

        // Wait until Result has painted and interactions settle.
        await new Promise((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
        if (cancelled) return;

        // Small delay so Result content is visible before any full-screen ad.
        await new Promise((resolve) => {
          timer = setTimeout(resolve, 700);
        });
        if (cancelled) return;

        handledRef.current = attemptKey;

        if (!isMockTestInterstitialLoaded()) {
          await consumeMockInterstitialOpportunity(attemptKey, { shown: false });
          if (__DEV__) {
            logger.debug('[ads] interstitial skipped — not loaded');
          }
          void preloadMockTestInterstitial({ force: true, user });
          return;
        }

        const result = await showMockTestInterstitialIfReady({ user });
        const shown = result === 'shown';
        await consumeMockInterstitialOpportunity(attemptKey, { shown });
        if (__DEV__) {
          logger.debug('[ads] interstitial opportunity result', { result });
        }
        if (!shown) {
          void preloadMockTestInterstitial({ force: true, user });
        }
      } catch (e) {
        if (__DEV__) {
          logger.warn('[ads] mock interstitial hook error', {
            message: e?.message ? String(e.message).slice(0, 120) : 'unknown',
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, attemptKey, isPremium, user, eligible]);
}
