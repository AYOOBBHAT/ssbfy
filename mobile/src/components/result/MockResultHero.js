import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';

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
      style={[
        styles.heroCard,
        { borderColor: tierColor, backgroundColor: tierBg, opacity },
      ]}
    >
      <View style={styles.examBadgeRow}>
        <View style={styles.examBadge}>
          <Ionicons name="timer-outline" size={13} color={colors.primaryText} />
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
        <View style={[styles.scorePill, { borderColor: tierColor }]}>
          <Text style={[styles.scoreValue, { color: tierColor }]}>{String(heroAccuracy)}%</Text>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
      </View>

      {pacingLine ? (
        <View style={styles.pacingRow}>
          <Ionicons name="speedometer-outline" size={14} color={colors.muted} />
          <Text style={styles.pacingText}>{pacingLine}</Text>
        </View>
      ) : null}

      <Text style={[styles.readiness, { color: tierColor }]}>{tierMessage}</Text>
      {children ? <View style={styles.children}>{children}</View> : null}
    </Animated.View>
  );
}

export default memo(MockResultHero);

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  examBadgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  examBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  examBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryText,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  sessionHint: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
    lineHeight: 20,
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
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    minWidth: 68,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  pacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  pacingText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
    flex: 1,
  },
  readiness: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 20,
  },
  children: {
    marginTop: 10,
  },
});
