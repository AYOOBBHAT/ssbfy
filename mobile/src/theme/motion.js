import { Platform } from 'react-native';
import { colors } from './colors';

/**
 * Shared motion language — calm, responsive, study-first.
 * Prefer default native push for tool flows; use fades sparingly.
 */
export const motion = {
  duration: {
    press: 120,
    fast: 180,
    resultFade: 200,
    screen: 280,
  },
  press: {
    opacity: 0.9,
    cardOpacity: 0.92,
  },
  disabled: {
    opacity: 0.55,
  },
  screen: {
    background: colors.bg,
    authBackground: '#fafbff',
  },
};

/** Bottom tabs — avoid white flash between tab roots. */
export const tabSceneStyle = {
  backgroundColor: colors.bg,
};

/**
 * Native stack transitions.
 * - defaultPush: study/tool screens (fast, utility feel)
 * - resultReveal: single short fade after test completion only
 */
export const stackMotion = {
  defaultPush: { animation: 'default' },
  resultReveal: Platform.select({
    ios: { animation: 'fade', animationDuration: motion.duration.resultFade },
    android: { animation: 'fade' },
    default: { animation: 'fade' },
  }),
};

export const stackContentStyle = {
  backgroundColor: colors.bg,
};
