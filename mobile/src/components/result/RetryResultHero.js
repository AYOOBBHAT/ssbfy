import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { RETRY_SESSION_BADGE } from '../../utils/retrySessionPresentation';

/**
 * Calmer hero for focused retry completion on ResultScreen.
 */
function RetryResultHero({
  opacity,
  sessionHint,
  heroCorrect,
  heroTotal,
  stillRevisit,
  heroAccuracy,
  tierMessage,
  tierColor,
  tierBg,
  progressLine,
}) {
  return (
    <Animated.View
      style={[
        styles.heroCard,
        { borderColor: tierColor, backgroundColor: tierBg, opacity },
      ]}
    >
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-done-outline" size={12} color={colors.primaryText} />
          <Text style={styles.badgeText}>{RETRY_SESSION_BADGE}</Text>
        </View>
        <Text style={styles.sessionLabel}>Second attempt complete</Text>
      </View>

      {sessionHint ? (
        <Text style={styles.sessionHint} numberOfLines={2}>
          {sessionHint}
        </Text>
      ) : null}

      <View style={styles.summaryRow}>
        <Text style={styles.summaryMain}>
          <Text style={styles.summaryEmphasis}>{String(heroCorrect)}</Text> recovered
          {stillRevisit > 0 ? (
            <>
              {' '}
              · <Text style={styles.summaryEmphasis}>{String(stillRevisit)}</Text> to revisit
            </>
          ) : null}
        </Text>
        <View style={[styles.scorePill, { borderColor: tierColor }]}>
          <Text style={[styles.scoreValue, { color: tierColor }]}>{String(heroAccuracy)}%</Text>
          <Text style={styles.scoreLabel}>this round</Text>
        </View>
      </View>

      {progressLine ? <Text style={styles.progressLine}>{progressLine}</Text> : null}

      <Text style={[styles.encourage, { color: tierColor }]}>{tierMessage}</Text>
    </Animated.View>
  );
}

export default memo(RetryResultHero);

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
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
    backgroundColor: 'rgba(255,255,255,0.7)',
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
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  sessionHint: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    lineHeight: 19,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  summaryMain: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
  },
  summaryEmphasis: {
    fontWeight: '800',
    fontSize: 17,
  },
  scorePill: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    minWidth: 64,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  progressLine: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 10,
    fontWeight: '500',
  },
  encourage: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 20,
  },
});
