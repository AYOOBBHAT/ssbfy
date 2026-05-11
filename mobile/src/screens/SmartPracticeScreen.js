import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getPosts } from '../services/pdfService';
import { getSubjectsForPost, getTopicsForSubject } from '../services/noteService';
import { postSmartPractice } from '../services/testService';
import { LoadingState, EmptyState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';

const DIFFICULTY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

const MIN_Q = 1;
const MAX_Q = 50;
const DEFAULT_Q = 10;

export default function SmartPracticeScreen() {
  const navigation = useNavigation();

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(null);

  const [selectedPostId, setSelectedPostId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [difficulty, setDifficulty] = useState('all');
  const [questionCount, setQuestionCount] = useState(String(DEFAULT_Q));

  const [startError, setStartError] = useState(null);
  const [starting, setStarting] = useState(false);
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
      setSelectedPostId((prev) => prev || list[0]?._id || '');
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
    const ac = new AbortController();
    if (!selectedPostId) {
      setSubjects([]);
      return undefined;
    }
    (async () => {
      setSubjectsLoading(true);
      try {
        const data = await getSubjectsForPost(selectedPostId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setSubjects(Array.isArray(data?.subjects) ? data.subjects : []);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setSubjects([]);
      } finally {
        if (!ac.signal.aborted) setSubjectsLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [selectedPostId]);

  useEffect(() => {
    const ac = new AbortController();
    if (!selectedSubjectId) {
      setTopics([]);
      return undefined;
    }
    (async () => {
      setTopicsLoading(true);
      try {
        const data = await getTopicsForSubject(selectedSubjectId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setTopics(Array.isArray(data?.topics) ? data.topics : []);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setTopics([]);
      } finally {
        if (!ac.signal.aborted) setTopicsLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [selectedSubjectId]);

  function pickPost(id) {
    setSelectedPostId(id);
    setSelectedSubjectId('');
    setSelectedTopicId('');
  }

  function pickSubject(id) {
    setSelectedSubjectId((prev) => (prev === id ? '' : id));
    setSelectedTopicId('');
  }

  function pickTopic(id) {
    setSelectedTopicId((prev) => (prev === id ? '' : id));
  }

  const limitNum = useMemo(() => {
    const n = parseInt(String(questionCount).trim(), 10);
    if (!Number.isFinite(n)) return DEFAULT_Q;
    return Math.min(MAX_Q, Math.max(MIN_Q, n));
  }, [questionCount]);

  const canStart =
    Boolean(selectedPostId || selectedSubjectId || selectedTopicId) && !starting;

  const handleAdjustCount = (delta) => {
    setQuestionCount(String(Math.min(MAX_Q, Math.max(MIN_Q, limitNum + delta))));
  };

  const handleStart = async () => {
    if (!canStart) return;
    setStartError(null);
    setStarting(true);
    try {
      const body = {
        limit: limitNum,
      };
      if (selectedPostId) body.postId = selectedPostId;
      if (selectedSubjectId) body.subjectId = selectedSubjectId;
      if (selectedTopicId) body.topicId = selectedTopicId;
      if (difficulty && difficulty !== 'all') {
        body.difficulty = difficulty;
      }

      const { questions } = await postSmartPractice(body);
      const list = Array.isArray(questions) ? questions : [];
      if (list.length === 0) {
        setStartError('No questions available for this selection');
        return;
      }
      const questionIds = list.map((q) => String(q?._id)).filter(Boolean);
      navigation.navigate('Test', {
        mode: 'practice',
        questionIds,
        questions: list,
      });
    } catch (e) {
      setStartError(getApiErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const activePosts = useMemo(
    () => posts.filter((p) => p?.isActive !== false),
    [posts]
  );

  const renderChipRow = (label, items, selectedId, onSelect, loading, emptyHint) => {
    if (loading) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{label}</Text>
          <View style={styles.cardPad}>
            <LoadingState label={`Loading…`} compact />
          </View>
        </View>
      );
    }
    if (!items?.length) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{label}</Text>
          <View style={styles.cardPad}>
            <Text style={styles.muted}>{emptyHint}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {items.map((it) => {
            const id = String(it._id);
            const active = String(selectedId) === id;
            return (
              <Pressable
                key={id}
                onPress={() => onSelect(it._id)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {it?.name || it?.slug || '—'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {label === 'Subject' && selectedPostId ? (
          <Text style={styles.hint}>Tap again to clear — practice all subjects in this post.</Text>
        ) : null}
        {label === 'Topic' && selectedSubjectId ? (
          <Text style={styles.hint}>Tap again to clear — practice the whole subject.</Text>
        ) : null}
      </View>
    );
  };

  if (postsLoading) {
    return (
      <View style={styles.center}>
        <LoadingState label="Loading…" />
      </View>
    );
  }

  if (postsError) {
    return (
      <View style={styles.centerPad}>
        <ErrorState message={postsError} onRetry={loadPosts} />
      </View>
    );
  }

  if (activePosts.length === 0) {
    return (
      <View style={styles.centerPad}>
        <EmptyState
          title="No posts yet"
          subtitle="Content will appear once an admin adds exams."
          emoji="📚"
        />
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
        Select a subject or topic and start targeted practice. Choose post and
        filters below—questions run with no timer.
      </Text>

      {renderChipRow(
        'Post',
        activePosts,
        selectedPostId,
        pickPost,
        false,
        'Pick a post'
      )}

      {selectedPostId
        ? renderChipRow(
            'Subject',
            subjects,
            selectedSubjectId,
            pickSubject,
            subjectsLoading,
            'No subjects for this post'
          )
        : null}

      {selectedSubjectId
        ? renderChipRow(
            'Topic (optional)',
            topics,
            selectedTopicId,
            pickTopic,
            topicsLoading,
            'No topics — use subject-wide practice'
          )
        : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = difficulty === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setDifficulty(opt.id)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Number of questions ({MIN_Q}–{MAX_Q})</Text>
        <View style={styles.countRow}>
          <Pressable
            onPress={() => handleAdjustCount(-1)}
            style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}
          >
            <Text style={styles.countBtnText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.countInput}
            value={questionCount}
            onChangeText={setQuestionCount}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Pressable
            onPress={() => handleAdjustCount(1)}
            style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}
          >
            <Text style={styles.countBtnText}>+</Text>
          </Pressable>
          <Text style={styles.countHint}>Default {DEFAULT_Q}</Text>
        </View>
      </View>

      {startError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{startError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleStart}
        disabled={!canStart}
        style={({ pressed }) => [
          styles.primaryBtn,
          (!canStart || starting) && styles.primaryBtnDisabled,
          pressed && canStart && !starting && styles.pressed,
        ]}
      >
        {starting ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <Text style={styles.primaryBtnText}>Start Practice</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.bg },
  centerPad: { flex: 1, padding: 16, backgroundColor: colors.bg },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 20,
  },

  section: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardPad: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'nowrap', paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.textOnPrimary },
  hint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  muted: { fontSize: 13, color: colors.muted },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  countBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: { fontSize: 22, fontWeight: '700', color: colors.text },
  countInput: {
    minWidth: 56,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  countHint: { fontSize: 13, color: colors.muted },

  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: { opacity: 0.85 },
});
