import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import api, { getApiErrorMessage } from '../services/api';
import { submitTest } from '../services/testService';
import { completeDailyPractice } from '../services/dailyPracticeService';
import AppButton from '../components/AppButton';
import { colors } from '../theme/colors';

function formatMmSs(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function TestScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params || {};
  const { testId, attempt, durationMinutes } = params;
  const isRetry = params.mode === 'retry';
  const isPractice = params.mode === 'practice';
  const isDaily = params.mode === 'daily';
  const isLocal = isRetry || isPractice || isDaily;
  const questionIds = isLocal
    ? (Array.isArray(params.questionIds) ? params.questionIds : [])
    : (attempt?.questionIds ?? []);
  const preloadedQuestions = isLocal && Array.isArray(params.questions) ? params.questions : null;
  const localHeaderLabel = isPractice
    ? 'Practice Mode'
    : isRetry
    ? 'Retry Mode'
    : isDaily
    ? 'Daily Practice'
    : null;
  const localFinishLabel = isRetry
    ? 'Finish Retry'
    : isDaily
    ? 'Finish Daily Practice'
    : 'Finish Practice';

  const initialSeconds = useMemo(
    () => Math.max(0, Math.floor((Number(durationMinutes) || 0) * 60)),
    [durationMinutes]
  );

  const idsKey = useMemo(() => questionIds.map((id) => String(id)).join(','), [questionIds]);

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => {
    const m = {};
    if (!isLocal && Array.isArray(attempt?.answers)) {
      for (const a of attempt.answers) {
        m[String(a.questionId)] = a.selectedOptionIndex;
      }
    }
    return m;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(initialSeconds);

  const intervalRef = useRef(null);
  const endTimeMsRef = useRef(0);
  const submitLockRef = useRef(false);
  const autoFiredRef = useRef(false);

  const stopTimer = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    autoFiredRef.current = false;
  }, [initialSeconds]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!questionIds.length) {
        setError(
          isPractice || isDaily
            ? 'No questions to practice.'
            : isRetry
            ? 'No questions to retry.'
            : 'No questions in this attempt.'
        );
        setLoading(false);
        return;
      }

      if (preloadedQuestions && preloadedQuestions.length) {
        const order = questionIds.map((id) => String(id));
        const byId = new Map(preloadedQuestions.map((q) => [String(q._id), q]));
        const ordered = order.map((id) => byId.get(id));
        setError(null);
        setQuestions(ordered);
        setLoading(false);
        return;
      }

      setError(null);
      setLoading(true);
      try {
        const idsParam = questionIds.map((id) => String(id)).join(',');
        const { data } = await api.get('/questions', { params: { ids: idsParam } });
        const raw = data?.data?.questions ?? [];
        const order = questionIds.map((id) => String(id));
        const byId = new Map(raw.map((q) => [String(q._id), q]));
        const ordered = order.map((id) => byId.get(id));
        if (!cancelled) {
          setQuestions(ordered);
        }
      } catch (e) {
        if (!cancelled) {
          setError(getApiErrorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [idsKey, isLocal, isRetry, isPractice, isDaily, preloadedQuestions]);

  const total = questions.length;
  const question = questions[index];
  const currentId = question ? String(question._id) : null;

  const selectOption = (optionIndex) => {
    if (!currentId) return;
    setAnswers((prev) => ({ ...prev, [currentId]: optionIndex }));
  };

  const goNext = () => {
    if (index < total - 1) setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const attemptedCount = useMemo(
    () => questionIds.filter((qid) => answers[String(qid)] !== undefined).length,
    [questionIds, answers]
  );

  const navigateToResult = useCallback(
    (data) => {
      const payload = data || {};
      navigation.navigate('Result', {
        score: payload.score ?? 0,
        accuracy: payload.accuracy ?? 0,
        timeTaken: payload.timeTaken ?? 0,
        weakTopics: Array.isArray(payload.weakTopics) ? payload.weakTopics : [],
        totalQuestions: questionIds.length,
        attemptedQuestions: attemptedCount,
        questions: questions.filter((q) => q !== undefined),
        userAnswers: answers,
        correctAnswers: Array.isArray(payload.correctAnswers)
          ? payload.correctAnswers
          : [],
      });
    },
    [navigation, questionIds.length, attemptedCount, questions, answers]
  );

  const executeSubmit = useCallback(
    async ({ autoSubmit = false } = {}) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setSubmitting(true);
      stopTimer();
      setSubmitError(null);

      try {
        if (!testId) {
          setSubmitError('Missing test id.');
          return;
        }
        if (!questionIds.length) {
          setSubmitError('No questions to submit.');
          return;
        }
        const unavailable = questions.some((q) => q === undefined);
        if (unavailable) {
          setSubmitError('Some questions could not be loaded. You cannot submit this attempt.');
          return;
        }

        let payload;
        if (autoSubmit) {
          payload = questionIds.map((qid) => ({
            questionId: String(qid),
            selectedOptionIndex: answers[String(qid)] ?? null,
          }));
        } else {
          const unanswered = questionIds.filter((qid) => answers[String(qid)] === undefined);
          if (unanswered.length > 0) {
            setSubmitError('Please answer every question before submitting.');
            return;
          }
          payload = Object.entries(answers).map(([questionId, selectedOptionIndex]) => ({
            questionId,
            selectedOptionIndex,
          }));
        }

        const data = await submitTest(testId, payload);
        navigateToResult(data);
      } catch (e) {
        setSubmitError(getApiErrorMessage(e));
      } finally {
        setSubmitting(false);
        submitLockRef.current = false;
      }
    },
    [testId, questionIds, questions, answers, navigateToResult, stopTimer]
  );

  const confirmManualSubmit = useCallback(() => {
    void executeSubmit({ autoSubmit: false });
  }, [executeSubmit]);

  const handleSubmitPress = useCallback(() => {
    Alert.alert('Submit Test', 'Are you sure you want to submit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: confirmManualSubmit },
    ]);
  }, [confirmManualSubmit]);

  const handleFinishLocal = useCallback(async () => {
    if (isRetry) {
      navigation.navigate('Result', {
        retry: true,
        retryAnswers: answers,
        retryQuestions: questions.filter((q) => q !== undefined),
      });
      return;
    }

    if (isDaily) {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const validQuestions = questions.filter((q) => q !== undefined);
        const correctAnswers = validQuestions.map((q) => ({
          questionId: String(q._id),
          correctAnswerIndex: q.correctAnswerIndex,
        }));
        let correctCount = 0;
        const weakTopicsMap = new Map();
        for (const q of validQuestions) {
          const qid = String(q._id);
          const userAns = answers[qid];
          const correctIdx = q.correctAnswerIndex;
          if (userAns != null && userAns === correctIdx) {
            correctCount += 1;
          } else if (userAns != null && userAns !== correctIdx && q.topicId) {
            const tid = String(q.topicId);
            weakTopicsMap.set(tid, (weakTopicsMap.get(tid) || 0) + 1);
          }
        }
        const total = validQuestions.length;
        const attemptedQuestions = Object.keys(answers).length;
        const accuracy =
          total === 0
            ? 0
            : Math.round(((correctCount / total) * 100 + Number.EPSILON) * 100) / 100;
        const weakTopics = Array.from(weakTopicsMap.entries())
          .map(([topicId, mistakeCount]) => ({ topicId, mistakeCount }))
          .sort((a, b) => b.mistakeCount - a.mistakeCount)
          .slice(0, 10);

        try {
          await completeDailyPractice();
        } catch (e) {
          console.log('[DAILY] complete failed:', getApiErrorMessage(e));
        }

        navigation.navigate('Result', {
          score: correctCount,
          accuracy,
          timeTaken: 0,
          weakTopics,
          totalQuestions: total,
          attemptedQuestions,
          questions: validQuestions,
          userAnswers: answers,
          correctAnswers,
        });
      } catch (e) {
        setSubmitError(getApiErrorMessage(e));
      } finally {
        setSubmitting(false);
        submitLockRef.current = false;
      }
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  }, [navigation, answers, questions, isRetry, isDaily]);

  useEffect(() => {
    if (loading || error || total === 0) return;
    if (initialSeconds <= 0) return;

    endTimeMsRef.current = Date.now() + initialSeconds * 1000;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((endTimeMsRef.current - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0 && intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loading, error, total, initialSeconds]);

  useEffect(() => {
    if (loading || error || total === 0) return;
    if (initialSeconds <= 0) return;
    if (timeLeft > 0) return;
    if (autoFiredRef.current) return;
    if (submitLockRef.current) return;
    autoFiredRef.current = true;
    void executeSubmit({ autoSubmit: true });
  }, [loading, error, total, initialSeconds, timeLeft, executeSubmit]);

  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  const timerLabel =
    initialSeconds > 0 ? `Time Left: ${formatMmSs(timeLeft)}` : null;
  const showTimerWarning = initialSeconds > 0 && timeLeft <= 60;
  const attempted = Object.keys(answers).length;
  const totalQuestionsCount = questionIds.length;
  const attemptSummaryLabel = `Attempted: ${attempted} / ${totalQuestionsCount}`;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading questions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.err}>{error}</Text>
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>No questions to display.</Text>
      </View>
    );
  }

  if (!question) {
    return (
      <View style={styles.container}>
        {localHeaderLabel ? <Text style={styles.retryHeader}>{localHeaderLabel}</Text> : null}
        {timerLabel ? (
          <View style={styles.timerBlock}>
            <Text style={[styles.timer, showTimerWarning && styles.timerWarn]}>{timerLabel}</Text>
            {showTimerWarning ? <Text style={styles.hurryText}>Hurry up!</Text> : null}
          </View>
        ) : null}
        <Text style={styles.attemptSummary}>{attemptSummaryLabel}</Text>
        <Text style={styles.header}>
          Question {index + 1} / {total}
        </Text>
        <View style={styles.centered}>
          <Text>Question not available</Text>
        </View>
        {submitError ? <Text style={styles.err}>{submitError}</Text> : null}
        <View style={styles.nav}>
          <AppButton
            title="Previous"
            variant="secondary"
            onPress={goPrev}
            disabled={index === 0 || submitting}
            style={styles.navBtn}
          />
          <AppButton
            title="Next"
            variant="secondary"
            onPress={goNext}
            disabled={index >= total - 1 || submitting}
            style={styles.navBtn}
          />
        </View>
        {isLocal ? (
          <AppButton
            title={isDaily && submitting ? 'Finishing…' : localFinishLabel}
            onPress={handleFinishLocal}
            disabled={isDaily && submitting}
          />
        ) : (
          <AppButton
            title={submitting ? 'Submitting...' : 'Submit Test'}
            onPress={handleSubmitPress}
            disabled={submitting}
          />
        )}
      </View>
    );
  }

  const selected = currentId != null ? answers[currentId] : undefined;

  return (
    <View style={styles.container}>
      {localHeaderLabel ? <Text style={styles.retryHeader}>{localHeaderLabel}</Text> : null}
      {timerLabel ? (
        <View style={styles.timerBlock}>
          <Text style={[styles.timer, showTimerWarning && styles.timerWarn]}>{timerLabel}</Text>
          {showTimerWarning ? <Text style={styles.hurryText}>Hurry up!</Text> : null}
        </View>
      ) : null}
      <Text style={styles.attemptSummary}>{attemptSummaryLabel}</Text>
      <Text style={styles.header}>
        Question {index + 1} / {total}
      </Text>
      <ScrollView style={styles.scroll}>
        <Text style={styles.question}>
          {question?.questionText || '(question unavailable)'}
        </Text>
        {Array.isArray(question?.options) &&
          question.options.map((opt, i) => {
            const isSelected = selected === i;
            return (
              <Pressable
                key={i}
                onPress={() => selectOption(i)}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                  pressed && !submitting && styles.optionRowPressed,
                ]}
              >
                <View
                  style={[
                    styles.optionIndicator,
                    isSelected && styles.optionIndicatorSelected,
                  ]}
                >
                  {isSelected ? <View style={styles.optionIndicatorDot} /> : null}
                </View>
                <Text
                  style={[styles.optionText, isSelected && styles.optionTextSelected]}
                >
                  {`${String.fromCharCode(65 + i)}. ${opt ?? ''}`}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
      {submitError ? <Text style={styles.err}>{submitError}</Text> : null}
      <View style={styles.nav}>
        <AppButton
          title="Previous"
          variant="secondary"
          onPress={goPrev}
          disabled={index === 0 || submitting}
          style={styles.navBtn}
        />
        <AppButton
          title="Next"
          variant="secondary"
          onPress={goNext}
          disabled={index >= total - 1 || submitting}
          style={styles.navBtn}
        />
      </View>
      {isLocal ? (
        <AppButton
          title={isDaily && submitting ? 'Finishing…' : localFinishLabel}
          onPress={handleFinishLocal}
          disabled={isDaily && submitting}
        />
      ) : (
        <AppButton
          title={submitting ? 'Submitting...' : 'Submit Test'}
          onPress={handleSubmitPress}
          disabled={submitting}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  timerBlock: { marginBottom: 4 },
  timer: { fontSize: 16, fontWeight: '600', marginBottom: 4, color: colors.text },
  timerWarn: { color: colors.danger },
  hurryText: { color: colors.danger, fontWeight: '600', marginBottom: 4 },
  attemptSummary: { fontSize: 14, marginBottom: 8, color: colors.muted },
  retryHeader: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: colors.primary },
  header: { fontSize: 16, marginBottom: 12, fontWeight: '600', color: colors.text },
  scroll: { flex: 1 },
  question: { fontSize: 16, marginBottom: 12 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionRowSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionRowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  optionIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIndicatorSelected: {
    borderColor: colors.primary,
  },
  optionIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  optionText: { fontSize: 16, color: colors.text, flex: 1 },
  optionTextSelected: { fontWeight: '600', color: colors.primaryText },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
    gap: 12,
  },
  navBtn: { flex: 1 },
  muted: { color: colors.muted, marginTop: 8 },
  err: { color: colors.danger, textAlign: 'center' },
});
