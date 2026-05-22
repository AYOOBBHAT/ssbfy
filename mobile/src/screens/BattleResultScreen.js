import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import {
  useBottomSafeInsets,
  useBottomSafeInsetsDevLog,
} from '../hooks/useBottomSafeInsets';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getBattleResult } from '../services/battleService';
import { colors } from '../theme/colors';
import { pressCardStyle } from '../utils/pressFeedback';
import { buildMainReturnRoute } from '../navigation/testFlowNavigation';

function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const sec = Math.floor(n / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function PlayerRow({ label, score, incorrect, timeTakenMs, isWinner, isYou }) {
  return (
    <View style={[styles.playerCard, isWinner && styles.playerWinner]}>
      <View style={styles.playerHeader}>
        <Text style={styles.playerName}>
          {label}
          {isYou ? ' (you)' : ''}
        </Text>
        {isWinner ? (
          <View style={styles.winnerBadge}>
            <Ionicons name="trophy" size={14} color={colors.textOnPrimary} />
            <Text style={styles.winnerBadgeText}>Winner</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{score ?? '—'}</Text>
          <Text style={styles.statLbl}>Score</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{incorrect ?? '—'}</Text>
          <Text style={styles.statLbl}>Wrong</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{formatMs(timeTakenMs)}</Text>
          <Text style={styles.statLbl}>Time</Text>
        </View>
      </View>
    </View>
  );
}

export default function BattleResultScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const battleId = String(route.params?.battleId ?? '');
  const myUid = user?.id || user?._id;
  const bottomInsets = useBottomSafeInsets({ extraScrollPadding: 16 });
  useBottomSafeInsetsDevLog('BattleResult', bottomInsets);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadRef = useRef(null);

  const load = useCallback(async () => {
    if (!battleId) return;
    loadRef.current?.abort();
    const ac = new AbortController();
    loadRef.current = ac;
    setLoading(true);
    try {
      const res = await getBattleResult(battleId, { signal: ac.signal });
      if (loadRef.current !== ac) return;
      setData(res);
      setError(null);
    } catch (e) {
      if (isRequestCancelled(e) || loadRef.current !== ac) return;
      setError(getApiErrorMessage(e));
    } finally {
      if (loadRef.current === ac) setLoading(false);
    }
  }, [battleId]);

  useEffect(() => {
    void load();
    return () => loadRef.current?.abort();
  }, [load]);

  const goHome = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [buildMainReturnRoute('Home')],
    });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !data?.comparison) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>{error || 'Could not load battle results'}</Text>
        <Pressable onPress={goHome} style={styles.homeBtn}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  const { comparison, battle } = data;
  const winnerId = comparison.winnerUserId;
  const tie = battle?.status === 'completed' && !winnerId;
  const youWon = winnerId && String(winnerId) === String(myUid);
  const creator = comparison.creator;
  const opponent = comparison.opponent;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, bottomInsets.scrollContentStyle]}
    >
      <Text style={styles.title}>
        {tie ? "It's a tie!" : youWon ? 'You won the battle!' : winnerId ? 'Battle results' : 'Match standings'}
      </Text>
      <Text style={styles.sub}>
        {battle?.status === 'completed'
          ? 'Head-to-head match complete — both attempts scored.'
          : 'Scores update when both players finish their attempts.'}
      </Text>

      <PlayerRow
        label={creator?.displayName || 'Player 1'}
        score={creator?.score}
        incorrect={creator?.incorrect}
        timeTakenMs={creator?.timeTakenMs}
        isWinner={winnerId && String(winnerId) === String(creator?.userId)}
        isYou={String(creator?.userId) === String(myUid)}
      />

      {opponent ? (
        <PlayerRow
          label={opponent?.displayName || 'Player 2'}
          score={opponent?.score}
          incorrect={opponent?.incorrect}
          timeTakenMs={opponent?.timeTakenMs}
          isWinner={winnerId && String(winnerId) === String(opponent?.userId)}
          isYou={String(opponent?.userId) === String(myUid)}
        />
      ) : (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>Opponent hasn&apos;t joined yet</Text>
        </View>
      )}

      <Pressable onPress={goHome} style={({ pressed }) => [styles.homeBtn, pressCardStyle(pressed)]}>
        <Text style={styles.homeBtnText}>Back to Home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 20 },
  playerCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerWinner: { borderColor: colors.primary },
  playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  playerName: { fontSize: 17, fontWeight: '700', color: colors.text },
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  winnerBadgeText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLbl: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pendingText: { color: colors.muted, textAlign: 'center' },
  homeBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  homeBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 16 },
  err: { color: colors.error, marginBottom: 16 },
});
