import { useMemo, useCallback, memo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  useBottomSafeInsets,
  useBottomSafeInsetsDevLog,
} from '../hooks/useBottomSafeInsets';
import { EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { typography } from '../theme/typography';
import {
  useDevItemMountCounter,
  useDevMountTrace,
  useDevRenderTrace,
} from '../utils/renderPerfDevLog';
import logger from '../utils/logger';
function reviewFlowDevLog(event, detail = {}) {
  if (!__DEV__) return;
  logger.debug(`[ReviewFlow] ${event}`, detail);
}


const TEXT = colors.text;
const MUTED = colors.muted;
const BORDER = colors.border;
const BG = colors.bg;
const CARD_BG = colors.card;

/**
 * Coerce any answer/correct shape we might receive (legacy scalar, new
 * array, undefined) into a deduped, sorted Number[].
 */
function toIndexArray(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const v of list) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** Order-independent set equality on two index arrays. */
function indexSetsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

function getOptionStyle(optionIndex, correctSet, userSet) {
  const correctSetSafe = Array.isArray(correctSet) ? correctSet : [];
  const userSetSafe = Array.isArray(userSet) ? userSet : [];
  if (correctSetSafe.includes(optionIndex)) return styles.optionCorrect;
  if (userSetSafe.includes(optionIndex)) return styles.optionWrong;
  return styles.optionDefault;
}

const ANSWER_UNAVAILABLE = 'Answer unavailable';

function formatIndexList(indexes, options) {
  const arr = Array.isArray(indexes) ? indexes : [];
  const opts = Array.isArray(options) ? options : [];
  if (arr.length === 0) {
    return opts.length === 0 ? ANSWER_UNAVAILABLE : '—';
  }
  const parts = arr.map((i) => {
    if (!Number.isInteger(i) || i < 0 || i >= opts.length) {
      return opts.length === 0 ? ANSWER_UNAVAILABLE : '—';
    }
    return `${String.fromCharCode(65 + i)}. ${opts[i] ?? ''}`;
  });
  if (parts.every((p) => p === ANSWER_UNAVAILABLE || p === '—')) {
    return parts[0] === ANSWER_UNAVAILABLE ? ANSWER_UNAVAILABLE : '—';
  }
  return parts.join('  •  ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16 },

  readOnlyBanner: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  readOnlyText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
    textAlign: 'center',
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  qHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  qIndex: { fontSize: 13, fontWeight: '800', color: MUTED },
  qText: { ...typography.questionText, fontSize: 16, lineHeight: 24, marginBottom: 10 },

  multiBadge: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  multiBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primary },

  verdictBadge: {
    marginLeft: 'auto',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  verdictBadgeOk: { backgroundColor: colors.successSoft, borderColor: colors.success },
  verdictBadgeBad: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  verdictBadgeText: { fontSize: 11, fontWeight: '900' },
  verdictBadgeTextOk: { color: colors.success },
  verdictBadgeTextBad: { color: colors.danger },

  optionRow: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, marginBottom: 8 },
  optionText: { color: TEXT, fontSize: 13, lineHeight: 18 },
  optionDefault: { backgroundColor: BG, borderColor: BORDER },
  optionCorrect: { backgroundColor: colors.successSoft, borderColor: colors.success },
  optionWrong: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },

  metaLine: { marginTop: 4, color: MUTED, fontSize: 12, fontWeight: '600' },
  explanation: { marginTop: 10, color: TEXT, fontSize: 13, lineHeight: 18 },
});

const ReviewAnswerRow = memo(function ReviewAnswerRow({
  question,
  questionId,
  userSet,
  correctSet,
  index,
}) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const explanation =
    typeof question?.explanation === 'string' && question.explanation.trim()
      ? question.explanation
      : null;
  const unanswered = !Array.isArray(userSet) || userSet.length === 0;
  const isMulti =
    question?.questionType === 'multiple_correct' ||
    (Array.isArray(correctSet) && correctSet.length > 1);
  const isOverallCorrect =
    Array.isArray(correctSet) &&
    correctSet.length > 0 &&
    indexSetsEqual(userSet, correctSet);

  useDevRenderTrace(
    'ReviewAnswerRow',
    () => ({
      questionId,
      index,
      options: options.length,
      answered: !unanswered,
    }),
    { logEvery: 20, slowRenderMs: 12, logFirstRender: false }
  );
  useDevItemMountCounter('ReviewAnswerRow', questionId, { logEvery: 20 });

  return (
    <View style={styles.card}>
      <View style={styles.qHeaderRow}>
        <Text style={styles.qIndex}>Q{index + 1}</Text>
        {isMulti ? (
          <View style={styles.multiBadge}>
            <Text style={styles.multiBadgeText}>Multiple Correct</Text>
          </View>
        ) : null}
        {!unanswered ? (
          <View
            style={[
              styles.verdictBadge,
              isOverallCorrect ? styles.verdictBadgeOk : styles.verdictBadgeBad,
            ]}
          >
            <Text
              style={[
                styles.verdictBadgeText,
                isOverallCorrect ? styles.verdictBadgeTextOk : styles.verdictBadgeTextBad,
              ]}
            >
              {isOverallCorrect ? 'Correct' : 'Wrong'}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.qText}>{question?.questionText ?? '(missing question)'}</Text>
      {options.map((opt, i) => (
        <View key={i} style={[styles.optionRow, getOptionStyle(i, correctSet, userSet)]}>
          <Text style={styles.optionText}>
            {`${String.fromCharCode(65 + i)}. ${opt ?? ''}`}
          </Text>
        </View>
      ))}
      <Text style={styles.metaLine}>
        Your answer{userSet?.length > 1 ? 's' : ''}:{' '}
        {unanswered ? 'Not answered' : formatIndexList(userSet, options)}
      </Text>
      <Text style={styles.metaLine}>
        Correct answer{correctSet?.length > 1 ? 's' : ''}:{' '}
        {formatIndexList(correctSet, options)}
      </Text>
      {explanation ? (
        <Text style={styles.explanation}>Explanation: {explanation}</Text>
      ) : null}
    </View>
  );
});

export default function ReviewAnswersScreen() {
  const route = useRoute();
  const bottomInsets = useBottomSafeInsets({ extraScrollPadding: 16 });
  useBottomSafeInsetsDevLog('ReviewAnswers', bottomInsets);
  const params = route.params || {};
  /** Completed-test review from Result is read-only; default true so navigation bugs can't mutate answers. */
  const readOnly = params.readOnly !== false;
  const questions = Array.isArray(params.questions) ? params.questions : [];
  const userAnswers = params.userAnswers && typeof params.userAnswers === 'object' ? params.userAnswers : {};
  const correctAnswers = Array.isArray(params.correctAnswers) ? params.correctAnswers : [];

  useDevRenderTrace(
    'ReviewAnswersScreen',
    () => ({
      questions: questions.length,
      correctAnswers: correctAnswers.length,
      readOnly,
    }),
    { logEvery: 6, slowRenderMs: 18 }
  );
  useDevMountTrace(
    'ReviewAnswersScreen',
    () => ({
      questions: questions.length,
      readOnly,
    }),
    { slowMountMs: 45 }
  );
  useEffect(() => {
    const paintHandle = requestAnimationFrame(() => {
      reviewFlowDevLog('first_useful_paint', {
        questions: questions.length,
        readOnly,
      });
    });
    reviewFlowDevLog('mount', {
      questions: questions.length,
      readOnly,
    });
    return () => {
      if (paintHandle != null) cancelAnimationFrame(paintHandle);
    };
  }, [questions.length, readOnly]);

  const correctAnswerMap = useMemo(() => {
    const m = new Map();
    for (const c of correctAnswers) {
      if (c?.questionId == null) continue;
      const arr = toIndexArray(
        Array.isArray(c.correctAnswers) && c.correctAnswers.length > 0 ? c.correctAnswers : c.correctAnswerIndex
      );
      m.set(String(c.questionId), arr);
    }
    return m;
  }, [correctAnswers]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const question = item;
      const qid = String(question?._id ?? index);
      const userSet = toIndexArray(userAnswers[qid]);
      const fromMap = correctAnswerMap.get(qid);
      const correctSet = Array.isArray(fromMap) && fromMap.length > 0 ? fromMap : [];
      return (
        <ReviewAnswerRow
          question={question}
          questionId={qid}
          userSet={userSet}
          correctSet={correctSet}
          index={index}
        />
      );
    },
    [correctAnswerMap, userAnswers]
  );

  const keyExtractor = useCallback(
    (item, idx) => String(item?._id ?? item?.id ?? idx),
    []
  );

  if (questions.length === 0) {
    return (
      <EmptyState {...EMPTY.REVIEW_NONE} />
    );
  }

  const listHeader = readOnly ? (
    <View style={styles.readOnlyBanner}>
      <Text style={styles.readOnlyText}>Review only — answers cannot be changed.</Text>
    </View>
  ) : null;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, bottomInsets.scrollContentStyle]}
      data={questions}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      initialNumToRender={4}
      maxToRenderPerBatch={6}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
}
