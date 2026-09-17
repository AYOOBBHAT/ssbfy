import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { listVideoLectures } from '../services/videoLectureService';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import {
  formatLectureDuration,
  getLectureProgress,
} from '../utils/lectureProgress';
import { usePracticeTaxonomy } from '../hooks/usePracticeTaxonomy';
import { formatTaxonomyLabel } from '../utils/formatTaxonomyLabel';
import { PremiumPdfUpgradeModal } from '../components/PremiumPdfUpgradeModal';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { LECTURE_UPSELL_SUB, LECTURE_UPSELL_TITLE } from '../constants/upgradeCopy';
import { colors } from '../theme/colors';
import { pressCardStyle } from '../utils/pressFeedback';
import PracticeSetupChip from '../components/practice/PracticeSetupChip';

const PAGE_SIZE = 20;

const LectureCard = memo(function LectureCard({
  item,
  progress,
  onPress,
}) {
  const locked = item.locked === true;
  const duration =
    item.durationSeconds != null ? formatLectureDuration(item.durationSeconds) : null;
  const watchedLabel = progress?.completed
    ? 'Watched'
    : progress?.positionSeconds > 2
      ? 'Resume'
      : null;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.card, pressCardStyle(pressed)]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.thumb}>
        <Ionicons name="play-circle" size={32} color={colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[item.subjectName, item.topicName].filter(Boolean).join(' · ') || 'Lecture'}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, locked ? styles.badgePremium : styles.badgeFree]}>
            <Text style={[styles.badgeText, locked ? styles.badgePremiumText : styles.badgeFreeText]}>
              {item.access === 'premium' ? 'Premium' : 'Free'}
            </Text>
          </View>
          {duration ? <Text style={styles.duration}>{duration}</Text> : null}
          {watchedLabel ? <Text style={styles.resume}>{watchedLabel}</Text> : null}
          {locked ? <Ionicons name="lock-closed" size={14} color={colors.muted} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
});

export default function VideoLecturesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const isPremium = userHasPremiumAccess(user);

  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const { subjects, subjectsLoading, topics, topicsLoading } =
    usePracticeTaxonomy(selectedSubjectId);

  const [lectures, setLectures] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const loadRef = useRef(null);

  const loadProgress = useCallback(
    async (rows) => {
      if (!userId || !rows?.length) return;
      const entries = await Promise.all(
        rows.map(async (row) => {
          const progress = await getLectureProgress(userId, row.id);
          return progress ? [row.id, progress] : null;
        })
      );
      setProgressMap((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    },
    [userId]
  );

  const loadLectures = useCallback(
    async ({ page: nextPage = 1, append = false } = {}) => {
      loadRef.current?.abort();
      const ac = new AbortController();
      loadRef.current = ac;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await listVideoLectures(
          {
            subjectId: selectedSubjectId || undefined,
            topicId: selectedTopicId || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
          },
          { signal: ac.signal }
        );
        if (loadRef.current !== ac) return;
        const rows = data.lectures;
        setLectures((prev) => (append ? [...prev, ...rows] : rows));
        setPage(nextPage);
        setTotalPages(Number(data.pagination?.totalPages) || 0);
        void loadProgress(rows);
      } catch (e) {
        if (isRequestCancelled(e) || loadRef.current !== ac) return;
        setError(getApiErrorMessage(e));
        if (!append) setLectures([]);
      } finally {
        if (loadRef.current === ac) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [selectedSubjectId, selectedTopicId, loadProgress]
  );

  useEffect(() => {
    void loadLectures({ page: 1 });
    return () => loadRef.current?.abort();
  }, [loadLectures]);

  useFocusEffect(
    useCallback(() => {
      if (lectures.length) void loadProgress(lectures);
    }, [lectures, loadProgress])
  );

  const onSelectSubject = useCallback((id) => {
    setSelectedSubjectId((prev) => (String(prev) === String(id) ? '' : String(id)));
    setSelectedTopicId('');
  }, []);

  const onSelectTopic = useCallback((id) => {
    setSelectedTopicId((prev) => (String(prev) === String(id) ? '' : String(id)));
  }, []);

  const handlePress = useCallback(
    (item) => {
      if (item.locked === true || (item.access === 'premium' && !isPremium)) {
        setUpgradeVisible(true);
        return;
      }
      navigation.navigate('LecturePlayer', {
        lectureId: item.id,
        title: item.title,
      });
    },
    [isPremium, navigation]
  );

  const subjectItems = useMemo(
    () => [{ _id: '', name: 'All' }, ...subjects],
    [subjects]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <LectureCard
        item={item}
        progress={progressMap[item.id]}
        onPress={handlePress}
      />
    ),
    [handlePress, progressMap]
  );

  const listHeader = (
    <View style={styles.filters}>
      <Text style={styles.filterLabel}>Subject</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {subjectsLoading ? (
          <Text style={styles.filterHint}>Loading subjects…</Text>
        ) : (
          subjectItems.map((subject) => {
            const id = String(subject._id || '');
            return (
              <View key={id || 'all'} style={styles.chipWrap}>
                <PracticeSetupChip
                  label={formatTaxonomyLabel(subject.name) || 'All'}
                  selected={String(selectedSubjectId) === id}
                  onPress={() => onSelectSubject(id)}
                  compact
                />
              </View>
            );
          })
        )}
      </ScrollView>
      {selectedSubjectId ? (
        <>
          <Text style={styles.filterLabel}>Topic</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {topicsLoading ? (
              <Text style={styles.filterHint}>Loading topics…</Text>
            ) : (
              [{ _id: '', name: 'All' }, ...topics].map((topic) => {
                const id = String(topic._id || '');
                return (
                  <View key={id || 'all-topics'} style={styles.chipWrap}>
                    <PracticeSetupChip
                      label={formatTaxonomyLabel(topic.name) || 'All'}
                      selected={String(selectedTopicId) === id}
                      onPress={() => onSelectTopic(id)}
                      compact
                    />
                  </View>
                );
              })
            )}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && !lectures.length ? (
        <LoadingState label="Loading lectures" />
      ) : error && !lectures.length ? (
        <ErrorState
          title="Could not load lectures"
          message={error}
          onRetry={() => loadLectures({ page: 1 })}
        />
      ) : (
        <FlatList
          data={lectures}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              title="No lectures yet"
              subtitle="Published lectures for your subjects will appear here."
              glyph="practice"
            />
          }
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loadingMore || loading) return;
            if (page < totalPages) void loadLectures({ page: page + 1, append: true });
          }}
          ListFooterComponent={
            loadingMore ? <Text style={styles.more}>Loading more…</Text> : null
          }
        />
      )}
      <PremiumPdfUpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        title={LECTURE_UPSELL_TITLE}
        subtitle={LECTURE_UPSELL_SUB}
        onUpgrade={() => {
          setUpgradeVisible(false);
          navigation.navigate('Premium', { from: 'lecture' });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 32 },
  filters: { marginBottom: 12 },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
    marginTop: 4,
  },
  filterHint: { color: colors.muted, fontSize: 13, paddingVertical: 8 },
  chipRow: { gap: 8, paddingBottom: 8 },
  chipWrap: { marginRight: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeFree: { backgroundColor: '#ecfdf5' },
  badgePremium: { backgroundColor: '#fff7ed' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeFreeText: { color: colors.success },
  badgePremiumText: { color: colors.primary },
  duration: { fontSize: 12, color: colors.muted },
  resume: { fontSize: 12, fontWeight: '700', color: colors.primary },
  more: { textAlign: 'center', color: colors.muted, paddingVertical: 12 },
});
