import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMockTests } from '../hooks/useMockTests';
import { useMockQuota } from '../hooks/useMockQuota';
import MockTestCard from '../components/MockTestCard';
import { MockQuotaBanner } from '../components/MockQuotaBanner';
import { MockQuotaExhaustedCard } from '../components/MockQuotaExhaustedCard';
import { LoadingState, ErrorState, EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { useAuth } from '../context/AuthContext';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import {
  getCachedMyTestStatusSnapshot,
  getMyTestStatus,
  isMyTestStatusSnapshotFresh,
} from '../services/testService';
import { isQuotaExhausted } from '../utils/mockQuotaCopy';
import { resolveMockTestPresentation } from '../utils/mockTestCardPresentation';
import { useDevMountTrace, useDevRenderTrace } from '../utils/renderPerfDevLog';

const ListSectionHeader = memo(function ListSectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
});

export default function TestsListScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isPremium = userHasPremiumAccess(user);
  const { quota, loading: quotaLoading, refresh: refreshQuota, showQuota } = useMockQuota();
  const [statusMap, setStatusMap] = useState(
    () => getCachedMyTestStatusSnapshot()?.status || {}
  );
  const [statusError, setStatusError] = useState(null);
  const [statusLoading, setStatusLoading] = useState(() => !getCachedMyTestStatusSnapshot());
  const hasFocusedOnceRef = useRef(false);
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

  useDevRenderTrace(
    'TestsListScreen',
    () => ({
      tests: tests.length,
      sections: sections.length,
      statusLoading,
      loading,
      showExhaustedCard,
      startingId: startingId != null ? String(startingId) : null,
    }),
    { logEvery: 6, slowRenderMs: 18 }
  );
  useDevMountTrace(
    'TestsListScreen',
    () => ({
      tests: tests.length,
      sections: sections.length,
    }),
    { slowMountMs: 45 }
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

  const loadStatuses = useCallback(async (options = {}) => {
    const { force = false, source = 'mount' } = options;
    const cached = getCachedMyTestStatusSnapshot();
    const hasCached = !!cached;
    if (cached) {
      const next = cached?.status && typeof cached.status === 'object' ? cached.status : {};
      setStatusMap(next);
      setStatusLoading(false);
      if (!force && isMyTestStatusSnapshotFresh()) {
        setStatusError(null);
        return next;
      }
    } else {
      setStatusLoading(true);
    }
    try {
      setStatusError(null);
      const data = await getMyTestStatus({
        force: true,
        reason: source,
      });
      const next = data?.status && typeof data.status === 'object' ? data.status : {};
      setStatusMap(next);
      return next;
    } catch (e) {
      if (isRequestCancelled(e)) return cached?.status ?? {};
      setStatusError(getApiErrorMessage(e));
      if (!hasCached) {
        setStatusMap({});
      }
    } finally {
      if (!hasCached) {
        setStatusLoading(false);
      }
    }
    return cached?.status ?? {};
  }, []);

  useEffect(() => {
    void loadStatuses({ source: 'tests_mount' });
  }, [loadStatuses]);

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnceRef.current) {
        void loadStatuses({ source: 'tests_focus' });
      } else {
        hasFocusedOnceRef.current = true;
      }
    }, [loadStatuses])
  );

  const handleStartTest = useCallback(
    async (item) => {
      await startTestBase(item);
      void refreshQuota({ force: true, source: 'start_test' });
      void loadStatuses({ force: true, source: 'start_test' });
    },
    [loadStatuses, startTestBase, refreshQuota]
  );

  const testStatusById = useMemo(() => {
    const map = new Map();
    for (const t of tests || []) {
      const id = String(t?._id ?? '').trim();
      if (!id) continue;
      const st = statusMap?.[id];
      map.set(id, {
        hasOpen: !!st?.hasOpenAttempt,
        isCompleted: !!st?.hasCompletedAttempt,
        canRetry: !!st?.canRetry,
      });
    }
    return map;
  }, [tests, statusMap]);

  const { continueTests, availableTests } = useMemo(() => {
    const cont = [];
    const avail = [];
    for (let i = 0; i < (tests || []).length; i += 1) {
      const t = tests[i];
      const id = String(t?._id ?? '').trim();
      const st = testStatusById.get(id) || {
        hasOpen: false,
        isCompleted: false,
        canRetry: false,
      };
      const row = { test: t, catalogIndex: i, status: st };
      if (st.hasOpen) cont.push(row);
      else avail.push(row);
    }
    return { continueTests: cont, availableTests: avail };
  }, [tests, testStatusById]);

  const sections = useMemo(() => {
    const out = [];
    if (continueTests.length > 0) {
      out.push({
        key: 'continue',
        title: 'Continue your test',
        subtitle: 'Timed attempts in progress — pick up where you left off.',
        data: continueTests,
        prominent: true,
      });
    }
    if (availableTests.length > 0 || continueTests.length === 0) {
      out.push({
        key: 'available',
        title: continueTests.length > 0 ? 'Available mock tests' : 'Mock tests',
        subtitle:
          continueTests.length > 0
            ? 'Full-length timed exams — start when you are ready.'
            : 'Full-length timed mocks aligned with your exam pattern.',
        data: availableTests,
        prominent: false,
      });
    }
    return out;
  }, [continueTests, availableTests]);

  const renderMockRow = useCallback(
    ({ item, section }) => {
      const { test, catalogIndex, status: st } = item;
      const itemId = test?._id;
      const isStarting = startingId != null && String(startingId) === String(itemId);
      const isRetiredResume = test?.status === 'disabled' && st.hasOpen;

      const presentation = resolveMockTestPresentation({
        hasOpen: st.hasOpen,
        isCompleted: st.isCompleted,
        canRetry: st.canRetry,
        statusLoading,
        statusError,
        isPremium,
      });

      return (
        <MockTestCard
          item={test}
          displayIndex={catalogIndex}
          onStart={handleStartTest}
          isStarting={isStarting}
          actionLabel={presentation.ctaLabel}
          ctaState={presentation.ctaState}
          statusLabel={presentation.statusLabel}
          statusTone={presentation.statusTone}
          continuityHint={presentation.continuityHint}
          prominent={section.prominent || presentation.prominent}
          ctaDisabled={presentation.ctaDisabled}
          isRetiredResume={isRetiredResume}
        />
      );
    },
    [handleStartTest, startingId, statusLoading, statusError, isPremium]
  );

  const handleRefresh = useCallback(() => {
    void loadTests();
    void refreshQuota({ force: true, source: 'tests_pull_to_refresh' });
    void loadStatuses({ force: true, source: 'tests_pull_to_refresh' });
  }, [loadTests, loadStatuses, refreshQuota]);

  const renderSectionHeader = useCallback(
    ({ section }) =>
      section.data.length > 0 ? (
        <ListSectionHeader title={section.title} subtitle={section.subtitle} />
      ) : null,
    []
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {showQuota ? <MockQuotaBanner quota={quota} loading={quotaLoading} /> : null}
        {statusLoading && tests.length > 0 ? (
          <View style={styles.syncInfo}>
            <Text style={styles.syncInfoText}>Syncing attempt status…</Text>
          </View>
        ) : null}
        {statusError ? (
          <View style={styles.softWarn}>
            <Text style={styles.softWarnText}>
              Status may be outdated. {statusError}
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
            <Text style={styles.alertTitle}>Could not start mock</Text>
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
    ),
    [
      showQuota,
      quota,
      quotaLoading,
      statusLoading,
      tests.length,
      statusError,
      showExhaustedCard,
      mockStartError,
      FREE_TEST_LIMIT_MESSAGE,
      goPremium,
      goDaily,
      goTopicPractice,
      loading,
      error,
      loadTests,
    ]
  );

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(row, idx) => String(row?.test?._id ?? idx)}
      stickySectionHeadersEnabled={false}
      refreshing={loading && tests.length > 0}
      onRefresh={handleRefresh}
      ListHeaderComponent={listHeader}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderMockRow}
      ListEmptyComponent={
        !loading && !error && tests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState compact {...EMPTY.MOCK_TESTS_CATALOG} />
          </View>
        ) : null
      }
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerBlock: { marginBottom: 8 },
  sectionHead: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 360,
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  alertBody: { fontSize: 13, color: colors.danger, fontWeight: '600' },
  syncInfo: {
    marginBottom: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncInfoText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  softWarn: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  softWarnText: { fontSize: 11, color: colors.text, lineHeight: 16 },
  emptyWrap: { paddingVertical: 24 },
});
