import { colors } from './colors';

/** Fullscreen startup splash — aligned with LoginScreen branding. */
export const splashTheme = {
  background: '#fafbff',
  brandName: colors.primaryText,
  word: colors.muted,
  wordEmphasis: colors.primary,
  accent: '#c9a227',
  loader: colors.primary,
  /** Subtle track behind bootstrap spinner (Android visibility). */
  loaderTrack: 'rgba(37, 99, 235, 0.12)',
};

export const SPLASH_WORDS = ['Prepare', 'Practice', 'Succeed'];

/**
 * Animation timing (ms) — ~1.85s sequence; exit fade handled separately.
 * Slightly snappier than v1 to avoid a “frozen” feel after the last word.
 */
export const SPLASH_TIMING = {
  logoDuration: 620,
  wordStagger: 240,
  wordDuration: 260,
  wordStartDelay: 560,
  /** Hold after full slogan so “Prepare • Practice • Succeed” registers (~600ms). */
  sequenceEndPadding: 600,
};

/** Only show bootstrap spinner if auth is still pending after this delay. */
export const BOOTSTRAP_LOADER_DELAY_MS = 420;

/** Cross-fade into Login/Home when bootstrap is ready. */
export const SPLASH_EXIT_FADE_MS = 140;

export function getSplashSequenceDurationMs() {
  const { wordStartDelay, wordStagger, wordDuration, sequenceEndPadding } = SPLASH_TIMING;
  const words = SPLASH_WORDS.length;
  return wordStartDelay + (words - 1) * wordStagger + wordDuration + sequenceEndPadding;
}

/** Responsive logo — premium on tall phones, safe on small widths. */
export function getSplashLogoSize(screenWidth, screenHeight) {
  const byWidth = screenWidth * 0.36;
  const byHeight = screenHeight * 0.17;
  return Math.round(Math.min(Math.max(byWidth, byHeight, 132), 168));
}

/** Vertical nudge — balanced on tall screens (avoid top-heavy splash). */
export function getSplashContentLift(screenHeight) {
  if (screenHeight >= 800) return Math.round(screenHeight * 0.02);
  if (screenHeight >= 680) return 4;
  return -4;
}
