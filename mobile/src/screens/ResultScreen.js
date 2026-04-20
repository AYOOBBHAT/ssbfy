import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getQuestionsByTopic } from '../services/testService';
import { getTopics } from '../services/topicService';
import { getApiErrorMessage } from '../services/api';
import { EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';

const PRIMARY = colors.primary;
const TEXT = colors.text;
const MUTED = colors.muted;
const BORDER = colors.border;
const BG = colors.bg;
const CARD_BG = colors.card;

const TIER_HIGH = { color: colors.success, bg: colors.successSoft, message: 'Great job! 🎉' };
const TIER_MID = { color: colors.warning, bg: colors.warningSoft, message: 'Good effort 👍' };
const TIER_LOW = { color: colors.danger, bg: colors.dangerSoft, message: 'Keep practicing 💪' };

function getPerformanceTier(accuracy) {
  const pct = Number(accuracy) || 0;
  if (pct >= 80) return TIER_HIGH;
  if (pct >= 50) return TIER_MID;
  return TIER_LOW;
}

function getOptionStyle(optionIndex, correctAnswer, userAnswer) {
  if (correctAnswer != null && optionIndex === correctAnswer) {
    return styles.optionCorrect;
  }
  if (
    userAnswer != null &&
    optionIndex === userAnswer &&
    userAnswer !== correctAnswer
  ) {
    return styles.optionWrong;
  }
  return styles.optionDefault;
}

export default function ResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params;
  const hasParams = !!params && typeof params === 'object';
  const {
    score,
    accuracy,
    timeTaken,
    weakTopics = [],
    totalQuestions = 0,
    attemptedQuestions = 0,
    questions = [],
    userAnswers = {},
    correctAnswers = [],
    retry = false,
    retryAnswers = {},
    retryQuestions = [],
  } = params || {};
  const isRetry = !!retry;

  const correctAnswerMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(correctAnswers)) {
      for (const c of correctAnswers) {
        if (c?.questionId != null) {
          m.set(String(c.questionId), c.correctAnswerIndex);
        }
      }
    }
    return m;
  }, [correctAnswers]);

  const reviewItems = useMemo(() => {
    return (Array.isArray(questions) ? questions : []).map((q) => {
      const qid = String(q?._id ?? '');
      const userRaw = userAnswers ? userAnswers[qid] : undefined;
      const userAnswer = userRaw === undefined ? null : userRaw;
      const correctAnswer = correctAnswerMap.has(qid)
        ? correctAnswerMap.get(qid)
        : null;
      return {
        key: qid,
        question: q,
        userAnswer,
        correctAnswer,
      };
    });
  }, [questions, userAnswers, correctAnswerMap]);

  const wrongQuestions = useMemo(() => {
    return (Array.isArray(questions) ? questions : []).filter((q) => {
      const qid = String(q?._id ?? '');
      const userAnswer = userAnswers ? userAnswers[qid] : undefined;
      const correct = correctAnswerMap.has(qid) ? correctAnswerMap.get(qid) : undefined;
      return correct != null && userAnswer !== correct;
    });
  }, [questions, userAnswers, correctAnswerMap]);

  const wrongQuestionIds = useMemo(
    () => wrongQuestions.map((q) => String(q._id)),
    [wrongQuestions]
  );

  const retryStats = useMemo(() => {
    if (!isRetry) return null;
    const list = Array.isArray(retryQuestions) ? retryQuestions : [];
    const total = list.length;
    let correct = 0;
    for (const q of list) {
      const qid = String(q?._id ?? '');
      const userAnswer = retryAnswers ? retryAnswers[qid] : undefined;
      const correctAnswer = correctAnswerMap.has(qid) ? correctAnswerMap.get(qid) : undefined;
      if (
        userAnswer != null &&
        correctAnswer != null &&
        userAnswer === correctAnswer
      ) {
        correct += 1;
      }
    }
    const accuracyPct =
      total === 0
        ? 0
        : Math.round(((correct / total) * 100 + Number.EPSILON) * 100) / 100;
    return { correct, total, accuracyPct };
  }, [isRetry, retryQuestions, retryAnswers, correctAnswerMap]);

  const retryWrongQuestions = useMemo(() => {
    if (!isRetry) return [];
    return (Array.isArray(retryQuestions) ? retryQuestions : []).filter((q) => {
      const qid = String(q?._id ?? '');
      const userAnswer = retryAnswers ? retryAnswers[qid] : undefined;
      const correct = correctAnswerMap.has(qid) ? correctAnswerMap.get(qid) : undefined;
      return correct != null && userAnswer !== correct;
    });
  }, [isRetry, retryQuestions, retryAnswers, correctAnswerMap]);

  const retryWrongQuestionIds = useMemo(
    () => retryWrongQuestions.map((q) => String(q._id)),
    [retryWrongQuestions]
  );

  const handleRetryWrong = () => {
    if (!wrongQuestionIds.length) return;
    navigation.navigate('Test', {
      mode: 'retry',
      questionIds: wrongQuestionIds,
      questions: wrongQuestions,
    });
  };

  const handleRetryAgain = () => {
    if (!retryWrongQuestionIds.length) return;
    navigation.navigate('Test', {
      mode: 'retry',
      questionIds: retryWrongQuestionIds,
      questions: retryWrongQuestions,
    });
  };

  const [practiceTopicId, setPracticeTopicId] = useState(null);
  const [practiceError, setPracticeError] = useState(null);
  const [topicMap, setTopicMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getTopics();
        const list = Array.isArray(data?.topics) ? data.topics : [];
        const map = {};
        list.forEach((t) => {
          if (t?._id != null) {
            map[String(t._id)] = t.name ?? '';
          }
        });
        if (!cancelled) setTopicMap(map);
      } catch (e) {
        console.log('[TOPICS] failed to load:', getApiErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePractice = async (topicId) => {
    if (!topicId || practiceTopicId) return;
    const id = String(topicId);
    setPracticeError(null);
    setPracticeTopicId(id);
    try {
      const data = await getQuestionsByTopic(id, { limit: 10 });
      const fetched = Array.isArray(data?.questions) ? data.questions : [];
      const limited = fetched.slice(0, 15);
      const questionIds = limited.map((q) => String(q?._id)).filter(Boolean);
      if (!questionIds.length) {
        setPracticeError('No practice questions available for this topic.');
        return;
      }
      navigation.navigate('Test', {
        mode: 'practice',
        questionIds,
        questions: limited,
      });
    } catch (e) {
      setPracticeError(getApiErrorMessage(e));
    } finally {
      setPracticeTopicId(null);
    }
  };

  const tier = getPerformanceTier(accuracy);

  const renderHeader = () => (
    <View>
      <View
        style={[
          styles.heroCard,
          { borderColor: tier.color, backgroundColor: tier.bg },
        ]}
      >
        <Text style={styles.heroLabel}>Your Score</Text>
        <Text style={[styles.heroScore, { color: tier.color }]}>
          {String(score ?? 0)}
        </Text>
        <Text style={styles.heroAccuracy}>
          Accuracy: <Text style={styles.heroAccuracyValue}>{String(accuracy ?? 0)}%</Text>
        </Text>
        <Text style={[styles.heroMessage, { color: tier.color }]}>
          {tier.message}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{String(totalQuestions)}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{String(attemptedQuestions)}</Text>
          <Text style={styles.statLabel}>Attempted</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{String(timeTaken ?? 0)}s</Text>
          <Text style={styles.statLabel}>Time</Text>
        </View>
      </View>

      {retryStats ? (
        <View style={styles.retryBlock}>
          <Text style={styles.sectionTitle}>Retry Performance</Text>
          <Text style={styles.retryLine}>
            Correct: <Text style={styles.retryStrong}>{String(retryStats.correct)} / {String(retryStats.total)}</Text>
          </Text>
          <Text style={styles.retryLine}>
            Accuracy: <Text style={styles.retryStrong}>{String(retryStats.accuracyPct)}%</Text>
          </Text>
          <Text style={styles.retryLine}>
            Improvement: <Text style={styles.retryStrong}>+{String(retryStats.correct)}</Text>{' '}
            (originally 0 / {String(retryStats.total)} on these)
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Weak Topics</Text>
      {Array.isArray(weakTopics) && weakTopics.length > 0 ? (
        <View style={styles.sectionCard}>
          <FlatList
            data={weakTopics}
            keyExtractor={(item, idx) => String(item?.topicId ?? idx)}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.weakSeparator} />}
            renderItem={({ item }) => {
              const topicIdStr = String(item?.topicId ?? '');
              const loadingThis = practiceTopicId === topicIdStr;
              const topicName =
                (topicIdStr && topicMap[topicIdStr]) || 'Unknown Topic';
              return (
                <View style={styles.weakTopicRow}>
                  <View style={styles.weakTopicTextBlock}>
                    <Text style={styles.weakTopicName}>{topicName}</Text>
                    <Text style={styles.weakTopicMistakes}>
                      {`Mistakes: ${String(item?.mistakeCount ?? 0)}`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handlePractice(item?.topicId)}
                    disabled={practiceTopicId != null}
                    style={({ pressed }) => [
                      styles.practiceBtn,
                      pressed && styles.btnPressed,
                      practiceTopicId != null && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.practiceBtnText}>
                      {loadingThis ? 'Loading…' : 'Practice'}
                    </Text>
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      ) : (
        <View style={styles.sectionCard}>
          <EmptyState
            title="No weak topics"
            subtitle="Great job — you nailed every topic!"
            emoji="🎉"
            compact
          />
        </View>
      )}
      {practiceError ? <Text style={styles.err}>{practiceError}</Text> : null}

      <Text style={styles.sectionTitle}>Review Answers</Text>
    </View>
  );

  const renderFooter = () => {
    const noWrongOriginal = !isRetry && wrongQuestionIds.length === 0;
    const noWrongRetry = isRetry && retryWrongQuestionIds.length === 0;
    const allCorrect = noWrongOriginal || noWrongRetry;

    return (
      <View style={styles.footer}>
        {allCorrect ? (
          <View style={styles.allCorrectCard}>
            <Text style={styles.successText}>
              🎉 All answers correct! No retry needed.
            </Text>
          </View>
        ) : null}
        {!isRetry && wrongQuestionIds.length > 0 ? (
          <Pressable
            onPress={handleRetryWrong}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>Retry Wrong Questions</Text>
          </Pressable>
        ) : null}
        {isRetry && retryWrongQuestionIds.length > 0 ? (
          <Pressable
            onPress={handleRetryAgain}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>Retry Again</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => navigation.navigate('Home')}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  };

  const renderItem = ({ item, index }) => {
    const { question, userAnswer, correctAnswer } = item || {};
    const options = Array.isArray(question?.options) ? question.options : [];
    const explanation =
      typeof question?.explanation === 'string' && question.explanation.trim()
        ? question.explanation
        : null;
    const unanswered = userAnswer == null;
    const isValidIdx = (n) =>
      Number.isInteger(n) && n >= 0 && n < options.length;

    return (
      <View style={styles.card}>
        <Text style={styles.qIndex}>Q{index + 1}</Text>
        <Text style={styles.qText}>{question?.questionText ?? '(missing question)'}</Text>
        {options.map((opt, i) => (
          <View key={i} style={[styles.optionRow, getOptionStyle(i, correctAnswer, userAnswer)]}>
            <Text style={styles.optionText}>
              {`${String.fromCharCode(65 + i)}. ${opt ?? ''}`}
            </Text>
          </View>
        ))}
        <Text style={styles.metaLine}>
          Your answer:{' '}
          {unanswered
            ? 'Not answered'
            : isValidIdx(userAnswer)
            ? `${String.fromCharCode(65 + userAnswer)}. ${options[userAnswer] ?? ''}`
            : '—'}
        </Text>
        <Text style={styles.metaLine}>
          Correct answer:{' '}
          {isValidIdx(correctAnswer)
            ? `${String.fromCharCode(65 + correctAnswer)}. ${options[correctAnswer] ?? ''}`
            : '—'}
        </Text>
        {explanation ? (
          <Text style={styles.explanation}>Explanation: {explanation}</Text>
        ) : null}
      </View>
    );
  };

  if (!hasParams) {
    return (
      <EmptyState
        title="No data available"
        subtitle="Result data is missing. Please start a test first."
        emoji="📭"
      />
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={reviewItems}
      keyExtractor={(item, idx) => item.key || String(idx)}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={
        <EmptyState
          title="No questions to review"
          subtitle="Nothing to display for this attempt."
          emoji="📭"
          compact
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 32 },

  heroCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 13, color: MUTED, fontWeight: '600', letterSpacing: 0.5 },
  heroScore: {
    fontSize: 56,
    fontWeight: '800',
    marginVertical: 4,
    lineHeight: 64,
  },
  heroAccuracy: { fontSize: 15, color: TEXT, marginTop: 4 },
  heroAccuracyValue: { fontWeight: '700' },
  heroMessage: { fontSize: 16, fontWeight: '700', marginTop: 12 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    marginBottom: 24,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: TEXT },
  statLabel: { fontSize: 12, color: MUTED, marginTop: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    marginTop: 8,
    marginBottom: 10,
  },

  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 24,
  },

  retryBlock: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 16,
    marginBottom: 24,
  },
  retryLine: { fontSize: 15, color: TEXT, marginTop: 4 },
  retryStrong: { fontWeight: '700' },

  weakSeparator: { height: 1, backgroundColor: BORDER, marginVertical: 6 },
  weakTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  weakTopicTextBlock: { flex: 1, marginRight: 8 },
  weakTopicName: { fontSize: 16, fontWeight: '600', color: TEXT },
  weakTopicMistakes: { fontSize: 13, color: MUTED, marginTop: 2 },

  practiceBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  practiceBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  err: { color: '#c00', marginTop: 4, marginBottom: 8 },

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  qIndex: { fontSize: 13, color: MUTED, marginBottom: 4, fontWeight: '600' },
  qText: { fontSize: 16, color: TEXT, marginBottom: 10, lineHeight: 22 },
  optionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  optionDefault: { backgroundColor: CARD_BG },
  optionCorrect: { backgroundColor: colors.successSoft, borderColor: colors.success },
  optionWrong: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  optionText: { fontSize: 15, color: TEXT },
  metaLine: { fontSize: 14, marginTop: 6, color: TEXT },
  explanation: {
    fontSize: 14,
    marginTop: 10,
    color: TEXT,
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 8,
    fontStyle: 'italic',
  },

  footer: { marginTop: 24 },
  allCorrectCard: {
    backgroundColor: colors.successSoft,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.success,
    marginBottom: 16,
  },
  successText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    textAlign: 'center',
  },

  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryBtnText: { color: TEXT, fontSize: 15, fontWeight: '600' },

  btnPressed: { opacity: 0.8 },
  btnDisabled: { opacity: 0.6 },
});
