import { StyleSheet } from 'react-native';
import { colors } from './colors';

/** Shared auth screen surface — matches splash for smooth transitions. */
export const authScreenBg = '#fafbff';

export const authMottoDot = '#c9a227';

/**
 * Tall-screen balance — nudge content down slightly so auth feels centered, not top-heavy.
 */
export function getAuthScrollInsets(screenHeight, flow = false) {
  const baseTop = flow ? 4 : 12;
  const baseBottom = flow ? 32 : 28;
  let paddingTop = baseTop;
  if (screenHeight >= 820) {
    paddingTop = flow ? Math.round(screenHeight * 0.05) : Math.round(screenHeight * 0.055);
  } else if (screenHeight >= 700) {
    paddingTop = flow ? 28 : 32;
  }
  return {
    paddingTop,
    paddingBottom: baseBottom,
    minScrollHeight: screenHeight >= 700 ? screenHeight * 0.72 : undefined,
  };
}

export const authStyles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: authScreenBg,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  scrollFlow: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 8,
    minHeight: 44,
  },
  backLabel: {
    marginLeft: 4,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  brandName: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: 2.5,
  },
  mottoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  mottoPart: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.25,
  },
  mottoDot: {
    fontSize: 12,
    fontWeight: '700',
    color: authMottoDot,
  },
  screenSubtitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryText,
    textAlign: 'center',
  },
  flowTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  flowSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 18,
    lineHeight: 21,
  },
  emailEm: {
    color: colors.text,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.07)',
    padding: 20,
    shadowColor: colors.primaryText,
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 2,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  infoBanner: {
    backgroundColor: colors.primarySoft,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  infoText: {
    color: colors.primaryText,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  primaryCta: {
    marginTop: 4,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  primaryCtaText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 16,
    paddingVertical: 6,
  },
  forgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  switchMuted: { color: colors.muted, fontSize: 15 },
  switchLink: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  linkRow: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  linkTextDisabled: { color: colors.muted, fontWeight: '600' },
  mutedLink: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  footerLegal: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 11,
    marginTop: 20,
    paddingHorizontal: 8,
    lineHeight: 16,
  },
  passwordHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 12,
    fontWeight: '500',
  },
  passwordHintOk: { color: colors.primary, fontWeight: '600' },
  fieldHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 12,
    lineHeight: 16,
  },
});
