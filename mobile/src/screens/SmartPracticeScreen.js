import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getPosts } from '../services/pdfService';
import { postSmartPractice } from '../services/testService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import PracticeSetupSection from '../components/practice/PracticeSetupSection';
import PracticeChipGrid from '../components/practice/PracticeChipGrid';
import PracticeSetupChip from '../components/practice/PracticeSetupChip';
import QuestionCountSegment from '../components/practice/QuestionCountSegment';
import PracticeStartFooter from '../components/practice/PracticeStartFooter';
import { usePracticeTaxonomy } from '../hooks/usePracticeTaxonomy';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { NAV_TRANSITION_LOCK_MS, tryAcquireLock } from '../utils/navigationGuard';
import { questionIdsFromDocs, resolveMongoId } from '../utils/mongoId.js';
import { resolveTopicId } from '../utils/topicRef';
import { formatTaxonomyLabel } from '../utils/formatTaxonomyLabel';
import { buildPracticeSetupSummary } from '../utils/practiceSetupSummary';

const DIFFICULTY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

const DEFAULT_Q = 10;

export default function SmartPracticeScreen() {
  const navigation = useNavigation();

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);

  const [selectedPostId, setSelectedPostId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const { subjects, subjectsLoading, topics, topicsLoading } =
    usePracticeTaxonomy(selectedSubjectId);

  const [difficulty, setDifficulty] = useState('all');
  const [questionCount, setQuestionCount] = useState(DEFAULT_Q);

  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);
  const startLockRef = useRef(false);
  const postsLoadRef = useRef(null);

  const loadPosts = useCallback(async () => {
    postsLoadRef.current?.abort();
    const ac = new AbortController();
    postsLoadRef.current = ac;
    setPostsError(null);
    setPostsLoading(true);
    try {
      const data = await getPosts({ force: true, signal: ac.signal });
      if (postsLoadRef.current !== ac) return;
      const list = Array.isArray(data?.posts) ? data.posts : [];
      setPosts(list);
    } catch (e) {
      if (isRequestCancelled(e) || postsLoadRef.current !== ac) return;
      setPostsError(getApiErrorMessage(e));
      setPosts([]);
    } finally {
      if (postsLoadRef.current === ac) {
        setPostsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPosts();
    return () => {
      postsLoadRef.current?.abort();
      postsLoadRef.current = null;
    };
  }, [loadPosts]);

  useEffect(() => {
    if (!selectedTopicId) return;
    if (!topics.some((t) => resolveTopicId(t?._id) === selectedTopicId)) {
      setSelectedTopicId('');
    }
  }, [topics, selectedTopicId]);

  const pickPost = useCallback((id) => {
    const sid = String(id);
    setSelectedPostId((prev) => (String(prev) === sid ? '' : sid));
  }, []);

  const pickSubject = useCallback((id) => {
    setSelectedSubjectId((prev) => (prev === id ? '' : id));
    setSelectedTopicId('');
  }, []);

  const pickTopic = useCallback((id) => {
    setSelectedTopicId((prev) => (prev === id ? '' : id));
  }, []);

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s._id) === String(selectedSubjectId)) || null,
    [subjects, selectedSubjectId]
  );

  const selectedTopic = useMemo(
    () => topics.find((t) => resolveTopicId(t?._id) === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const selectedPost = useMemo(
    () => activePosts.find((p) => String(p._id) === String(selectedPostId)) || null,
    [activePosts, selectedPostId]
  );

  const summary = useMemo(
    () =>
      buildPracticeSetupSummary({
        count: questionCount,
        difficulty,
        subject: selectedSubject,
        topic: selectedTopic,
        post: selectedPost,
      }),
    [questionCount, difficulty, selectedSubject, selectedTopic, selectedPost]
  );

  const canStart = !starting;

  const handleStart = useCallback(async () => {
    if (!canStart || !tryAcquireLock(startLockRef)) return;
    setStartError(null);
    setStarting(true);
    try {
      const body = {
        limit: questionCount,
      };
      const postId = resolveMongoId(selectedPostId, 'postId');
      if (postId) body.postId = postId;
      const subjectId = resolveMongoId(selectedSubjectId, 'subjectId');
      if (subjectId) body.subjectId = subjectId;
      const topicId = resolveTopicId(selectedTopicId);
      if (topicId) body.topicId = topicId;
      if (difficulty && difficulty !== 'all') {
        body.difficulty = difficulty;
      }

      const { questions } = await postSmartPractice(body);
      const list = Array.isArray(questions) ? questions : [];
      if (list.length === 0) {
        setStartError('No questions available for this selection');
        return;
      }
      const questionIds = questionIdsFromDocs(list);
      navigation.navigate('Test', {
        mode: 'practice',
        practiceType: 'smart',
        questionIds,
        questions: list,
        originMainTab: 'Practice',
      });
    } catch (e) {
      setStartError(getApiErrorMessage(e));
    } finally {
      setTimeout(() => {
        startLockRef.current = false;
        setStarting(false);
      }, NAV_TRANSITION_LOCK_MS);
    }
  }, [
    canStart,
    questionCount,
    selectedPostId,
    selectedSubjectId,
    selectedTopicId,
    difficulty,
    navigation,
  ]);

  if (postsLoading) {
    return (
      <View style={styles.center}>
        <LoadingState />
      </View>
    );
  }

  if (postsError) {
    return (
      <View style={styles.centerPad}>
        <ErrorState message={postsError} context="practice filters" onRetry={loadPosts} />
      </View>
    );
  }

  if (activePosts.length === 0) {
    return (
      <View style={styles.centerPad}>
        <EmptyState {...EMPTY.PRACTICE_POSTS} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Practice by Topic</Text>
      <Text style={styles.subtitle}>
        Choose what to practice — subject, focus, and difficulty. No timer; learn at your pace.
      </Text>

      <PracticeSetupSection
        step={1}
        title="Subject"
        helper="Optional — leave blank to mix across subjects."
        selectedHint={
          selectedSubject
            ? `Selected: ${formatTaxonomyLabel(selectedSubject.name || selectedSubject.slug)}`
            : null
        }
      >
        {subjectsLoading && subjects.length === 0 ? (
          <View style={styles.inlineLoading}>
            <LoadingState compact />
          </View>
        ) : subjects.length === 0 ? (
          <EmptyState compact title="No subjects available yet" glyph="filter" />
        ) : (
          <PracticeChipGrid
            items={subjects}
            selectedId={selectedSubjectId}
            onSelect={pickSubject}
            getId={(it) => it._id}
          />
        )}
      </PracticeSetupSection>

      {selectedSubjectId ? (
        <PracticeSetupSection
          step={2}
          title="Topic"
          helper="Optional — narrow to one topic, or practice the whole subject."
          selectedHint={
            selectedTopic
              ? `Selected: ${formatTaxonomyLabel(selectedTopic.name || selectedTopic.slug)}`
              : null
          }
        >
          {topicsLoading && topics.length === 0 ? (
            <View style={styles.inlineLoading}>
              <LoadingState compact />
            </View>
          ) : topics.length === 0 ? (
            <EmptyState
              compact
              title="No topics yet — we'll use the full subject"
              glyph="filter"
            />
          ) : (
            <PracticeChipGrid
              items={topics}
              selectedId={selectedTopicId}
              onSelect={pickTopic}
              getId={(it) => resolveTopicId(it._id)}
            />
          )}
        </PracticeSetupSection>
      ) : null}

      <PracticeSetupSection
        step={selectedSubjectId ? 3 : 2}
        title="Difficulty"
        helper="Filter by question difficulty, or keep All."
      >
        <View style={styles.difficultyWrap}>
          {DIFFICULTY_OPTIONS.map((opt) => (
            <View key={opt.id} style={styles.difficultyCell}>
              <PracticeSetupChip
                label={opt.label}
                selected={difficulty === opt.id}
                onPress={() => setDifficulty(opt.id)}
                compact
              />
            </View>
          ))}
        </View>
      </PracticeSetupSection>

      <PracticeSetupSection
        step={selectedSubjectId ? 4 : 3}
        title="Number of questions"
        helper="Quick presets — you can change anytime before starting."
      >
        <QuestionCountSegment value={questionCount} onChange={setQuestionCount} />
      </PracticeSetupSection>

      <PracticeSetupSection
        step={selectedSubjectId ? 5 : 4}
        title="Exam filter"
        optional
        helper="Filter by recruitment / exam tag. Skip if you want all posts."
        selectedHint={
          selectedPost
            ? `Filter: ${formatTaxonomyLabel(selectedPost.name || selectedPost.slug)}`
            : null
        }
      >
        <PracticeChipGrid
          items={activePosts}
          selectedId={selectedPostId}
          onSelect={pickPost}
          getId={(it) => it._id}
        />
      </PracticeSetupSection>

      <PracticeStartFooter
        headline={summary.headline}
        sublines={summary.sublines}
        helperText="Tap a selected chip again to clear that filter."
        error={startError}
        starting={starting}
        disabled={!canStart}
        onStart={handleStart}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
  centerPad: { flex: 1, padding: 16, backgroundColor: colors.bg },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 22,
    maxWidth: 400,
  },

  inlineLoading: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  difficultyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  difficultyCell: {
    width: '25%',
    minWidth: 72,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
});
