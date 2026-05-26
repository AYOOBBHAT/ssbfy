import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RETRY_SESSION_BADGE } from '../../utils/retrySessionPresentation';
import { resultPalette, resultShadows } from '../result/resultTheme';

function RetrySessionBanner({ scopeLine, pacingLine, sourceLine }) {
  return (
    <View style={styles.banner}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="refresh-outline" size={12} color={resultPalette.navy800} />
          <Text style={styles.badgeText}>{RETRY_SESSION_BADGE}</Text>
        </View>
        {pacingLine ? <Text style={styles.pacing}>{pacingLine}</Text> : null}
      </View>
      {sourceLine ? (
        <Text style={styles.source} numberOfLines={1}>
          {sourceLine}
        </Text>
      ) : null}
      {scopeLine ? (
        <Text style={styles.scope} numberOfLines={2}>
          {scopeLine}
        </Text>
      ) : null}
    </View>
  );
}

export default memo(RetrySessionBanner);

const styles = StyleSheet.create({
  banner: {
    backgroundColor: resultPalette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: resultPalette.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    ...resultShadows.card,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: resultPalette.surfaceAlt,
    borderWidth: 1,
    borderColor: resultPalette.border,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: resultPalette.navy800,
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  pacing: {
    fontSize: 12,
    fontWeight: '600',
    color: resultPalette.textMid,
  },
  source: {
    fontSize: 14,
    fontWeight: '700',
    color: resultPalette.text,
    marginTop: 10,
  },
  scope: {
    fontSize: 13,
    color: resultPalette.textMid,
    marginTop: 6,
    lineHeight: 19,
  },
});
