import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { RETRY_SESSION_BADGE } from '../../utils/retrySessionPresentation';

function RetrySessionBanner({ scopeLine, pacingLine, sourceLine }) {
  return (
    <View style={styles.banner}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="refresh-outline" size={12} color={colors.primaryText} />
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
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryText,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  pacing: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  source: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: 6,
  },
  scope: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 17,
  },
});
