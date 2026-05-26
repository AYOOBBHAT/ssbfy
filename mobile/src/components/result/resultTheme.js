import { Platform } from 'react-native';
import { colors } from '../../theme/colors';

export const resultPalette = {
  background: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E5E7EB',
  text: '#111827',
  textMid: '#6B7280',
  textLight: '#9CA3AF',
  navy900: '#1C1C2E',
  navy800: '#2D2B55',
  navy700: '#3B3770',
  amber: '#D97706',
  success: colors.success,
  successSoft: colors.successSoft,
  warning: colors.warning,
  warningSoft: colors.warningSoft,
  danger: colors.danger,
  dangerSoft: colors.dangerSoft,
  white: '#FFFFFF',
};

export const resultShadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#111827',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  hero: Platform.select({
    ios: {
      shadowColor: '#111827',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 3,
    },
    default: {},
  }),
  badge: Platform.select({
    ios: {
      shadowColor: '#1C1C2E',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
};
