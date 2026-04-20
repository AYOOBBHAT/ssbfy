import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';
import { getTests, startTest } from '../services/testService';
import { getDailyPractice } from '../services/dailyPracticeService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors, brand } from '../theme/colors';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, logout, refreshUser } = useAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);

  const loadTests = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getTests();
      setTests(Array.isArray(data?.tests) ? data.tests : []);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  useFocusEffect(
    useCallback(() => {
      void refreshUser?.();
    }, [refreshUser])
  );

  const handleStartTest = async (item) => {
    const testId = item._id;
    setError(null);
    setStartingId(testId);
    try {
      const data = await startTest(testId);
      navigation.navigate('Test', {
        testId,
        attempt: data.attempt,
        durationMinutes: item.duration,
      });
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setStartingId(null);
    }
  };

  const handleStartDailyPractice = async () => {
    if (dailyLoading) return;
    setDailyError(null);
    setDailyLoading(true);
    try {
      const data = await getDailyPractice();
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      const questionIds = questions.map((q) => String(q?._id)).filter(Boolean);
      if (!questionIds.length) {
        setDailyError('No daily practice questions available.');
        return;
      }
      navigation.navigate('Test', {
        mode: 'daily',
        questionIds,
        questions,
      });
    } catch (e) {
      setDailyError(getApiErrorMessage(e));
    } finally {
      setDailyLoading(false);
    }
  };

  const name = user?.name || 'there';
  const streak = Number(user?.streakCount) || 0;
  const streakLabel = streak === 1 ? 'day' : 'days';

  const renderHeader = () => (
    <View>
      <View style={styles.brandBlock}>
        <Text style={styles.brandName}>{brand.name}</Text>
        <Text style={styles.brandTagline}>{brand.tagline}</Text>
      </View>

      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.name}>{name} 👋</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      <View style={styles.streakCard}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <View style={styles.streakTextBlock}>
          <Text style={styles.streakLabel}>Current streak</Text>
          <Text style={styles.streakValue}>
            {streak} {streakLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Daily Practice</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's 10 questions</Text>
        <Text style={styles.cardSubtitle}>
          Build your streak with a quick daily drill.
        </Text>
        {dailyError ? <Text style={styles.err}>{dailyError}</Text> : null}
        <Pressable
          onPress={handleStartDailyPractice}
          disabled={dailyLoading}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.btnPressed,
            dailyLoading && styles.btnDisabled,
          ]}
        >
          <Text style={styles.primaryBtnText}>
            {dailyLoading ? 'Loading…' : 'Start Daily Practice'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Mock Tests</Text>
      {loading ? (
        <View style={styles.card}>
          <LoadingState label="Loading tests..." compact />
        </View>
      ) : error ? (
        <View style={styles.card}>
          <ErrorState message={error} onRetry={loadTests} compact />
        </View>
      ) : tests.length === 0 ? (
        <View style={styles.card}>
          <EmptyState
            title="No tests available"
            subtitle="Check back soon for new mock tests."
            emoji="📝"
            compact
          />
        </View>
      ) : null}
    </View>
  );

  const renderFooter = () => (
    <View>
      <Text style={styles.sectionTitle}>Leaderboard</Text>
      <Pressable
        onPress={() => navigation.navigate('Leaderboard')}
        style={({ pressed }) => [
          styles.leaderboardCard,
          pressed && styles.btnPressed,
        ]}
      >
        <Text style={styles.leaderboardEmoji}>🏆</Text>
        <View style={styles.leaderboardTextBlock}>
          <Text style={styles.leaderboardTitle}>View Leaderboard</Text>
          <Text style={styles.leaderboardSubtitle}>
            See top streak holders.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable
        onPress={logout}
        style={({ pressed }) => [styles.logoutBtn, pressed && styles.btnPressed]}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );

  const renderTest = ({ item }) => {
    const isStarting =
      startingId != null && String(startingId) === String(item._id);
    return (
      <View style={styles.card}>
        <View style={styles.testRow}>
          <View style={styles.testInfo}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>
              Duration: {item.duration} min
            </Text>
          </View>
          <Pressable
            onPress={() => handleStartTest(item)}
            disabled={isStarting}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.btnPressed,
              isStarting && styles.btnDisabled,
            ]}
          >
            <Text style={styles.secondaryBtnText}>
              {isStarting ? 'Starting…' : 'Start'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={loading ? [] : tests}
      keyExtractor={(item) => String(item._id)}
      renderItem={renderTest}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  brandBlock: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  brandTagline: {
    fontSize: 13,
    color: colors.primaryText,
    marginTop: 2,
  },

  greetingBlock: { marginBottom: 16 },
  greeting: { fontSize: 14, color: colors.muted },
  name: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 2 },
  email: { fontSize: 13, color: colors.muted, marginTop: 4 },

  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  streakEmoji: { fontSize: 28, marginRight: 12 },
  streakTextBlock: { flex: 1 },
  streakLabel: { fontSize: 13, color: colors.muted },
  streakValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 10,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '600' },

  secondaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '600' },

  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.6 },

  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testInfo: { flex: 1, marginRight: 12 },

  leaderboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leaderboardEmoji: { fontSize: 24, marginRight: 12 },
  leaderboardTextBlock: { flex: 1 },
  leaderboardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  leaderboardSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.muted, marginLeft: 8 },

  logoutBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginTop: 4,
  },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: '600' },

  loader: { marginVertical: 16 },
  muted: { color: colors.muted, fontSize: 14 },
  err: { color: colors.danger, marginTop: 8, marginBottom: 4, fontSize: 13 },
});
