import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaDevLog } from '../utils/safeAreaDevLog';

/** Minimum breathing room above the system gesture / nav bar. */
export const BOTTOM_ACTION_BASE_PADDING = 12;

/**
 * On some Android builds insets.bottom is 0 until edge-to-edge; use a small floor.
 */
const ANDROID_MIN_BOTTOM_INSET = 8;

/**
 * Shared bottom inset strategy for fixed footers and scroll content clearance.
 *
 * @param {{ extraScrollPadding?: number }} [options]
 */
export function useBottomSafeInsets(options = {}) {
  const insets = useSafeAreaInsets();
  const { extraScrollPadding = 0 } = options;

  return useMemo(() => {
    const rawBottom = Number(insets.bottom) || 0;
    const bottom =
      Platform.OS === 'android'
        ? Math.max(rawBottom, ANDROID_MIN_BOTTOM_INSET)
        : rawBottom;

    const actionBarPadding = bottom + BOTTOM_ACTION_BASE_PADDING;
    const scrollContentPadding = actionBarPadding + extraScrollPadding;

    return {
      insets,
      bottom,
      actionBarPadding,
      scrollContentPadding,
      /** Style fragment for fixed bottom action stacks. */
      actionBarStyle: { paddingBottom: actionBarPadding },
      /** Style fragment for ScrollView / FlatList contentContainerStyle. */
      scrollContentStyle: { paddingBottom: scrollContentPadding },
    };
  }, [insets.bottom, extraScrollPadding]);
}

/**
 * Logs inset values once per screen mount in DEV (optional screenKey label).
 */
export function useBottomSafeInsetsDevLog(screenKey, metrics) {
  useEffect(() => {
    if (!__DEV__ || !screenKey) return;
    safeAreaDevLog('insets_resolved', {
      screen: screenKey,
      bottom: metrics?.bottom,
      actionBarPadding: metrics?.actionBarPadding,
      scrollContentPadding: metrics?.scrollContentPadding,
    });
  }, [screenKey, metrics?.bottom, metrics?.actionBarPadding, metrics?.scrollContentPadding]);
}
