import React, { memo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { resultPalette, resultShadows } from './resultTheme';

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
      style={[styles.heroCard, { opacity }]}
    >
      <View style={[styles.heroAccent, { backgroundColor: tierBg }]} />
      <Text style={styles.sessionLabel}>{sessionLabel}</Text>
      <Text style={styles.sessionHint} numberOfLines={2}>
        {sessionHint}
      </Text>

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
        <View style={styles.accuracyPill}>
          <Text style={styles.accuracyEyebrow}>Accuracy</Text>
          <Text style={styles.accuracyValue}>{String(heroAccuracy)}%</Text>
          <Text style={styles.accuracyLabel}>session</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.encourage, { color: tierColor }]}>{tierMessage}</Text>
        {timeLabel ? <Text style={styles.timeMeta}>{timeLabel}</Text> : null}
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </Animated.View>
  );
}

export default memo(PracticeResultHero);

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
    width: 76,
    height: 6,
    borderRadius: 999,
    marginBottom: 14,
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
  accuracyPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: resultPalette.navy900,
    minWidth: 72,
    ...resultShadows.badge,
  },
  accuracyValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: resultPalette.white,
  },
  accuracyEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginBottom: 4,
  },
  accuracyLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metaRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: resultPalette.border,
  },
  encourage: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  timeMeta: {
    fontSize: 12,
    color: resultPalette.textMid,
    marginTop: 8,
    fontWeight: '600',
  },
  children: {
    marginTop: 14,
  },
});
