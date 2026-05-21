import { Platform } from 'react-native';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Native stack header body height (below status bar). */
export const STACK_HEADER_BODY_HEIGHT = 56;

/**
 * iOS uses KeyboardAvoidingView padding; Android relies on adjustResize (app.json).
 * Using KAV on Android with edge-to-edge often causes double-shift / jumpiness.
 */
export const KEYBOARD_AVOID_BEHAVIOR = Platform.select({
  ios: 'padding',
  android: undefined,
});

export const KEYBOARD_OFFSET_PRESETS = {
  none: 'none',
  auth: 'auth',
  stackHeader: 'stackHeader',
};

/**
 * Centralized keyboardVerticalOffset for KeyboardAvoidingView (iOS only).
 */
export function useKeyboardVerticalOffset(preset = KEYBOARD_OFFSET_PRESETS.none) {
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    if (Platform.OS !== 'ios') return 0;

    switch (preset) {
      case KEYBOARD_OFFSET_PRESETS.auth:
        return 4;
      case KEYBOARD_OFFSET_PRESETS.stackHeader:
        return insets.top + STACK_HEADER_BODY_HEIGHT;
      default:
        return 0;
    }
  }, [preset, insets.top]);
}

/** Delay before scrolling to a focused field (keyboard animation). */
export function getScrollToFieldDelay() {
  return Platform.OS === 'android' ? 120 : 60;
}
