import { colors } from '../theme/colors';

/**
 * Subtle per-session visual identity using the app palette.
 * @param {'daily'|'smart'|'weak'|'mock'|'retry'|'topic'|'practice'|string} kind
 */
export function getSessionActivityVisual(kind) {
  const key = String(kind || 'practice').toLowerCase();

  switch (key) {
    case 'daily':
      return {
        icon: 'sunny-outline',
        iconBg: colors.accentSoft,
        iconColor: colors.accent,
        chipBg: colors.accentSoft,
        chipText: colors.text,
      };
    case 'smart':
      return {
        icon: 'bulb-outline',
        iconBg: colors.primarySoft,
        iconColor: colors.primary,
        chipBg: colors.primarySoft,
        chipText: colors.primaryText,
      };
    case 'weak':
      return {
        icon: 'fitness-outline',
        iconBg: colors.warningSoft,
        iconColor: colors.warning,
        chipBg: colors.warningSoft,
        chipText: colors.text,
      };
    case 'retry':
      return {
        icon: 'refresh-outline',
        iconBg: colors.primarySoft,
        iconColor: colors.primary,
        chipBg: colors.bg,
        chipText: colors.text,
      };
    case 'mock':
      return {
        icon: 'document-text-outline',
        iconBg: colors.primarySoft,
        iconColor: colors.primary,
        chipBg: colors.primarySoft,
        chipText: colors.primaryText,
      };
    case 'topic':
      return {
        icon: 'book-outline',
        iconBg: colors.bg,
        iconColor: colors.muted,
        chipBg: colors.bg,
        chipText: colors.text,
      };
    default:
      return {
        icon: 'school-outline',
        iconBg: colors.bg,
        iconColor: colors.muted,
        chipBg: colors.bg,
        chipText: colors.text,
      };
  }
}
