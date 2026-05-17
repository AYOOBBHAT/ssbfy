import { Platform, StyleSheet } from 'react-native';
import { colors } from './colors';

/**
 * Shared monetization / premium visual language — soft blue primary,
 * subtle gold accent, calm elevated cards (no neon green / indigo SaaS).
 */
export const premiumUi = {
  radius: { card: 14, banner: 16, btn: 12, icon: 12, pill: 10 },
  accentStripe: 3,
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
});

export const premiumStyles = StyleSheet.create({
  /** Notes / PDF inline upsell */
  upsellCard: {
    backgroundColor: colors.card,
    borderRadius: premiumUi.radius.card,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.accent,
    ...cardShadow,
  },
  upsellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upsellIconWrap: {
    width: 40,
    height: 40,
    borderRadius: premiumUi.radius.icon,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellBody: { flex: 1, minWidth: 0 },
  upsellTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  upsellSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 18,
  },

  /** Home explore-premium row */
  homeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: premiumUi.radius.banner,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.accent,
    ...cardShadow,
  },
  homeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: premiumUi.radius.icon,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  homeBody: { flex: 1 },
  homeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  homeSub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },

  /** Primary monetization CTA */
  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: premiumUi.radius.btn,
    marginTop: 12,
  },
  ctaButtonText: {
    color: colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  /** Quota info banners */
  quotaWrap: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  quotaNeutral: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  quotaEmphasis: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.accent,
  },
  quotaExhausted: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.muted,
  },
  quotaTextNeutral: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    fontWeight: '500',
  },
  quotaTextEmphasis: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },

  /** Exhausted mock card */
  exhaustedCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.primary,
    ...cardShadow,
  },
  exhaustedCardCompact: {
    marginBottom: 12,
  },

  /** Premium screen benefit row */
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  benefitIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
  },

  /** Premium active / success hero */
  statusWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusIconRingGold: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusSub: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 320,
  },

  contextBanner: {
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: premiumUi.accentStripe,
    borderLeftColor: colors.primary,
    marginBottom: 20,
    lineHeight: 20,
  },

  benefitsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
    ...cardShadow,
  },
  benefitsHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },

  recBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
});
