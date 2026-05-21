import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { pressCardStyle } from '../../utils/pressFeedback';
import { formatActivityClock } from '../../utils/activityTimeFormat';
import { useBattleHistory } from '../../hooks/useBattleHistory';
import { battleHistoryDevLog } from '../../utils/battleHistoryDevLog';
import { getSessionActivityVisual } from '../../utils/sessionActivityVisual';

function SummaryStat({ label, value, accent }) {
  return (
    <View style={[styles.statCell, accent && styles.statCellAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function scoreChipForRow(row) {
  if (row.uxStatus === 'completed') {
    if (row.outcome === 'win') return 'Win';
    if (row.outcome === 'loss') return 'Loss';
    if (row.outcome === 'tie') return 'Tie';
  }
  if (row.uxStatus === 'awaiting_opponent') return 'Wait';
  if (row.uxStatus === 'waiting') return 'Invite';
  if (row.uxStatus === 'active') return 'Play';
  if (row.uxStatus === 'expired') return 'End';
  return '—';
}

function rowVisualKind(row) {
  if (row.uxStatus === 'completed') {
    if (row.outcome === 'win') return 'win';
    if (row.outcome === 'loss') return 'loss';
    return 'tie';
  }
  return 'pending';
}

function battleMeta(row) {
  const parts = [];
  if (row.topicLabel) parts.push(row.topicLabel);
  if (row.scoreLine && row.uxStatus === 'completed') parts.push(row.scoreLine);
  const clock = formatActivityClock(row.updatedAt || row.createdAt);
  if (clock) parts.push(clock);
  return parts.filter(Boolean).join(' · ');
}

function BattleCard({ row, onPress }) {
  const visual = getSessionActivityVisual(rowVisualKind(row));
  const canOpen = row.uxStatus !== 'expired' || row.reopenAction === 'lobby';

  return (
    <Pressable
      onPress={() => onPress(row)}
      disabled={!canOpen}
      style={({ pressed }) => [styles.battleRowWrap, pressCardStyle(pressed)]}
    >
      <View style={styles.battleRowInner}>
        <View style={[styles.battleIcon, { backgroundColor: visual.iconBg }]}>
          <Ionicons name={visual.icon} size={18} color={visual.iconColor} />
        </View>
        <View style={styles.battleBody}>
          <Text style={styles.battleHeadline} numberOfLines={2}>
            {row.headline}
          </Text>
          <Text style={styles.battleMeta} numberOfLines={1}>
            {battleMeta(row)}
          </Text>
        </View>
        <View style={styles.battleTrailing}>
          <View style={[styles.outcomeChip, { backgroundColor: visual.chipBg }]}>
            <Text style={[styles.outcomeChipText, { color: visual.chipText }]}>
              {scoreChipForRow(row)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </View>
    </Pressable>
  );
}

function BattleHistorySection({ rootNavigation, onCreateBattle }) {
  const { data, loading, error, reload } = useBattleHistory({ enabled: true });

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const handleReopen = useCallback(
    (row) => {
      const nav = rootNavigation;
      if (!nav || !row?.id) return;

      battleHistoryDevLog('reopen', {
        battleId: row.id,
        uxStatus: row.uxStatus,
        reopenAction: row.reopenAction,
      });

      if (row.uxStatus === 'expired') {
        battleHistoryDevLog('reopen_stale', { battleId: row.id });
        nav.navigate('BattleLobby', { battleId: row.id });
        return;
      }

      if (row.reopenAction === 'result' || row.uxStatus === 'completed') {
        nav.navigate('BattleResult', { battleId: row.id });
        return;
      }

      nav.navigate('BattleLobby', { battleId: row.id });
    },
    [rootNavigation]
  );

  const summary = data?.summary;
  const pending = useMemo(
    () => (Array.isArray(data?.pendingBattles) ? data.pendingBattles : []),
    [data?.pendingBattles]
  );
  const recent = useMemo(
    () => (Array.isArray(data?.recentBattles) ? data.recentBattles : []),
    [data?.recentBattles]
  );
  const opponents = useMemo(
    () => (Array.isArray(data?.recentOpponents) ? data.recentOpponents : []),
    [data?.recentOpponents]
  );

  const hasAny = pending.length > 0 || recent.length > 0;
  const totalBattles =
    (summary?.wins ?? 0) + (summary?.losses ?? 0) + (summary?.ties ?? 0);

  if (loading && !data) {
    return (
      <View style={styles.block}>
        <Text style={styles.sectionTitle}>Battle history</Text>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.block}>
        <Text style={styles.sectionTitle}>Battle history</Text>
        <Text style={styles.errText}>{error}</Text>
        <Pressable onPress={() => void reload()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasAny && totalBattles === 0) {
    return (
      <View style={styles.block}>
        <Text style={styles.sectionTitle}>Battle history</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="flash-outline" size={28} color={colors.primary} />
          <Text style={styles.emptyTitle}>No battles yet</Text>
          <Text style={styles.emptySub}>
            Challenge a friend to start your first battle.
          </Text>
          {onCreateBattle ? (
            <Pressable
              onPress={onCreateBattle}
              style={({ pressed }) => [styles.emptyCta, pressCardStyle(pressed)]}
            >
              <Text style={styles.emptyCtaText}>Challenge a friend</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>Battle history</Text>

      {summary ? (
        <View style={styles.summaryRow}>
          <SummaryStat label="Wins" value={String(summary.wins ?? 0)} accent />
          <SummaryStat label="Losses" value={String(summary.losses ?? 0)} />
          <SummaryStat label="Ties" value={String(summary.ties ?? 0)} />
          <SummaryStat
            label="Pending"
            value={String(summary.pendingCount ?? 0)}
            accent={(summary.pendingCount ?? 0) > 0}
          />
        </View>
      ) : null}

      {opponents.length > 0 ? (
        <View style={styles.opponentsWrap}>
          <Text style={styles.opponentsLabel}>Recent opponents</Text>
          <View style={styles.opponentChips}>
            {opponents.map((o) => (
              <View key={o.userId} style={styles.opponentChip}>
                <Text style={styles.opponentChipText} numberOfLines={1}>
                  {o.displayName}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {pending.length > 0 ? (
        <>
          <Text style={styles.subheading}>Pending</Text>
          {pending.map((row) => (
            <BattleCard key={row.id} row={row} onPress={handleReopen} />
          ))}
        </>
      ) : null}

      {recent.length > 0 ? (
        <>
          <Text style={styles.subheading}>
            {pending.length > 0 ? 'Recent' : 'Completed & expired'}
          </Text>
          {recent.map((row) => (
            <BattleCard key={row.id} row={row} onPress={handleReopen} />
          ))}
        </>
      ) : null}

      {onCreateBattle ? (
        <Pressable
          onPress={onCreateBattle}
          style={({ pressed }) => [styles.newBattleBtn, pressCardStyle(pressed)]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.newBattleText}>New battle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default memo(BattleHistorySection);

const styles = StyleSheet.create({
  block: {
    marginTop: 0,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 10,
  },
  subheading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  loader: { marginVertical: 12 },
  errText: { fontSize: 13, color: colors.danger, marginBottom: 8 },
  retryBtn: { alignSelf: 'flex-start' },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCellAccent: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statValueAccent: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  opponentsWrap: { marginBottom: 8 },
  opponentsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 6,
  },
  opponentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opponentChip: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 140,
  },
  opponentChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  battleRowWrap: { paddingVertical: 4 },
  battleRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  battleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  battleBody: { flex: 1, minWidth: 0 },
  battleHeadline: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 19,
  },
  battleMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    fontWeight: '500',
  },
  battleTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outcomeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 40,
    alignItems: 'center',
  },
  outcomeChipText: { fontSize: 11, fontWeight: '700' },
  emptyCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyCtaText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
  newBattleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
  },
  newBattleText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
