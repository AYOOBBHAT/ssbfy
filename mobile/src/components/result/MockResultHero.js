import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resultPalette, resultShadows } from './resultTheme';

/**
 * Exam-oriented mock hero — timed assessment framing, calmer score hierarchy.
 */
function MockResultHero({
  opacity,
  sessionLabel,
  examHint,
  heroCorrect,
  heroTotal,
  toImprove,
  heroAccuracy,
  tierMessage,
  tierColor,
  tierBg,
  pacingLine,
  children,
}) {
  return (
    <Animated.View
      style={[styles.heroCard, { opacity }]}
    >
      <View style={[styles.heroAccent, { backgroundColor: tierBg }]} />
      <View style={styles.examBadgeRow}>
        <View style={styles.examBadge}>
          <Ionicons name="timer-outline" size={13} color={resultPalette.navy800} />
          <Text style={styles.examBadgeText}>Timed mock</Text>
        </View>
      </View>

      <Text style={styles.sessionLabel}>{sessionLabel}</Text>
      <Text style={styles.sessionHint} numberOfLines={2}>
        {examHint}
      </Text>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryMain}>
          <Text style={styles.summaryEmphasis}>{String(heroCorrect)}</Text> correct
          {toImprove > 0 ? (
            <>
              {' '}
              · <Text style={styles.summaryEmphasis}>{String(toImprove)}</Text> to revisit
            </>
          ) : null}
        </Text>
        <View style={styles.scorePill}>
          <Text style={styles.scoreEyebrow}>Score</Text>
          <Text style={styles.scoreValue}>{String(heroAccuracy)}%</Text>
          <Text style={styles.scoreLabel}>exam pace</Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        {pacingLine ? (
          <View style={styles.pacingRow}>
            <Ionicons name="speedometer-outline" size={14} color={resultPalette.textMid} />
            <Text style={styles.pacingText}>{pacingLine}</Text>
          </View>
        ) : null}
        <Text style={[styles.readiness, { color: tierColor }]}>{tierMessage}</Text>
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </Animated.View>
  );
}

export default memo(MockResultHero);

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
  examBadgeRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  examBadge: {
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
  examBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: resultPalette.navy800,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: resultPalette.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  sessionHint: {
    fontSize: 20,
    fontWeight: '700',
    color: resultPalette.text,
    marginTop: 8,
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
    minWidth: 68,
    ...resultShadows.badge,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
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
    letterSpacing: 0.65,
  },
  metaBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: resultPalette.border,
  },
  pacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pacingText: {
    fontSize: 12,
    color: resultPalette.textMid,
    fontWeight: '600',
    flex: 1,
  },
  readiness: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 20,
  },
  children: {
    marginTop: 14,
  },
});
