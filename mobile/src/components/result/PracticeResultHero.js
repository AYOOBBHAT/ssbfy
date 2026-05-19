import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * Calmer practice-session hero — learning framing over giant score dominance.
 */
function PracticeResultHero({
  opacity,
  sessionLabel,
  sessionHint,
  heroCorrect,
  heroTotal,
  toImprove,
  heroAccuracy,
  tierMessage,
  tierColor,
  tierBg,
  timeLabel,
  children,
}) {
  return (
    <Animated.View
      style={[
        styles.heroCard,
        { borderColor: tierColor, backgroundColor: tierBg, opacity },
      ]}
    >
      <Text style={styles.sessionLabel}>{sessionLabel}</Text>
      <Text style={styles.sessionHint}>{sessionHint}</Text>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryMain}>
          <Text style={styles.summaryEmphasis}>{String(heroCorrect)}</Text> correct
          {toImprove > 0 ? (
            <>
              {' '}
              · <Text style={styles.summaryEmphasis}>{String(toImprove)}</Text> to improve
            </>
          ) : null}
        </Text>
        <View style={[styles.accuracyPill, { borderColor: tierColor }]}>
          <Text style={[styles.accuracyValue, { color: tierColor }]}>{String(heroAccuracy)}%</Text>
          <Text style={styles.accuracyLabel}>accuracy</Text>
        </View>
      </View>

      <Text style={[styles.encourage, { color: tierColor }]}>{tierMessage}</Text>
      {timeLabel ? <Text style={styles.timeMeta}>{timeLabel}</Text> : null}
      {children ? <View style={styles.children}>{children}</View> : null}
    </Animated.View>
  );
}

export default memo(PracticeResultHero);

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    marginBottom: 12,
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },
  sessionHint: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  summaryMain: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
  },
  summaryEmphasis: {
    fontWeight: '800',
    fontSize: 18,
  },
  accuracyPill: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    minWidth: 72,
  },
  accuracyValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  accuracyLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  encourage: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    lineHeight: 20,
  },
  timeMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    fontWeight: '500',
  },
  children: {
    marginTop: 10,
  },
});
