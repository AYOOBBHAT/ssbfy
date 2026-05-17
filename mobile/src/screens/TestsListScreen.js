import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMockTests } from '../hooks/useMockTests';
import { useMockQuota } from '../hooks/useMockQuota';
import { MockTestCard } from '../components/MockTestCard';
import { MockQuotaBanner } from '../components/MockQuotaBanner';
import { MockQuotaExhaustedCard } from '../components/MockQuotaExhaustedCard';
import { LoadingState, ErrorState, EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getMyTestStatus } from '../services/testService';
import { isQuotaExhausted } from '../utils/mockQuotaCopy';

export default function TestsListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isPremium = userHasPremiumAccess(user);
  const { quota, loading: quotaLoading, refresh: refreshQuota, showQuota } = useMockQuota();
  const [statusMap, setStatusMap] = useState({});
  const [statusError, setStatusError] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const {
    tests,
    loading,
    error,
    loadTests,
    mockStartError,
    startingId,
    handleStartTest: startTestBase,
    FREE_TEST_LIMIT_MESSAGE,
  } = useMockTests();

  const showExhaustedCard =
    showQuota &&
    (mockStartError === FREE_TEST_LIMIT_MESSAGE ||
      (isQuotaExhausted(quota) && !mockStartError));

  const handleStartTest = useCallback(
    async (item) => {
      await startTestBase(item);
      void refreshQuota();
    },
    [startTestBase, refreshQuota]
  );

  const goPremium = useCallback(() => {
    navigation.navigate('Premium', { from: 'limit' });
  }, [navigation]);

  const goDaily = useCallback(() => {
    navigation.navigate('Main', { screen: 'Home' });
  }, [navigation]);

  const goTopicPractice = useCallback(() => {
    navigation.navigate('Main', { screen: 'Practice' });
  }, [navigation]);

  useEffect(() => {
    const ac = new AbortController();
    const loadStatuses = async () => {
      try {
        setStatusError(null);
        setStatusLoading(true);
        const data = await getMyTestStatus({ signal: ac.signal });
        const next = data?.status && typeof data.status === 'object' ? data.status : {};
        if (ac.signal.aborted) return;
        setStatusMap(next);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setStatusError(getApiErrorMessage(e));
        setStatusMap({});
      }
      if (ac.signal.aborted) return;
      setStatusLoading(false);
    };
    void loadStatuses();
    return () => {
      ac.abort();
    };
  }, []);

  const testStatusById = useMemo(() => {
    const map = new Map();
    for (const t of tests || []) {
      const id = String(t?._id ?? '').trim();
      if (!id) continue;
      const st = statusMap?.[id];
      map.set(id, {
        hasOpen: !!st?.hasOpenAttempt,
        isCompleted: !!st?.hasCompletedAttempt,
      });
    }
    return map;
  }, [tests, statusMap]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={tests}
      keyExtractor={(item, idx) => String(item?._id ?? idx)}
      refreshing={loading && tests.length > 0}
      onRefresh={() => {
        void loadTests();
        void refreshQuota();
      }}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Text style={styles.lead}>
            Full-length timed mocks aligned with your exam pattern. Tap start when you are ready.
          </Text>
          {showQuota ? <MockQuotaBanner quota={quota} loading={quotaLoading} /> : null}
          {statusLoading && tests.length > 0 ? (
            <View style={styles.syncInfo}>
              <Text style={styles.syncInfoText}>Syncing test status...</Text>
            </View>
          ) : null}
          {statusError ? (
            <View style={styles.softWarn}>
              <Text style={styles.softWarnText}>
                Some test statuses may be outdated. {statusError}
              </Text>
            </View>
          ) : null}
          {showExhaustedCard ? (
            <MockQuotaExhaustedCard
              compact={mockStartError === FREE_TEST_LIMIT_MESSAGE}
              onSeePlans={goPremium}
              onDailyPractice={goDaily}
              onTopicPractice={goTopicPractice}
            />
          ) : null}
          {mockStartError && mockStartError !== FREE_TEST_LIMIT_MESSAGE ? (
            <View style={styles.alert}>
              <Text style={styles.alertTitle}>Could not start test</Text>
              <Text style={styles.alertBody}>{mockStartError}</Text>
            </View>
          ) : null}
          {loading && tests.length === 0 ? (
            <View style={styles.card}>
              <LoadingState compact />
            </View>
          ) : null}
          {error && !loading ? (
            <View style={styles.card}>
              <ErrorState
                message={error}
                context="mock tests"
                onRetry={loadTests}
                retrying={loading}
                compact
              />
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const itemId = item?._id;
        const isStarting =
          startingId != null && String(startingId) === String(itemId);
        const st =
          testStatusById.get(String(itemId)) || { hasOpen: false, isCompleted: false };

        let cta = 'Open test';
        let ctaState = 'loading';
        if (!statusLoading && !statusError) {
          cta = 'Start test';
          ctaState = 'start';
          if (st.hasOpen) {
            cta = 'Resume test';
            ctaState = 'resume';
          } else if (st.isCompleted && isPremium) {
            cta = 'Retry test';
            ctaState = 'retry';
          } else if (st.isCompleted && !isPremium) {
            cta = 'Completed';
            ctaState = 'completed';
          }
        } else if (!statusLoading && statusError) {
          cta = 'Open test';
          ctaState = 'unknown';
        }
        return (
          <MockTestCard
            item={item}
            index={index}
            onStart={handleStartTest}
            isStarting={isStarting}
            actionLabel={cta}
            ctaState={ctaState}
            isPremium={isPremium}
          />
        );
      }}
      ListEmptyComponent={
        !loading && !error && tests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState compact {...EMPTY.MOCK_TESTS_CATALOG} />
          </View>
        ) : null
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerBlock: { marginBottom: 4 },
  lead: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alert: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  alertBody: { fontSize: 14, color: colors.danger, fontWeight: '600' },
  syncInfo: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncInfoText: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  softWarn: {
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  softWarnText: { fontSize: 12, color: colors.text, lineHeight: 17 },
  emptyWrap: { paddingVertical: 24 },
});
