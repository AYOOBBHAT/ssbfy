import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { getApiErrorMessage } from '../services/api';
import { getLeaderboard } from '../services/leaderboardService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getLeaderboard();
      const list = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
      setEntries(list);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setEntries([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({ item, index }) => {
    const rank = index + 1;
    const name = item?.name || 'Unknown';
    const streak = Number(item?.streakCount) || 0;
    return (
      <View style={styles.row}>
        <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>{rank}.</Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.streak}>🔥 {streak}</Text>
      </View>
    );
  };

  if (loading) {
    return <LoadingState label="Loading leaderboard..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => load()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Top Streaks</Text>
      <FlatList
        data={entries}
        keyExtractor={(item, idx) => `${item?.name ?? 'user'}-${idx}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            title="No data available"
            subtitle="No leaderboard entries yet. Build a streak to be the first!"
            emoji="🏆"
          />
        }
        contentContainerStyle={
          entries.length === 0 ? styles.emptyContainer : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rank: {
    width: 40,
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
  },
  rankTop: { color: colors.accent },
  name: { flex: 1, fontSize: 16, color: colors.text },
  streak: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    marginLeft: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  emptyContainer: { flexGrow: 1 },
  muted: { color: colors.muted, marginTop: 8, textAlign: 'center' },
  err: { color: colors.danger, marginBottom: 8, textAlign: 'center' },
});
