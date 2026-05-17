import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { getQuotaStatusLine } from '../utils/mockQuotaCopy';

/**
 * Compact informational quota line (Tests header, Home mock row).
 * @param {{ quota: object | null, loading?: boolean }} props
 */
export function MockQuotaBanner({ quota, loading = false }) {
  if (loading) {
    return (
      <View style={[styles.wrap, styles.wrapNeutral]}>
        <Text style={styles.textMuted}>Checking mock quota…</Text>
      </View>
    );
  }

  const status = getQuotaStatusLine(quota);
  if (!status) return null;

  const wrapStyle =
    status.tone === 'exhausted'
      ? styles.wrapExhausted
      : status.tone === 'emphasis'
      ? styles.wrapEmphasis
      : styles.wrapNeutral;

  const textStyle =
    status.tone === 'exhausted'
      ? styles.textExhausted
      : status.tone === 'emphasis'
      ? styles.textEmphasis
      : styles.textNeutral;

  return (
    <View style={[styles.wrap, wrapStyle]}>
      <Text style={textStyle}>{status.line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  wrapNeutral: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  wrapEmphasis: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  wrapExhausted: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  textNeutral: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    fontWeight: '500',
  },
  textEmphasis: {
    fontSize: 13,
    color: colors.primaryText,
    lineHeight: 18,
    fontWeight: '600',
  },
  textExhausted: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    fontWeight: '500',
  },
  textMuted: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
});
