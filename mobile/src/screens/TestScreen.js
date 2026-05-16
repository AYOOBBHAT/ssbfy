import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  AppState,
  BackHandler,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  getApiErrorMessage,
  isAttemptAlreadySubmittedError,
  getSubmitConflictRecoveryResult,
  isRequestCancelled,
} from '../services/api';
import { submitTest, saveTestProgress, getQuestionsByIds } from '../services/testService';
import { completeDailyPractice } from '../services/dailyPracticeService';
import logger from '../utils/logger';
import AppButton from '../components/AppButton';
import TestCountdownBar from '../components/TestCountdownBar';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import {
  loadDraft,
  saveDraft,
  clearDraft,
  DRAFT_VERSION,
} from '../utils/testAttemptDraft';
import { setOpenAttempt, clearOpenAttempt } from '../utils/openTestAttempts';
import { captureFlowException } from '../monitoring/sentry';
import {
  resetStackToResult,
  MAIN_TABS,
  buildMainReturnRoute,
} from '../navigation/testFlowNavigation';
import { clearTestSessionTimers } from '../utils/testSessionCleanup';

const DRAFT_DEBOUNCE_MS = 450;
const SERVER_SYNC_INTERVAL_MS = 25000;

/**
 * Coerce whatever shape we got (legacy scalar, new array, undefined) into a
 * deduped, sorted, NUMBER array. Empty array means "unanswered" — kept as a
 * single canonical representation across the screen.
 */
function toIndexArray(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const cleaned = [];
  for (const v of list) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) cleaned.push(n);
  }
  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
}

/**
 * Order-independent set equality on two index arrays. Mirrors the backend's
 * scoring rule exactly so daily-practice (scored locally) agrees with what
 * the server would have computed.
 */
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

/** Read a question's canonical correct-index set, handling legacy docs. */
function getQuestionCorrectSet(q) {
  if (Array.isArray(q?.correctAnswers) && q.correctAnswers.length > 0) {
    return [...q.correctAnswers].map(Number).sort((a, b) => a - b);
  }
  if (typeof q?.correctAnswerIndex === 'number') {
    return [q.correctAnswerIndex];
  }
  return [];
}

function isMultiCorrectQuestion(q) {
  return q?.questionType === 'multiple_correct';
}

function answersFromAttempt(att) {
  const m = {};
  if (!att || !Array.isArray(att.answers)) return m;
  for (const a of att.answers) {
    const raw =
      a.selectedOptionIndexes !== undefined ? a.selectedOptionIndexes : a.selectedOptionIndex;
    const arr = toIndexArray(raw);
    if (arr.length > 0) {
      m[String(a.questionId)] = arr;
    }
  }
  return m;
}

/** Full question-id map including empty arrays (unanswered) for Result stats after 409 recovery. */
function userAnswersRecordFromAttempt(att, questionIdsList) {
  const byQ = new Map(
    (Array.isArray(att?.answers) ? att.answers : []).map((a) => [String(a.questionId), a])
  );
  const m = {};
  for (const qid of questionIdsList) {
    const key = String(qid);
    const a = byQ.get(key);
    const raw =
      a && a.selectedOptionIndexes !== undefined
        ? a.selectedOptionIndexes
        : a?.selectedOptionIndex;
    m[key] = toIndexArray(raw);
  }
  return m;
}

export default function TestScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params || {};
  const { testId, attempt, durationMinutes } = params;
  const isRetry = params.mode === 'retry';
  const isPractice = params.mode === 'practice';
  const isDaily = params.mode === 'daily';
  /** Retry from Profile historical attempt — must use preloaded snapshot only. */
  const historicalAttemptMode = !!params.historicalAttemptMode;
  const sourceAttemptId =
    params.sourceAttemptId != null ? String(params.sourceAttemptId) : null;
  /** Tab to restore on leave/finish (Practice | Home | Profile). */
  const originMainTab = params.originMainTab || null;
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
  // Canonical shape: answers[qid] is ALWAYS a sorted, deduped Number[].
  // Empty array means "unanswered". For single-correct questions the array
  // has length 0 or 1; for multi-correct it can be longer.
  const [answers, setAnswers] = useState(() => {
    const m = {};
    if (!isLocal && Array.isArray(attempt?.answers)) {
      for (const a of attempt.answers) {
        // Resumed in-progress attempts may carry either the new array
        // form or the legacy scalar (older mobile builds). Coerce both
        // through `toIndexArray` so the rest of the screen never has to
        // know about the wire shape.
        const raw =
          a.selectedOptionIndexes !== undefined
            ? a.selectedOptionIndexes
            : a.selectedOptionIndex;
        const arr = toIndexArray(raw);
        if (arr.length > 0) {
          m[String(a.questionId)] = arr;
        }
      }
    }
    return m;
  });
  const [skippedQuestionIds, setSkippedQuestionIds] = useState([]);
  const [markedForReviewIds, setMarkedForReviewIds] = useState([]);
  const [resumeResolved, setResumeResolved] = useState(() => !!isLocal);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const submitLockRef = useRef(false);
  const submissionCompletedRef = useRef(false);
  const navigationCommittedRef = useRef(false);
  const draftSaveTimerRef = useRef(null);
  const serverSyncTimerRef = useRef(null);
  const progressSeqRef = useRef(0);

  useEffect(
    () => () => {
      clearTestSessionTimers({ draftSaveTimerRef, serverSyncTimerRef });
    },
    []
  );

  useEffect(() => {
    const ac = new AbortController();

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

      if (isRetry && historicalAttemptMode) {
        if (!preloadedQuestions?.length) {
          setError('Questions from this attempt are no longer available for retry.');
          setLoading(false);
          return;
        }
        const order = questionIds.map((id) => String(id));
        const byId = new Map(preloadedQuestions.map((q) => [String(q._id), q]));
        const ordered = order
          .map((id) => byId.get(id))
          .filter((q) => q && Array.isArray(q.options) && q.options.length > 0);
        if (!ordered.length) {
          setError('No retryable questions remain from this attempt.');
          setLoading(false);
          return;
        }
        setError(null);
        setQuestions(ordered);
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
        const order = questionIds.map((id) => String(id));
        const payload = await getQuestionsByIds(order, { signal: ac.signal });
        const raw = Array.isArray(payload?.questions) ? payload.questions : [];
        const byId = new Map(raw.map((q) => [String(q._id), q]));
        const ordered = order.map((id) => byId.get(id));
        if (ac.signal.aborted) return;
        setQuestions(ordered);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setError(getApiErrorMessage(e));
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      ac.abort();
    };
  }, [idsKey, isLocal, isRetry, isPractice, isDaily, preloadedQuestions, historicalAttemptMode]);

  useEffect(() => {
    if (isLocal) return;
    if (!loading && (error || questions.length === 0)) {
      setResumeResolved(true);
    }
  }, [isLocal, loading, error, questions.length]);

  useEffect(() => {
    if (isLocal || !testId || !attempt?._id) return;
    void setOpenAttempt(testId, attempt);
  }, [isLocal, testId, attempt]);

  useEffect(() => {
    if (isLocal || !testId || !attempt?._id) return;
    if (loading || error || questions.length === 0) return;

    let cancelled = false;

    (async () => {
      const draft = await loadDraft(testId);
      if (cancelled) return;

      if (
        !draft ||
        draft.submitted ||
        draft.version !== DRAFT_VERSION ||
        String(draft.attemptId) !== String(attempt._id) ||
        draft.questionIdsKey !== idsKey
      ) {
        setResumeResolved(true);
        return;
      }

      Alert.alert(
        'Resume previous attempt?',
        'We saved your progress on this device.',
        [
          {
            text: 'Discard & restart',
            style: 'destructive',
            onPress: () => {
              void clearDraft(testId);
              setAnswers(answersFromAttempt(attempt));
              setIndex(0);
              setSkippedQuestionIds([]);
              setMarkedForReviewIds([]);
              setResumeResolved(true);
            },
          },
          {
            text: 'Resume',
            onPress: () => {
              const merged = { ...answersFromAttempt(attempt) };
              const fromDraft = draft.answers && typeof draft.answers === 'object' ? draft.answers : {};
              for (const [k, v] of Object.entries(fromDraft)) {
                if (Array.isArray(v)) merged[k] = v;
              }
              setAnswers(merged);
              const maxIdx = Math.max(0, questions.length - 1);
              const ci =
                typeof draft.currentIndex === 'number'
                  ? Math.min(Math.max(0, draft.currentIndex), maxIdx)
                  : 0;
              setIndex(ci);
              setSkippedQuestionIds(
                Array.isArray(draft.skippedQuestionIds)
                  ? draft.skippedQuestionIds.map(String)
                  : []
              );
              setMarkedForReviewIds(
                Array.isArray(draft.markedForReviewIds)
                  ? draft.markedForReviewIds.map(String)
                  : []
              );
              setResumeResolved(true);
            },
          },
        ],
        { cancelable: false }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [isLocal, testId, attempt?._id, loading, error, questions.length, idsKey]);

  const flushDraftSoon = useCallback(() => {
    if (isLocal || !testId || !attempt?._id || submissionCompletedRef.current) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(async () => {
      draftSaveTimerRef.current = null;
      try {
        await saveDraft(testId, {
          version: DRAFT_VERSION,
          testId: String(testId),
          attemptId: String(attempt._id),
          questionIdsKey: idsKey,
          answers,
          currentIndex: index,
          skippedQuestionIds,
          markedForReviewIds,
          serverStartTimeIso: attempt?.startTime
            ? new Date(attempt.startTime).toISOString()
            : null,
          durationMinutes: Number(durationMinutes) || 0,
          submitted: false,
        });
      } catch (e) {
        logger.info('[TEST] draft save failed', e?.message);
      }
    }, DRAFT_DEBOUNCE_MS);
  }, [
    isLocal,
    testId,
    attempt,
    idsKey,
    answers,
    index,
    skippedQuestionIds,
    markedForReviewIds,
    durationMinutes,
  ]);

  const syncProgressToServer = useCallback(async () => {
    if (isLocal || !testId || submissionCompletedRef.current || submitLockRef.current) return;
    const seq = ++progressSeqRef.current;
    try {
      const payload = questionIds.map((qid) => {
        const arr = Array.isArray(answers[String(qid)]) ? answers[String(qid)] : [];
        return {
          questionId: String(qid),
          selectedOptionIndexes: arr,
          selectedOptionIndex: arr.length > 0 ? arr[0] : null,
        };
      });
      await saveTestProgress(testId, payload);
    } catch (e) {
      if (seq === progressSeqRef.current) {
        logger.info('[TEST] server progress sync failed:', getApiErrorMessage(e));
      }
    }
  }, [isLocal, testId, questionIds, answers]);

  useEffect(() => {
    if (isLocal || !resumeResolved) return;
    flushDraftSoon();
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [isLocal, resumeResolved, flushDraftSoon]);

  useEffect(() => {
    if (isLocal || !resumeResolved) return;
    if (serverSyncTimerRef.current) clearInterval(serverSyncTimerRef.current);
    serverSyncTimerRef.current = setInterval(() => {
      void syncProgressToServer();
    }, SERVER_SYNC_INTERVAL_MS);
    return () => {
      if (serverSyncTimerRef.current) {
        clearInterval(serverSyncTimerRef.current);
        serverSyncTimerRef.current = null;
      }
    };
  }, [isLocal, resumeResolved, syncProgressToServer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (!isLocal && testId && attempt?._id && !submissionCompletedRef.current) {
          void (async () => {
            try {
              await saveDraft(testId, {
                version: DRAFT_VERSION,
                testId: String(testId),
                attemptId: String(attempt._id),
                questionIdsKey: idsKey,
                answers,
                currentIndex: index,
                skippedQuestionIds,
                markedForReviewIds,
                serverStartTimeIso: attempt?.startTime
                  ? new Date(attempt.startTime).toISOString()
                  : null,
                durationMinutes: Number(durationMinutes) || 0,
                submitted: false,
              });
            } catch (_) {
              /* ignore */
            }
            await syncProgressToServer();
          })();
        }
      }
    });
    return () => sub.remove();
  }, [
    isLocal,
    testId,
    attempt,
    idsKey,
    answers,
    index,
    skippedQuestionIds,
    markedForReviewIds,
    durationMinutes,
    syncProgressToServer,
  ]);

  useEffect(() => {
    if (!isLocal) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (submitting || submissionCompletedRef.current || navigationCommittedRef.current) {
        return true;
      }
      const tab =
        originMainTab ||
        (isPractice ? MAIN_TABS.PRACTICE : isDaily ? MAIN_TABS.HOME : MAIN_TABS.HOME);
      const mainRoute = buildMainReturnRoute(tab);
      Alert.alert(
        'Leave session?',
        'Your answers in this session will not be saved.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.navigate(mainRoute.name, mainRoute.params),
          },
        ]
      );
      return true;
    });
    return () => sub.remove();
  }, [isLocal, isPractice, isDaily, originMainTab, submitting, navigation]);

  useEffect(() => {
    if (isLocal) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (submitting || submissionCompletedRef.current) return true;
      Alert.alert('Leave test?', 'Your progress is saved — you can resume later from Mock tests.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            void flushDraftSoon();
            void syncProgressToServer();
            navigation.navigate('Main', { screen: 'Tests', params: { screen: 'TestsMain' } });
          },
        },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [isLocal, submitting, navigation, flushDraftSoon, syncProgressToServer]);

  const total = questions.length;
  const question = questions[index];
  const currentId = question ? String(question._id) : null;
  const isMulti = isMultiCorrectQuestion(question);

  /**
   * Toggle an option as selected for the current question.
   *   - multi-correct: tap toggles membership (checkbox behavior); the
   *     stored array is sorted+deduped so the preview/submit are stable.
   *   - single-answer types (single_correct / image_based): tap replaces
   *     (radio behavior). Re-tapping the SAME option clears it so the user
   *     can change their mind to "unanswered" without exiting the screen.
   */
  const selectOption = (optionIndex) => {
    if (!currentId) return;
    setSkippedQuestionIds((prev) => prev.filter((id) => id !== currentId));
    setAnswers((prev) => {
      const current = Array.isArray(prev[currentId]) ? prev[currentId] : [];
      let next;
      if (isMulti) {
        const set = new Set(current);
        if (set.has(optionIndex)) set.delete(optionIndex);
        else set.add(optionIndex);
        next = Array.from(set).sort((a, b) => a - b);
      } else {
        next = current.length === 1 && current[0] === optionIndex ? [] : [optionIndex];
      }
      const out = { ...prev };
      if (next.length === 0) {
        delete out[currentId];
      } else {
        out[currentId] = next;
      }
      return out;
    });
  };

  const goNext = () => {
    if (index < total - 1) setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const skipCurrentQuestion = useCallback(() => {
    if (!currentId || submitting) return;
    setSkippedQuestionIds((prev) =>
      prev.includes(currentId) ? prev : [...prev, currentId]
    );
    if (index < total - 1) setIndex((i) => i + 1);
  }, [currentId, index, total, submitting]);

  const toggleMarkForReview = useCallback(() => {
    if (!currentId || submitting) return;
    setMarkedForReviewIds((prev) =>
      prev.includes(currentId) ? prev.filter((id) => id !== currentId) : [...prev, currentId]
    );
  }, [currentId, submitting]);

  const attemptedCount = useMemo(
    () =>
      questionIds.filter((qid) => {
        const v = answers[String(qid)];
        return Array.isArray(v) && v.length > 0;
      }).length,
    [questionIds, answers]
  );

  const executeSubmitRef = useRef(async () => {});

  const navigateToResult = useCallback(
    (data, navOptions = {}) => {
      const payload = data || {};
      const ua =
        navOptions.userAnswers != null ? navOptions.userAnswers : answers;
      const sk =
        navOptions.skippedQuestionIds != null ? navOptions.skippedQuestionIds : skippedQuestionIds;
      const mr =
        navOptions.markedForReviewIds != null ? navOptions.markedForReviewIds : markedForReviewIds;

      const attemptedQs = questionIds.filter((qid) => {
        const v = ua[String(qid)];
        return Array.isArray(v) && v.length > 0;
      }).length;
      const unansweredQs = questionIds.length - attemptedQs;
      const skippedQs = sk.filter((qid) => {
        const v = ua[String(qid)];
        return !(Array.isArray(v) && v.length > 0);
      }).length;

      navigation.reset({
        index: 1,
        routes: [
          { name: 'Main' },
          {
            name: 'Result',
            params: {
              testId,
              score: payload.score ?? 0,
              accuracy: payload.accuracy ?? 0,
              timeTaken: payload.timeTaken ?? 0,
              weakTopics: Array.isArray(payload.weakTopics) ? payload.weakTopics : [],
              totalQuestions: questionIds.length,
              attemptedQuestions: attemptedQs,
              unansweredQuestions: unansweredQs,
              skippedQuestions: skippedQs,
              markedForReviewCount: mr.length,
              questions: questions.filter((q) => q !== undefined),
              userAnswers: ua,
              correctAnswers: Array.isArray(payload.correctAnswers)
                ? payload.correctAnswers
                : [],
              recoveredSubmit: !!navOptions.recoveredSubmit,
            },
          },
        ],
      });
    },
    [
      navigation,
      testId,
      questionIds,
      questions,
      answers,
      skippedQuestionIds,
      markedForReviewIds,
    ]
  );

  const executeSubmit = useCallback(
    async ({ autoSubmit = false } = {}) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setSubmitting(true);
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

        // Build one wire-shape per question. We always send BOTH forms:
        //   - selectedOptionIndexes: new canonical array (length 0 = unanswered)
        //   - selectedOptionIndex:   legacy scalar (= arr[0] or null)
        // so an older/newer backend version can read whichever it knows
        // about. The backend's normalizer prefers the array when both
        // are present.
        const buildAnswerEntry = (qid) => {
          const arr = Array.isArray(answers[String(qid)]) ? answers[String(qid)] : [];
          return {
            questionId: String(qid),
            selectedOptionIndexes: arr,
            selectedOptionIndex: arr.length > 0 ? arr[0] : null,
          };
        };

        let payload;
        // Always allow skipping. Unanswered questions are sent with an empty
        // `selectedOptionIndexes` array (and legacy scalar = null).
        payload = questionIds.map(buildAnswerEntry);

        const data = await submitTest(testId, payload);
        submissionCompletedRef.current = true;
        try {
          await clearDraft(testId);
          await clearOpenAttempt(testId);
        } catch (_) {
          /* ignore storage errors */
        }
        navigateToResult(data);
      } catch (e) {
        if (isAttemptAlreadySubmittedError(e)) {
          const recovery = getSubmitConflictRecoveryResult(e);
          submissionCompletedRef.current = true;
          try {
            await clearDraft(testId);
            await clearOpenAttempt(testId);
          } catch (_) {
            /* ignore storage errors */
          }
          if (recovery && recovery.attempt) {
            const ua = userAnswersRecordFromAttempt(recovery.attempt, questionIds);
            logger.debug('[submit] 409 recovered — opening Result');
            navigateToResult(recovery, {
              userAnswers: ua,
              skippedQuestionIds: [],
              markedForReviewIds: [],
              recoveredSubmit: true,
            });
          } else {
            submissionCompletedRef.current = false;
            setSubmitError(
              'This test was already submitted. Open your results from the test list.'
            );
          }
        } else {
          if (!__DEV__) {
            captureFlowException(
              'test_submit',
              e instanceof Error ? e : new Error(String(e)),
              { testId: String(testId ?? '') }
            );
          }
          setSubmitError(getApiErrorMessage(e));
        }
      } finally {
        setSubmitting(false);
        if (!submissionCompletedRef.current) {
          submitLockRef.current = false;
        }
      }
    },
    [testId, questionIds, questions, answers, navigateToResult]
  );

  useEffect(() => {
    executeSubmitRef.current = executeSubmit;
  }, [executeSubmit]);

  const handleTimerExpired = useCallback(() => {
    if (submitLockRef.current) return;
    void executeSubmitRef.current({ autoSubmit: true });
  }, []);

  const confirmManualSubmit = useCallback(() => {
    void executeSubmit({ autoSubmit: false });
  }, [executeSubmit]);

  const handleSubmitPress = useCallback(() => {
    if (attemptedCount === 0) {
      Alert.alert('Submit Test', 'Submit without answering any questions?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: confirmManualSubmit },
      ]);
      return;
    }
    Alert.alert('Submit Test', 'Are you sure you want to submit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: confirmManualSubmit },
    ]);
  }, [confirmManualSubmit, attemptedCount]);

  const finishPracticeToResult = useCallback(() => {
    if (navigationCommittedRef.current || submissionCompletedRef.current) return;

    const validQuestions = questions.filter((q) => q !== undefined);
    if (!validQuestions.length) {
      setSubmitError('No questions in this practice session.');
      return;
    }

    const correctAnswers = validQuestions.map((q) => {
      const correctSet = getQuestionCorrectSet(q);
      return {
        questionId: String(q._id),
        correctAnswers: correctSet,
        correctAnswerIndex: correctSet.length > 0 ? correctSet[0] : null,
        questionType: q.questionType || 'single_correct',
      };
    });

    let correctCount = 0;
    const weakTopicsMap = new Map();
    for (const q of validQuestions) {
      const qid = String(q._id);
      const userArr = Array.isArray(answers[qid]) ? answers[qid] : [];
      const correctSet = getQuestionCorrectSet(q);
      const isCorrect = correctSet.length > 0 && indexSetsEqual(userArr, correctSet);
      if (isCorrect) {
        correctCount += 1;
      } else if (userArr.length > 0 && q.topicId) {
        const tid = String(q.topicId);
        weakTopicsMap.set(tid, (weakTopicsMap.get(tid) || 0) + 1);
      }
    }

    const total = validQuestions.length;
    const attemptedQuestions = Object.keys(answers).filter(
      (k) => Array.isArray(answers[k]) && answers[k].length > 0
    ).length;
    const accuracy =
      total === 0
        ? 0
        : Math.round(((correctCount / total) * 100 + Number.EPSILON) * 100) / 100;
    const weakTopics = Array.from(weakTopicsMap.entries())
      .map(([topicId, mistakeCount]) => ({ topicId, mistakeCount }))
      .sort((a, b) => b.mistakeCount - a.mistakeCount)
      .slice(0, 10);

    const tab = originMainTab || (isPractice ? MAIN_TABS.PRACTICE : MAIN_TABS.HOME);
    const committed = resetStackToResult(navigation, {
      originMainTab: tab,
      resultParams: {
        score: correctCount,
        accuracy,
        timeTaken: 0,
        weakTopics,
        totalQuestions: total,
        attemptedQuestions,
        unansweredQuestions: Math.max(0, total - attemptedQuestions),
        questions: validQuestions,
        userAnswers: answers,
        correctAnswers,
      },
      commitRef: navigationCommittedRef,
    });
    if (committed) submissionCompletedRef.current = true;
  }, [navigation, answers, questions, originMainTab, isPractice]);

  /**
   * Local finish (practice / daily / retry).
   * Uses navigation.reset [Main(origin tab), Result] — not replace — so Android/iOS back
   * cannot resurrect a completed TestScreen (no timer/autosave leakage).
   *
   * Manual QA:
   * - Android back after finish → origin tab, not Test.
   * - iOS swipe on Test blocked for practice/daily/retry (AppNavigator).
   * - Rapid Finish taps → single Result (navigationCommittedRef).
   * - Finish → background → foreground → no duplicate Result.
   * - Retry chain: Result → Test → Finish Retry → one Result on stack.
   */
  const handleFinishLocal = useCallback(async () => {
    if (isRetry) {
      if (submitLockRef.current || navigationCommittedRef.current) return;
      submitLockRef.current = true;
      submissionCompletedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const tab =
          originMainTab ||
          (historicalAttemptMode ? MAIN_TABS.PROFILE : MAIN_TABS.HOME);
        resetStackToResult(navigation, {
          originMainTab: tab,
          resultParams: {
            retry: true,
            retryAnswers: answers,
            retryQuestions: questions.filter((q) => q !== undefined),
          },
          commitRef: navigationCommittedRef,
        });
      } catch (e) {
        setSubmitError(getApiErrorMessage(e));
      } finally {
        setSubmitting(false);
        if (!navigationCommittedRef.current) {
          submitLockRef.current = false;
          submissionCompletedRef.current = false;
        }
      }
      return;
    }

    if (isPractice) {
      if (submitLockRef.current || navigationCommittedRef.current) return;
      submitLockRef.current = true;
      submissionCompletedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        finishPracticeToResult();
      } catch (e) {
        setSubmitError(getApiErrorMessage(e));
      } finally {
        setSubmitting(false);
        if (!navigationCommittedRef.current) {
          submitLockRef.current = false;
          submissionCompletedRef.current = false;
        }
      }
      return;
    }

    if (isDaily) {
      if (submitLockRef.current || navigationCommittedRef.current) return;
      submitLockRef.current = true;
      submissionCompletedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        try {
          await completeDailyPractice();
        } catch (e) {
          logger.info('[DAILY] complete failed:', getApiErrorMessage(e));
        }
        finishPracticeToResult();
      } catch (e) {
        setSubmitError(getApiErrorMessage(e));
      } finally {
        setSubmitting(false);
        if (!navigationCommittedRef.current) {
          submitLockRef.current = false;
          submissionCompletedRef.current = false;
        }
      }
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main', { screen: 'Home' });
    }
  }, [
    navigation,
    answers,
    questions,
    isRetry,
    isDaily,
    isPractice,
    originMainTab,
    historicalAttemptMode,
    finishPracticeToResult,
  ]);

  const countdownEnabled =
    !loading &&
    !error &&
    total > 0 &&
    (isLocal || resumeResolved) &&
    !submitting &&
    !navigationCommittedRef.current &&
    !submissionCompletedRef.current;

  const attempted = Object.keys(answers).filter(
    (k) => Array.isArray(answers[k]) && answers[k].length > 0
  ).length;
  const totalQuestionsCount = questionIds.length;
  const skippedVisible = skippedQuestionIds.length;
  const markedVisible = markedForReviewIds.length;
  const attemptSummaryLabel = `Attempted ${attempted} / ${totalQuestionsCount}${
    !isLocal ? ` · Skipped ${skippedVisible} · Marked ${markedVisible}` : ''
  }`;

  const countdownEl =
    initialSeconds > 0 ? (
      <TestCountdownBar
        key={`tc-${String(testId ?? 'na')}-${String(attempt?._id ?? (isLocal ? 'local' : 'na'))}-${initialSeconds}`}
        initialSeconds={initialSeconds}
        enabled={countdownEnabled}
        serverStartTime={!isLocal && attempt?.startTime ? attempt.startTime : undefined}
        isLocal={isLocal}
        onExpire={handleTimerExpired}
      />
    ) : null;

  if (!isLocal && !resumeResolved && questions.length > 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Restoring attempt…</Text>
      </View>
    );
  }

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
        {countdownEl}
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
            title={(isDaily || isPractice || isRetry) && submitting ? 'Finishing…' : localFinishLabel}
            onPress={handleFinishLocal}
            disabled={(isDaily || isPractice || isRetry) && submitting}
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

  const selectedSet = currentId != null && Array.isArray(answers[currentId])
    ? answers[currentId]
    : [];
  const typeHelperText = isMulti
    ? 'Select ALL correct options.'
    : question?.questionType === 'image_based'
    ? 'Image-based question — pick the correct option.'
    : null;

  const screenKey = sourceAttemptId ? `test-retry-${sourceAttemptId}` : `test-${idsKey}`;

  return (
    <View key={screenKey} style={styles.container}>
      {localHeaderLabel ? <Text style={styles.retryHeader}>{localHeaderLabel}</Text> : null}
      {countdownEl}
      <Text style={styles.attemptSummary}>{attemptSummaryLabel}</Text>
      <Text style={styles.header}>
        Question {index + 1} / {total}
      </Text>
      <ScrollView style={styles.scroll}>
        <Text style={styles.question}>
          {question?.questionText || '(question unavailable)'}
        </Text>
        {typeHelperText ? (
          <Text style={styles.typeHelper}>{typeHelperText}</Text>
        ) : null}
        {Array.isArray(question?.options) &&
          question.options.map((opt, i) => {
            const isSelected = selectedSet.includes(i);
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
                    isMulti && styles.optionIndicatorSquare,
                    isSelected && styles.optionIndicatorSelected,
                  ]}
                >
                  {isSelected ? (
                    isMulti ? (
                      <Text style={styles.optionIndicatorCheck}>✓</Text>
                    ) : (
                      <View style={styles.optionIndicatorDot} />
                    )
                  ) : null}
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
      {!isLocal && currentId ? (
        <View style={styles.secondaryActions}>
          <AppButton
            title={markedForReviewIds.includes(currentId) ? '★ Review' : '☆ Mark review'}
            variant="secondary"
            onPress={toggleMarkForReview}
            disabled={submitting}
            style={styles.secondaryBtn}
          />
          <AppButton
            title="Skip"
            variant="secondary"
            onPress={skipCurrentQuestion}
            disabled={submitting}
            style={styles.secondaryBtn}
          />
        </View>
      ) : null}
      {isLocal ? (
        <AppButton
          title={(isDaily || isPractice || isRetry) && submitting ? 'Finishing…' : localFinishLabel}
          onPress={handleFinishLocal}
          disabled={(isDaily || isPractice || isRetry) && submitting}
        />
      ) : (
        <AppButton
          title={submitting ? 'Submitting...' : 'Submit Test'}
          onPress={handleSubmitPress}
          disabled={submitting || submissionCompletedRef.current}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  attemptSummary: { fontSize: 14, marginBottom: 8, color: colors.muted },
  retryHeader: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: colors.primary },
  header: { fontSize: 16, marginBottom: 12, fontWeight: '600', color: colors.text },
  scroll: { flex: 1 },
  question: { ...typography.questionText, marginBottom: 12 },
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
  optionIndicatorSquare: {
    borderRadius: 4,
  },
  optionIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  optionIndicatorCheck: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 16,
  },
  typeHelper: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    marginBottom: 10,
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
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  secondaryBtn: { flex: 1 },
  muted: { color: colors.muted, marginTop: 8 },
  err: { color: colors.danger, textAlign: 'center' },
});
