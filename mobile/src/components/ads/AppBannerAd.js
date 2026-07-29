import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAdUnitId, sanitizeAdUnitIdForLog } from '../../config/admob';
import { useAdsEligibility } from '../../hooks/useAdsEligibility';
import { getAdsRequestOptions } from '../../services/ads/adsConsentGate';
import { getGoogleMobileAdsModule } from '../../services/ads/adsNative';
import logger from '../../utils/logger';

/**
 * @typedef {'home' | 'profile' | 'notes'} BannerPlacement
 */

const PLACEMENT_TO_KEY = {
  home: 'homeBanner',
  profile: 'profileBanner',
  notes: 'notesBanner',
};

/**
 * Adaptive anchored banner for Home / Profile / Notes listing.
 * Renders nothing when ineligible, premium unresolved, or load fails.
 *
 * @param {{ placement: BannerPlacement, style?: object }} props
 */
function AppBannerAdImpl({ placement, style }) {
  const { eligible, premiumUnresolved, canRequestAds } = useAdsEligibility({
    screenAllowsAds: true,
  });
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const ads = getGoogleMobileAdsModule();
  const unitId = useMemo(() => {
    const key = PLACEMENT_TO_KEY[placement];
    return key ? getAdUnitId(key) : null;
  }, [placement]);

  const onFailed = useCallback(
    (err) => {
      setFailed(true);
      setLoaded(false);
      if (__DEV__) {
        logger.warn('[ads] banner failed', {
          placement,
          unit: sanitizeAdUnitIdForLog(unitId),
          code: err?.code ?? null,
          message: err?.message ? String(err.message).slice(0, 120) : 'unknown',
        });
      }
    },
    [placement, unitId]
  );

  const onLoaded = useCallback(() => {
    setLoaded(true);
    if (__DEV__) {
      logger.debug('[ads] banner loaded', {
        placement,
        unit: sanitizeAdUnitIdForLog(unitId),
      });
    }
  }, [placement, unitId]);

  if (premiumUnresolved || !eligible || !canRequestAds || failed || !unitId || !ads) {
    return null;
  }

  const { BannerAd, BannerAdSize } = ads;
  if (!BannerAd || !BannerAdSize) return null;

  const size =
    BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER ||
    BannerAdSize.ANCHORED_ADAPTIVE_BANNER ||
    BannerAdSize.BANNER;

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0) },
        style,
      ]}
      pointerEvents={loaded ? 'box-none' : 'none'}
    >
      <BannerAd
        unitId={unitId}
        size={size}
        requestOptions={getAdsRequestOptions()}
        onAdLoaded={onLoaded}
        onAdFailedToLoad={onFailed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
    overflow: 'hidden',
  },
});

export const AppBannerAd = memo(AppBannerAdImpl);
export default AppBannerAd;
