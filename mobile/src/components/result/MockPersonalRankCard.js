import React, { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { resultPalette, resultShadows } from './resultTheme';
import { formatPersonalRankCopy } from '../../utils/mockPersonalRank';

/**
 * Personal standing for the current user only — not a leaderboard.
 */
function MockPersonalRankCard({ rank = null, loading = false }) {
  if (loading) {
    return (
      <View
        style={styles.card}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your rank"
      >
        <View style={styles.headingRow}>
          <Ionicons name="trophy-outline" size={16} color={resultPalette.navy800} />
          <Text style={styles.heading}>Your Rank</Text>
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="small" color={resultPalette.navy800} />
          <Text style={styles.loadingLabel}>Checking your standing…</Text>
        </View>
      </View>
    );
  }

  if (!rank) return null;

  const copy = formatPersonalRankCopy(rank);
  const a11y = copy.percentile
    ? `${copy.headline}, ${copy.rankLabel}, ${copy.standing}. ${copy.percentile}`
    : `${copy.headline}, ${copy.rankLabel}, ${copy.standing}`;

  return (
    <View style={styles.card} accessibilityLabel={a11y}>
      <View style={styles.headingRow}>
        <Ionicons
          name="trophy-outline"
          size={16}
          color={resultPalette.navy800}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.heading}>{copy.headline}</Text>
      </View>
      <Text style={styles.rankValue}>{copy.rankLabel}</Text>
      <Text style={styles.standing}>{copy.standing}</Text>
      {copy.percentile ? <Text style={styles.percentile}>{copy.percentile}</Text> : null}
    </View>
  );
}

export default memo(MockPersonalRankCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: resultPalette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: resultPalette.border,
    padding: 18,
    marginBottom: 18,
    marginTop: 4,
    ...resultShadows.card,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    color: resultPalette.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  rankValue: {
    fontSize: 36,
    fontWeight: '800',
    color: resultPalette.navy800,
    letterSpacing: -1,
    lineHeight: 42,
  },
  standing: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: resultPalette.text,
    lineHeight: 22,
  },
  percentile: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: resultPalette.textMid,
    lineHeight: 20,
  },
  loadingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  loadingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: resultPalette.textMid,
  },
});
