import { colors } from './colors';

/** Fullscreen startup splash — aligned with LoginScreen branding. */
export const splashTheme = {
  background: '#fafbff',
  brandName: colors.primaryText,
  word: colors.muted,
  wordEmphasis: colors.primary,
  accent: '#c9a227',
  loader: colors.primary,
  loaderTrack: 'rgba(37, 99, 235, 0.08)',
};

export const SPLASH_WORDS = ['Prepare', 'Practice', 'Succeed'];

/**
 * Startup motion — logo + motto overlap; slogan hold without feeling slow overall.
 * Sequence runs in parallel (see BrandSplashAnimation).
 */
export const SPLASH_TIMING = {
  logoDuration: 520,
  /** Motto begins while logo is still settling (not after logo finishes). */
  wordStartDelay: 300,
  wordStagger: 220,
  wordDuration: 280,
  /** Readable beat once full slogan is visible. */
  sequenceEndPadding: 680,
};

/** Spinner only if bootstrap exceeds ~1.1s after animation completes. */
export const BOOTSTRAP_LOADER_DELAY_MS = 1100;

/** Splash fade-out while app content fades in (cross-fade). */
export const SPLASH_EXIT_FADE_MS = 240;

/** App (Login/Home) fade-in — slightly offset for shared motion. */
export const APP_ENTER_FADE_MS = 280;

export const APP_ENTER_FADE_DELAY_MS = 50;

export function getSplashSequenceDurationMs() {
  const { wordStartDelay, wordStagger, wordDuration, sequenceEndPadding } = SPLASH_TIMING;
  const words = SPLASH_WORDS.length;
  const lastWordEnd =
    wordStartDelay + (words - 1) * wordStagger + wordDuration;
  return Math.max(SPLASH_TIMING.logoDuration, lastWordEnd) + sequenceEndPadding;
}

export function getSplashLogoSize(screenWidth, screenHeight) {
  const byWidth = screenWidth * 0.36;
  const byHeight = screenHeight * 0.17;
  return Math.round(Math.min(Math.max(byWidth, byHeight, 132), 168));
}

export function getSplashContentLift(screenHeight) {
  if (screenHeight >= 800) return Math.round(screenHeight * 0.02);
  if (screenHeight >= 680) return 4;
  return -4;
}
