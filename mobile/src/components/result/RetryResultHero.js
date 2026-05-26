import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RETRY_SESSION_BADGE } from '../../utils/retrySessionPresentation';
import { resultPalette, resultShadows } from './resultTheme';

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
      style={[styles.heroCard, { opacity }]}
    >
      <View style={[styles.heroAccent, { backgroundColor: tierBg }]} />
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-done-outline" size={12} color={resultPalette.navy800} />
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
        <View style={styles.scorePill}>
          <Text style={styles.scoreEyebrow}>Accuracy</Text>
          <Text style={styles.scoreValue}>{String(heroAccuracy)}%</Text>
          <Text style={styles.scoreLabel}>this round</Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        {progressLine ? <Text style={styles.progressLine}>{progressLine}</Text> : null}
        <Text style={[styles.encourage, { color: tierColor }]}>{tierMessage}</Text>
      </View>
    </Animated.View>
  );
}

export default memo(RetryResultHero);

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: resultPalette.surface,
    borderColor: resultPalette.border,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    ...resultShadows.hero,
  },
  heroAccent: {
    width: 84,
    height: 6,
    borderRadius: 999,
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
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: resultPalette.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionHint: {
    fontSize: 20,
    fontWeight: '700',
    color: resultPalette.text,
    marginTop: 10,
    lineHeight: 27,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 18,
  },
  summaryMain: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: resultPalette.text,
    lineHeight: 25,
  },
  summaryEmphasis: {
    fontWeight: '800',
    fontSize: 22,
  },
  scorePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: resultPalette.navy900,
    minWidth: 64,
    ...resultShadows.badge,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    color: resultPalette.white,
  },
  scoreEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  metaBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: resultPalette.border,
  },
  progressLine: {
    fontSize: 12,
    color: resultPalette.textMid,
    fontWeight: '600',
  },
  encourage: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 20,
  },
});
