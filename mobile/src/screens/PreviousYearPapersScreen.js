import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, SectionList, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { usePreviousYearPapers } from '../hooks/usePreviousYearPapers';
import { useMockQuota } from '../hooks/useMockQuota';
import PreviousYearPaperCard from '../components/PreviousYearPaperCard';
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
import { getCachedPostsSnapshot, getPosts } from '../services/pdfService';
import { isQuotaExhausted } from '../utils/mockQuotaCopy';
import { resolveMockTestPresentation } from '../utils/mockTestCardPresentation';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import { useDevMountTrace, useDevRenderTrace } from '../utils/renderPerfDevLog';
import {
  buildPostsById,
  examLabel,
  filterPreviousYearPapers,
  groupPreviousYearPapersByYear,
  isStudentVisiblePyq,
  resolvePyqCtaLabels,
  uniqueExamOptions,
  uniqueYears,
} from '../utils/previousYearPapers';

const ListSectionHeader = memo(function ListSectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
});

export default function PreviousYearPapersScreen() {
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
  const postsLoadRef = useRef(null);
  const initialPosts = getCachedPostsSnapshot();
  const [posts, setPosts] = useState(() => initialPosts?.posts ?? []);
  const [examFilter, setExamFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  const {
    tests,
    loading,
    error,
    loadPapers,
    startError,
    startingId,
    handleStartPaper: startPaperBase,
    FREE_TEST_LIMIT_MESSAGE,
  } = usePreviousYearPapers();

  const showExhaustedCard =
    showQuota &&
    (startError === FREE_TEST_LIMIT_MESSAGE ||
      (isQuotaExhausted(quota) && !startError));

  const postsById = useMemo(() => buildPostsById(posts), [posts]);

  useDevRenderTrace(
    'PreviousYearPapersScreen',
    () => ({
      tests: tests.length,
      examFilter,
      yearFilter,
      statusLoading,
      loading,
      startingId: startingId != null ? String(startingId) : null,
    }),
    { logEvery: 6, slowRenderMs: 18 }
  );
  useDevMountTrace(
    'PreviousYearPapersScreen',
    () => ({ tests: tests.length }),
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

  const loadPostCatalog = useCallback(async () => {
    postsLoadRef.current?.abort();
    const ac = new AbortController();
    postsLoadRef.current = ac;
    try {
      const data = await getPosts({ signal: ac.signal });
      if (postsLoadRef.current !== ac) return;
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
    } catch (e) {
      if (isRequestCancelled(e) || postsLoadRef.current !== ac) return;
    }
  }, []);

  useEffect(() => {
    void loadStatuses({ source: 'pyq_mount' });
    void loadPostCatalog();
    return () => {
      postsLoadRef.current?.abort();
      postsLoadRef.current = null;
    };
  }, [loadStatuses, loadPostCatalog]);

  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnceRef.current) {
        void loadStatuses({ source: 'pyq_focus' });
      } else {
        hasFocusedOnceRef.current = true;
      }
    }, [loadStatuses])
  );

  const handleStartPaper = useCallback(
    async (item) => {
      await startPaperBase(item);
      void refreshQuota({ force: true, source: 'start_pyq' });
      void loadStatuses({ force: true, source: 'start_pyq' });
    },
    [loadStatuses, startPaperBase, refreshQuota]
  );

  const visiblePapers = useMemo(() => {
    return (tests || []).filter((t) => {
      const id = String(t?._id ?? '').trim();
      const st = statusMap?.[id];
      return isStudentVisiblePyq(t, { hasOpenAttempt: !!st?.hasOpenAttempt });
    });
  }, [tests, statusMap]);

  const examOptions = useMemo(
    () => uniqueExamOptions(visiblePapers, postsById),
    [visiblePapers, postsById]
  );
  const yearOptions = useMemo(() => uniqueYears(visiblePapers), [visiblePapers]);

  const filteredPapers = useMemo(
    () =>
      filterPreviousYearPapers(visiblePapers, {
        postId: examFilter,
        year: yearFilter,
      }),
    [visiblePapers, examFilter, yearFilter]
  );

  const testStatusById = useMemo(() => {
    const map = new Map();
    for (const t of filteredPapers) {
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
  }, [filteredPapers, statusMap]);

  const { continueRows, availableByYear } = useMemo(() => {
    const cont = [];
    const avail = [];
    for (let i = 0; i < filteredPapers.length; i += 1) {
      const t = filteredPapers[i];
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
    return {
      continueRows: cont,
      availableByYear: groupPreviousYearPapersByYear(avail.map((r) => r.test)).map((section) => ({
        ...section,
        data: section.data.map((test) => {
          const id = String(test?._id ?? '').trim();
          return {
            test,
            catalogIndex: filteredPapers.findIndex((t) => String(t?._id) === id),
            status: testStatusById.get(id) || {
              hasOpen: false,
              isCompleted: false,
              canRetry: false,
            },
          };
        }),
      })),
    };
  }, [filteredPapers, testStatusById]);

  const sections = useMemo(() => {
    const out = [];
    if (continueRows.length > 0) {
      out.push({
        key: 'continue',
        title: 'Continue your paper',
        subtitle: 'Timed attempts in progress — pick up where you left off.',
        data: continueRows,
        prominent: true,
      });
    }
    for (const yearSection of availableByYear) {
      out.push({
        key: yearSection.key,
        title: yearSection.title,
        subtitle: null,
        data: yearSection.data,
        prominent: false,
      });
    }
    return out;
  }, [continueRows, availableByYear]);

  const renderPaperRow = useCallback(
    ({ item, section }) => {
      const { test, status: st } = item;
      const itemId = test?._id;
      const isStarting = startingId != null && String(startingId) === String(itemId);
      const isRetiredResume = test?.status === 'disabled' && st.hasOpen;
      const presentation = resolvePyqCtaLabels(
        resolveMockTestPresentation({
          hasOpen: st.hasOpen,
          isCompleted: st.isCompleted,
          canRetry: st.canRetry,
          statusLoading,
          statusError,
          isPremium,
        })
      );

      return (
        <PreviousYearPaperCard
          item={test}
          examName={examLabel(test, postsById)}
          onStart={handleStartPaper}
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
    [handleStartPaper, startingId, statusLoading, statusError, isPremium, postsById]
  );

  const handleRefresh = useCallback(() => {
    void loadPapers();
    void loadPostCatalog();
    void refreshQuota({ force: true, source: 'pyq_pull_to_refresh' });
    void loadStatuses({ force: true, source: 'pyq_pull_to_refresh' });
  }, [loadPapers, loadPostCatalog, loadStatuses, refreshQuota]);

  const renderSectionHeader = useCallback(
    ({ section }) =>
      section.data.length > 0 ? (
        <ListSectionHeader title={section.title} subtitle={section.subtitle} />
      ) : null,
    []
  );

  const showFilters = examOptions.length > 1 || yearOptions.length > 1;

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        {showQuota ? <MockQuotaBanner quota={quota} loading={quotaLoading} /> : null}
        {showFilters ? (
          <View style={styles.filters}>
            {examOptions.length > 1 ? (
              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Exam</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  <Pressable
                    onPress={() => setExamFilter('')}
                    style={({ pressed }) => [
                      styles.chip,
                      !examFilter && styles.chipActive,
                      pressFeedbackStyle(pressed),
                    ]}
                  >
                    <Text style={[styles.chipText, !examFilter && styles.chipTextActive]}>
                      All
                    </Text>
                  </Pressable>
                  {examOptions.map((opt) => {
                    const active = String(examFilter) === String(opt.id);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setExamFilter(opt.id)}
                        style={({ pressed }) => [
                          styles.chip,
                          active && styles.chipActive,
                          pressFeedbackStyle(pressed),
                        ]}
                      >
                        <Text
                          style={[styles.chipText, active && styles.chipTextActive]}
                          numberOfLines={1}
                        >
                          {opt.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {yearOptions.length > 1 ? (
              <View style={styles.filterBlock}>
                <Text style={styles.filterLabel}>Year</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                >
                  <Pressable
                    onPress={() => setYearFilter('')}
                    style={({ pressed }) => [
                      styles.chip,
                      !yearFilter && styles.chipActive,
                      pressFeedbackStyle(pressed),
                    ]}
                  >
                    <Text style={[styles.chipText, !yearFilter && styles.chipTextActive]}>
                      All
                    </Text>
                  </Pressable>
                  {yearOptions.map((year) => {
                    const active = String(yearFilter) === String(year);
                    return (
                      <Pressable
                        key={year}
                        onPress={() => setYearFilter(String(year))}
                        style={({ pressed }) => [
                          styles.chip,
                          active && styles.chipActive,
                          pressFeedbackStyle(pressed),
                        ]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}
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
            compact={startError === FREE_TEST_LIMIT_MESSAGE}
            onSeePlans={goPremium}
            onDailyPractice={goDaily}
            onTopicPractice={goTopicPractice}
          />
        ) : null}
        {startError && startError !== FREE_TEST_LIMIT_MESSAGE ? (
          <View style={styles.alert}>
            <Text style={styles.alertTitle}>Could not start paper</Text>
            <Text style={styles.alertBody}>{startError}</Text>
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
              title="Unable to load previous year papers."
              message={error}
              context="previous year papers"
              onRetry={loadPapers}
              retrying={loading}
              retryLabel="Try again"
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
      showFilters,
      examOptions,
      examFilter,
      yearOptions,
      yearFilter,
      statusLoading,
      tests.length,
      statusError,
      showExhaustedCard,
      startError,
      FREE_TEST_LIMIT_MESSAGE,
      goPremium,
      goDaily,
      goTopicPractice,
      loading,
      error,
      loadPapers,
    ]
  );

  const emptyAfterFilter =
    !loading && !error && visiblePapers.length > 0 && filteredPapers.length === 0;

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
      renderItem={renderPaperRow}
      ListEmptyComponent={
        !loading && !error && tests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState compact {...EMPTY.PREVIOUS_YEAR_PAPERS} />
          </View>
        ) : emptyAfterFilter ? (
          <View style={styles.emptyWrap}>
            <EmptyState compact {...EMPTY.PREVIOUS_YEAR_PAPERS_FILTER} />
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
  filters: { marginBottom: 12, gap: 12 },
  filterBlock: { gap: 8 },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.textOnPrimary },
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
