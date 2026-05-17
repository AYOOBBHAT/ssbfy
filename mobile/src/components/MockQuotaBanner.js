import { View, Text } from 'react-native';
import { premiumStyles } from '../theme/premiumUi';
import { getQuotaStatusLine } from '../utils/mockQuotaCopy';

/**
 * Compact informational quota line (Tests header, Home mock row).
 * @param {{ quota: object | null, loading?: boolean }} props
 */
export function MockQuotaBanner({ quota, loading = false }) {
  if (loading) {
    return (
      <View style={[premiumStyles.quotaWrap, premiumStyles.quotaNeutral]}>
        <Text style={premiumStyles.quotaTextNeutral}>Checking mock quota…</Text>
      </View>
    );
  }

  const status = getQuotaStatusLine(quota);
  if (!status) return null;

  const wrapStyle =
    status.tone === 'exhausted'
      ? premiumStyles.quotaExhausted
      : status.tone === 'emphasis'
      ? premiumStyles.quotaEmphasis
      : premiumStyles.quotaNeutral;

  const textStyle =
    status.tone === 'emphasis'
      ? premiumStyles.quotaTextEmphasis
      : premiumStyles.quotaTextNeutral;

  return (
    <View style={[premiumStyles.quotaWrap, wrapStyle]}>
      <Text style={textStyle}>{status.line}</Text>
    </View>
  );
}
