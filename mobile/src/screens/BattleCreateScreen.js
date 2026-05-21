import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import {
  createBattle,
  getBattleAvailability,
} from '../services/battleService';
import { usePracticeTaxonomy } from '../hooks/usePracticeTaxonomy';
import { useBattleQuota } from '../hooks/useBattleQuota';
import PracticeSetupSection from '../components/practice/PracticeSetupSection';
import PracticeChipGrid from '../components/practice/PracticeChipGrid';
import PracticeSetupChip from '../components/practice/PracticeSetupChip';
import QuestionCountSegment from '../components/practice/QuestionCountSegment';
import PracticeStartFooter from '../components/practice/PracticeStartFooter';
import { LoadingState, ErrorState } from '../components/StateView';
import { colors } from '../theme/colors';
import { NAV_TRANSITION_LOCK_MS, tryAcquireLock } from '../utils/navigationGuard';
import { resolveTopicId } from '../utils/topicRef';
import { resolveMongoId } from '../utils/mongoId';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { useAuth } from '../context/AuthContext';

const DIFFICULTY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

const TIMER_OPTIONS = [
  { id: 'none', label: 'No timer' },
  { id: 'total', label: 'Total time' },
];

const MIN_Q = 5;
const MAX_Q = 50;
const DEFAULT_Q = 10;

export default function BattleCreateScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { quota, loading: quotaLoading, reload: reloadQuota } = useBattleQuota();

  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [questionCount, setQuestionCount] = useState(DEFAULT_Q);
  const [timerMode, setTimerMode] = useState('none');
  const [timerMinutes, setTimerMinutes] = useState(15);

  const { subjects, subjectsLoading, topics, topicsLoading } =
    usePracticeTaxonomy(selectedSubjectId);

  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [startError, setStartError] = useState(null);
  const [creating, setCreating] = useState(false);
  const startLockRef = useRef(false);
  const availAbortRef = useRef(null);

  const selectedTopic = useMemo(
    () => topics.find((t) => resolveTopicId(t?._id) === selectedTopicId) || null,
    [topics, selectedTopicId]
  );

  const loadAvailability = useCallback(async () => {
    const subjectId = resolveMongoId(selectedSubjectId, 'subjectId');
    const topicId = resolveTopicId(selectedTopicId);
    if (!subjectId || !topicId) {
      setAvailability(null);
      return;
    }
    availAbortRef.current?.abort();
    const ac = new AbortController();
    availAbortRef.current = ac;
    setAvailLoading(true);
    try {
      const data = await getBattleAvailability(
        { subjectId, topicId, difficulty },
        { signal: ac.signal }
      );
      if (availAbortRef.current !== ac) return;
      setAvailability(data);
      const max = Math.min(MAX_Q, data?.availableCount ?? MAX_Q);
      if (questionCount > max) setQuestionCount(Math.max(MIN_Q, max));
    } catch (e) {
      if (isRequestCancelled(e) || availAbortRef.current !== ac) return;
      setAvailability(null);
    } finally {
      if (availAbortRef.current === ac) setAvailLoading(false);
    }
  }, [selectedSubjectId, selectedTopicId, difficulty, questionCount]);

  useEffect(() => {
    void loadAvailability();
    return () => availAbortRef.current?.abort();
  }, [loadAvailability]);

  const premium = userHasPremiumAccess(user);
  const canCreate = quota?.canCreate !== false;
  const availableCount = availability?.availableCount ?? 0;
  const maxSelectable = Math.min(MAX_Q, availableCount || MAX_Q);
  const canStart =
    canCreate &&
    selectedSubjectId &&
    selectedTopicId &&
    questionCount >= MIN_Q &&
    questionCount <= maxSelectable &&
    (availability?.canCreateBattle !== false);

  const handleCreate = useCallback(async () => {
    if (!canStart || !tryAcquireLock(startLockRef)) return;
    setStartError(null);
    setCreating(true);
    try {
      const body = {
        subjectId: resolveMongoId(selectedSubjectId, 'subjectId'),
        topicId: resolveTopicId(selectedTopicId),
        difficulty,
        questionCount,
        timerMode,
      };
      if (timerMode === 'total') {
        body.timerSeconds = Math.max(60, Math.floor(timerMinutes) * 60);
      }
      const data = await createBattle(body);
      await reloadQuota();
      const battle = data?.battle;
      if (!battle?.id) {
        setStartError('Could not create battle. Try again.');
        return;
      }
      navigation.replace('BattleLobby', { battleId: battle.id, created: true });
    } catch (e) {
      if (!isRequestCancelled(e)) {
        setStartError(getApiErrorMessage(e));
      }
    } finally {
      setCreating(false);
    }
  }, [
    canStart,
    selectedSubjectId,
    selectedTopicId,
    difficulty,
    questionCount,
    timerMode,
    timerMinutes,
    navigation,
    reloadQuota,
  ]);

  if (subjectsLoading && !subjects.length) {
    return <LoadingState message="Loading subjects…" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Challenge a friend with the same random questions. You choose the topic — the server picks
        the questions.
      </Text>

      {!premium && !quotaLoading && quota ? (
        <View style={styles.quotaCard}>
          <Text style={styles.quotaText}>
            Today: {quota.createdToday}/{quota.createLimit ?? '∞'} battles created
            {' · '}
            {quota.joinedToday}/{quota.joinLimit ?? '∞'} joined
          </Text>
          {!canCreate ? (
            <Pressable onPress={() => navigation.navigate('Premium', { from: 'battle' })}>
              <Text style={styles.quotaLink}>Upgrade for unlimited battles</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <PracticeSetupSection title="Subject" loading={subjectsLoading}>
        <PracticeChipGrid>
          {subjects.map((s) => (
            <PracticeSetupChip
              key={String(s._id)}
              label={s.name}
              selected={String(s._id) === String(selectedSubjectId)}
              onPress={() => {
                setSelectedSubjectId((prev) =>
                  String(prev) === String(s._id) ? '' : String(s._id)
                );
                setSelectedTopicId('');
              }}
            />
          ))}
        </PracticeChipGrid>
      </PracticeSetupSection>

      {selectedSubjectId ? (
        <PracticeSetupSection title="Topic" loading={topicsLoading}>
          <PracticeChipGrid>
            {topics.map((t) => {
              const tid = resolveTopicId(t?._id);
              return (
                <PracticeSetupChip
                  key={tid}
                  label={t.name}
                  selected={tid === selectedTopicId}
                  onPress={() =>
                    setSelectedTopicId((prev) => (prev === tid ? '' : tid))
                  }
                />
              );
            })}
          </PracticeChipGrid>
        </PracticeSetupSection>
      ) : null}

      {selectedTopicId ? (
        <>
          <PracticeSetupSection title="Difficulty">
            <PracticeChipGrid>
              {DIFFICULTY_OPTIONS.map((d) => (
                <PracticeSetupChip
                  key={d.id}
                  label={d.label}
                  selected={difficulty === d.id}
                  onPress={() => setDifficulty(d.id)}
                />
              ))}
            </PracticeChipGrid>
          </PracticeSetupSection>

          <PracticeSetupSection title="Questions">
            {availLoading ? (
              <Text style={styles.availHint}>Checking pool…</Text>
            ) : (
              <Text style={styles.availHint}>
                {availableCount} questions available in this pool
              </Text>
            )}
            <QuestionCountSegment value={questionCount} onChange={setQuestionCount} />
          </PracticeSetupSection>

          <PracticeSetupSection title="Timer">
            <PracticeChipGrid>
              {TIMER_OPTIONS.map((t) => (
                <PracticeSetupChip
                  key={t.id}
                  label={t.label}
                  selected={timerMode === t.id}
                  onPress={() => setTimerMode(t.id)}
                />
              ))}
            </PracticeChipGrid>
            {timerMode === 'total' ? (
              <PracticeChipGrid>
                {[10, 15, 20, 30].map((m) => (
                  <PracticeSetupChip
                    key={m}
                    label={`${m} min`}
                    selected={timerMinutes === m}
                    onPress={() => setTimerMinutes(m)}
                  />
                ))}
              </PracticeChipGrid>
            ) : null}
          </PracticeSetupSection>
        </>
      ) : null}

      {startError ? <Text style={styles.err}>{startError}</Text> : null}

      <PracticeStartFooter
        summary={
          selectedTopic
            ? `${questionCount} questions · ${selectedTopic.name} · Battle`
            : 'Select subject and topic'
        }
        onStart={handleCreate}
        starting={creating}
        disabled={!canStart}
        startLabel="Create battle"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  lead: { fontSize: 15, color: colors.muted, marginBottom: 16, lineHeight: 22 },
  quotaCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  quotaText: { fontSize: 13, color: colors.text },
  quotaLink: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 6 },
  availHint: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  err: { color: colors.error, marginBottom: 12 },
});
