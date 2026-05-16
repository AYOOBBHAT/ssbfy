import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { getQuestionsByTopic, getWeakPractice, getTestAttempts } from '../services/testService';
import { getAttemptResult } from '../services/resultService';
import { getTopics } from '../services/topicService';
import { getNotes, previewOf } from '../services/noteService';
import {
  formatFileSize,
  getPdfNotes,
  getPdfOpenUserMessage,
  openPdfInAppBrowser,
} from '../services/pdfService';
import { getApiErrorCode, getApiErrorMessage, isRequestCancelled } from '../services/api';
import logger from '../utils/logger';
import { EmptyState } from '../components/StateView';
import { colors } from '../theme/colors';

/*
 * Manual QA — historical attempt integrity (mobile):
 * - Profile: tap Attempt #1 vs #4 of same test → distinct scores/answers (check resultScreenKey).
 * - Retry wrong from historical view → only that attempt's wrong set; no live test fetch.
 * - Admin changed answers after submit → review colors unchanged when immutableAttemptSnapshot true.
 * - Deleted question → banner skip count; retry skips unavailable rows.
 * - Rapid attempt switching → loading gate + abort; no flash of prior attempt.
 */

// Cap for both recommendation lists — keeps the Result screen readable
// when the user has many weak topics / a large PDF catalog.
const MAX_RECOMMENDATIONS = 5;

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

/**
 * Coerce any answer/correct shape we might receive (legacy scalar, new
 * array, undefined) into a deduped, sorted Number[]. Centralizing this
 * means the rest of the screen never has to branch on the wire shape.
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

/**
 * Decide how to color a single option in the review card.
 *   - In `correctSet` → green (the right answer, regardless of selection)
 *   - User picked but NOT in `correctSet` → red (a wrong selection)
 *   - Otherwise → neutral
 *
 * For multi-correct this paints every correct option green and every
 * wrongly-selected option red — which is exactly what the user needs to
 * see to learn from the mistake.
 */
function getOptionStyle(optionIndex, correctSet, userSet) {
  const correctSetSafe = Array.isArray(correctSet) ? correctSet : [];
  const userSetSafe = Array.isArray(userSet) ? userSet : [];
  if (correctSetSafe.includes(optionIndex)) {
    return styles.optionCorrect;
  }
  if (userSetSafe.includes(optionIndex)) {
    return styles.optionWrong;
  }
  return styles.optionDefault;
}

function formatIndexList(indexes, options) {
  const arr = Array.isArray(indexes) ? indexes : [];
  if (arr.length === 0) return '—';
  return arr
    .map((i) => {
      if (!Number.isInteger(i) || i < 0 || i >= options.length) return '—';
      return `${String.fromCharCode(65 + i)}. ${options[i] ?? ''}`;
    })
    .join('  •  ');
}

/** Retry requires non-empty options (deleted/placeholder questions are skipped). */
function isQuestionRetryable(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  return opts.length > 0;
}

function partitionRetryableQuestions(questions) {
  const retryable = [];
  let skipped = 0;
  for (const q of questions) {
    if (isQuestionRetryable(q)) retryable.push(q);
    else skipped += 1;
  }
  return { retryable, skipped };
}

/**
 * Maps GET /results/attempt/:id into ResultScreen params.
 * Historical mode: wrong sets + correctness come from the server snapshot only.
 */
function mapAttemptResultToNavExtras(api) {
  if (!api || typeof api !== 'object') return null;
  return {
    testId: api.testId,
    score: api.score,
    accuracy: api.accuracy,
    timeTaken: api.timeTaken,
    weakTopics: Array.isArray(api.weakTopics) ? api.weakTopics : [],
    totalQuestions: api.totalQuestions,
    attemptedQuestions: api.attemptedQuestions,
    unansweredQuestions: api.unansweredQuestions,
    skippedQuestions: api.skippedQuestions,
    markedForReviewCount: api.markedForReviewCount,
    questions: Array.isArray(api.questions) ? api.questions : [],
    userAnswers: api.userAnswers && typeof api.userAnswers === 'object' ? api.userAnswers : {},
    correctAnswers: Array.isArray(api.correctAnswers) ? api.correctAnswers : [],
    wrongQuestionIds: Array.isArray(api.wrongQuestionIds) ? api.wrongQuestionIds : [],
    wrongQuestions: Array.isArray(api.wrongQuestions) ? api.wrongQuestions : [],
    immutableAttemptSnapshot: api.immutableAttemptSnapshot === true,
    retrySkippedUnavailableCount: Number(api.retrySkippedUnavailableCount) || 0,
    testAvailable: api.testAvailable !== false,
    testTitle: api.testTitle ?? null,
    viewingHistoricalAttempt: true,
    historicalAttemptMode: true,
    historicalAttemptId: api.attemptId != null ? String(api.attemptId) : null,
    attemptNumber: api.attemptNumber ?? null,
  };
}

export default function ResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const routeAttemptId = useMemo(() => {
    const p = route.params;
    if (!p || typeof p !== 'object' || p.attemptId == null) return null;
    const s = String(p.attemptId).trim();
    return s || null;
  }, [route.params]);

  const loadGenRef = useRef(0);
  const [historicalExtras, setHistoricalExtras] = useState(null);
  const [histLoading, setHistLoading] = useState(() => !!routeAttemptId);
  const [histError, setHistError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!routeAttemptId) {
      setHistLoading(false);
      setHistoricalExtras(null);
      setHistError(null);
      return undefined;
    }
    const gen = ++loadGenRef.current;
    const ac = new AbortController();
    setHistLoading(true);
    setHistError(null);
    setHistoricalExtras(null);
    (async () => {
      try {
        const raw = await getAttemptResult(routeAttemptId, { signal: ac.signal });
        if (gen !== loadGenRef.current) return;
        const mapped = mapAttemptResultToNavExtras(raw);
        if (!mapped?.testId) {
          setHistError(new Error('Invalid result payload'));
          setHistoricalExtras(null);
          return;
        }
        setHistoricalExtras(mapped);
        setHistError(null);
      } catch (e) {
        if (isRequestCancelled(e)) return;
        if (gen !== loadGenRef.current) return;
        setHistoricalExtras(null);
        setHistError(e);
      } finally {
        if (gen === loadGenRef.current) setHistLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [routeAttemptId, retryTick]);

  const params = useMemo(() => {
    const base = route.params && typeof route.params === 'object' ? route.params : {};
    if (!routeAttemptId || !historicalExtras) return base;
    const { attemptId: _omit, ...rest } = base;
    return { ...rest, ...historicalExtras };
  }, [route.params, routeAttemptId, historicalExtras]);

  const hasParams = !!params && typeof params === 'object';
  const {
    testId,
    score,
    accuracy,
    timeTaken,
    weakTopics = [],
    totalQuestions = 0,
    attemptedQuestions = 0,
    unansweredQuestions: unansweredQuestionsParam,
    skippedQuestions: skippedQuestionsParam,
    markedForReviewCount: markedForReviewParam,
    questions = [],
    userAnswers = {},
    correctAnswers = [],
    retry = false,
    retryAnswers = {},
    retryQuestions = [],
    recoveredSubmit = false,
    viewingHistoricalAttempt = false,
    historicalAttemptMode = false,
    immutableAttemptSnapshot = false,
    historicalAttemptId = null,
    wrongQuestions: serverWrongQuestions = null,
    wrongQuestionIds: serverWrongQuestionIds = null,
    retrySkippedUnavailableCount = 0,
    testAvailable = true,
    testTitle: _testTitle = null,
  } = params || {};
  const isHistoricalAttempt = viewingHistoricalAttempt || historicalAttemptMode;
  const isRetry = !!retry;
  const isMock = !!testId && !isRetry;

  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState(null);
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    const ac = new AbortController();
    const loadAttempts = async () => {
      if (!isMock || viewingHistoricalAttempt) {
        setAttemptsLoading(false);
        return;
      }
      setAttemptsLoading(true);
      setAttemptsError(null);
      try {
        const data = await getTestAttempts(testId, { signal: ac.signal });
        const list = Array.isArray(data?.attempts) ? data.attempts : [];
        if (ac.signal.aborted) return;
        setAttempts(list);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setAttemptsError(getApiErrorMessage(e));
        setAttempts([]);
      } finally {
        if (!ac.signal.aborted) {
          setAttemptsLoading(false);
        }
      }
    };
    void loadAttempts();
    return () => {
      ac.abort();
    };
  }, [isMock, testId, viewingHistoricalAttempt]);

  const bestAttempt = useMemo(() => {
    if (!Array.isArray(attempts) || attempts.length === 0) return null;
    let best = attempts[0];
    for (const a of attempts) {
      const accA = Number(a?.accuracy) || 0;
      const accB = Number(best?.accuracy) || 0;
      if (accA > accB) best = a;
    }
    return best;
  }, [attempts]);

  const formatAttemptDate = (d) => {
    const t = d ? new Date(d).getTime() : NaN;
    if (Number.isNaN(t)) return '—';
    return new Date(t).toLocaleString();
  };

  const formatAttemptTime = (s) => {
    const n = Math.max(0, Number(s) || 0);
    const mm = Math.floor(n / 60);
    const ss = n % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  /**
   * Map questionId → canonical Number[] of correct option indexes.
   *
   * Backed by `correctAnswers` server payload; we accept BOTH the new
   * `correctAnswers: [n,...]` array and the legacy `correctAnswerIndex: n`
   * scalar so this screen renders correctly whether the answer came from
   * an upgraded backend, an old backend, or the local daily-practice path.
   *
   * Falls back to the question doc itself (`q.correctAnswers` /
   * `q.correctAnswerIndex`) when the payload is missing entries — this is
   * what makes the screen survive a stale response from a legacy server.
   */
  const correctAnswerMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(correctAnswers)) {
      for (const c of correctAnswers) {
        if (c?.questionId == null) continue;
        const arr = toIndexArray(
          Array.isArray(c.correctAnswers) && c.correctAnswers.length > 0
            ? c.correctAnswers
            : c.correctAnswerIndex
        );
        m.set(String(c.questionId), arr);
      }
    }
    return m;
  }, [correctAnswers]);

  function getCorrectSetFor(questionId, questionDoc) {
    const fromMap = correctAnswerMap.get(String(questionId));
    // Historical / immutable snapshot: never fall back to live Question docs.
    if (isHistoricalAttempt || immutableAttemptSnapshot) {
      return Array.isArray(fromMap) ? fromMap : [];
    }
    if (Array.isArray(fromMap) && fromMap.length > 0) return fromMap;
    return toIndexArray(
      Array.isArray(questionDoc?.correctAnswers) && questionDoc.correctAnswers.length > 0
        ? questionDoc.correctAnswers
        : questionDoc?.correctAnswerIndex
    );
  }

  const wrongQuestions = useMemo(() => {
    if (isHistoricalAttempt && Array.isArray(serverWrongQuestions)) {
      return serverWrongQuestions;
    }
    return (Array.isArray(questions) ? questions : []).filter((q) => {
      const qid = String(q?._id ?? '');
      const userArr = toIndexArray(userAnswers ? userAnswers[qid] : undefined);
      const correctArr = getCorrectSetFor(qid, q);
      if (userArr.length === 0) return false;
      if (correctArr.length === 0) return false;
      return !indexSetsEqual(userArr, correctArr);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isHistoricalAttempt,
    serverWrongQuestions,
    questions,
    userAnswers,
    correctAnswerMap,
    immutableAttemptSnapshot,
  ]);

  const wrongQuestionIds = useMemo(() => {
    if (isHistoricalAttempt && Array.isArray(serverWrongQuestionIds)) {
      return serverWrongQuestionIds.map((id) => String(id));
    }
    return wrongQuestions.map((q) => String(q._id));
  }, [isHistoricalAttempt, serverWrongQuestionIds, wrongQuestions]);

  const mockAttemptStats = useMemo(() => {
    if (isRetry) return null;
    const qs = Array.isArray(questions) ? questions : [];
    let correct = 0;
    let incorrect = 0;
    for (const q of qs) {
      const qid = String(q?._id ?? '');
      const userArr = toIndexArray(userAnswers?.[qid]);
      const correctArr = getCorrectSetFor(qid, q);
      if (userArr.length === 0) continue;
      if (correctArr.length > 0 && indexSetsEqual(userArr, correctArr)) correct += 1;
      else incorrect += 1;
    }
    return { correct, incorrect };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetry, questions, userAnswers, correctAnswers]);

  const displayStats = useMemo(() => {
    const qlen = Array.isArray(questions) ? questions.length : 0;
    const totalQ = Math.max(Number(totalQuestions) || 0, qlen);
    const answeredQ = Number(attemptedQuestions) || 0;
    const unansweredQ =
      unansweredQuestionsParam != null && unansweredQuestionsParam !== ''
        ? Number(unansweredQuestionsParam)
        : Math.max(0, totalQ - answeredQ);
    const skippedQ =
      skippedQuestionsParam != null && skippedQuestionsParam !== ''
        ? Number(skippedQuestionsParam)
        : null;
    const markedQ =
      markedForReviewParam != null && markedForReviewParam !== ''
        ? Number(markedForReviewParam)
        : null;
    return { totalQ, answeredQ, unansweredQ, skippedQ, markedQ };
  }, [
    questions,
    totalQuestions,
    attemptedQuestions,
    unansweredQuestionsParam,
    skippedQuestionsParam,
    markedForReviewParam,
  ]);

  const handleReviewAnswers = () => {
    navigation.navigate('ReviewAnswers', {
      questions: Array.isArray(questions) ? questions : [],
      userAnswers: userAnswers && typeof userAnswers === 'object' ? userAnswers : {},
      correctAnswers: Array.isArray(correctAnswers) ? correctAnswers : [],
      retry,
      readOnly: true,
    });
  };

  const retryStats = useMemo(() => {
    if (!isRetry) return null;
    const list = Array.isArray(retryQuestions) ? retryQuestions : [];
    const total = list.length;
    let correct = 0;
    for (const q of list) {
      const qid = String(q?._id ?? '');
      const userArr = toIndexArray(retryAnswers ? retryAnswers[qid] : undefined);
      const correctArr = getCorrectSetFor(qid, q);
      if (userArr.length > 0 && correctArr.length > 0 && indexSetsEqual(userArr, correctArr)) {
        correct += 1;
      }
    }
    const accuracyPct =
      total === 0
        ? 0
        : Math.round(((correct / total) * 100 + Number.EPSILON) * 100) / 100;
    return { correct, total, accuracyPct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetry, retryQuestions, retryAnswers, correctAnswerMap]);

  const retryWrongQuestions = useMemo(() => {
    if (!isRetry) return [];
    return (Array.isArray(retryQuestions) ? retryQuestions : []).filter((q) => {
      const qid = String(q?._id ?? '');
      const userArr = toIndexArray(retryAnswers ? retryAnswers[qid] : undefined);
      const correctArr = getCorrectSetFor(qid, q);
      if (userArr.length === 0) return false;
      if (correctArr.length === 0) return false;
      return !indexSetsEqual(userArr, correctArr);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetry, retryQuestions, retryAnswers, correctAnswerMap]);

  const retryWrongQuestionIds = useMemo(
    () => retryWrongQuestions.map((q) => String(q._id)),
    [retryWrongQuestions]
  );

  const handleRetryWrong = () => {
    if (!wrongQuestionIds.length) return;
    const { retryable, skipped: skippedLocal } = partitionRetryableQuestions(wrongQuestions);
    const skippedTotal =
      (Number(retrySkippedUnavailableCount) || 0) + skippedLocal;
    if (!retryable.length) {
      Alert.alert(
        'Cannot retry',
        skippedTotal > 0
          ? `${skippedTotal} unavailable question${skippedTotal === 1 ? '' : 's'} could not be retried.`
          : 'No retryable questions from this attempt.'
      );
      return;
    }
    if (skippedTotal > 0) {
      Alert.alert(
        'Retry started',
        `${skippedTotal} unavailable question${skippedTotal === 1 ? '' : 's'} ${skippedTotal === 1 ? 'was' : 'were'} skipped.`
      );
    }
    navigation.navigate('Test', {
      mode: 'retry',
      questionIds: retryable.map((q) => String(q._id)),
      questions: retryable,
      historicalAttemptMode: isHistoricalAttempt,
      sourceAttemptId: historicalAttemptId || undefined,
      // Do not pass testId in historical mode — retry must not touch live test APIs.
      ...(!isHistoricalAttempt && testId ? { testId } : {}),
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
  const [weakLoading, setWeakLoading] = useState(false);

  // "Weak Topic Resources" recommender. Both lists are populated from a
  // single `useEffect` (see below) that fans out to the notes and pdfs
  // APIs in parallel after the result is rendered. Everything is capped
  // at MAX_RECOMMENDATIONS before being committed to state.
  const [recommendedNotes, setRecommendedNotes] = useState([]);
  const [recommendedPdfs, setRecommendedPdfs] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);
  const [openingPdfId, setOpeningPdfId] = useState(null);

  // Flatten weakTopics → unique topicId strings for the combined
  // "Practice Weak Topics" CTA. Kept as a memo so the render path and
  // the handler see the exact same list.
  const weakTopicIds = useMemo(() => {
    const ids = (Array.isArray(weakTopics) ? weakTopics : [])
      .map((t) => (t?.topicId == null ? null : String(t.topicId)))
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [weakTopics]);

  // Derive the test's parent post id from the questions payload. Each
  // Question doc carries `postIds: [ObjectId]` (a question can belong to
  // multiple exams), and every question in a given test shares at least
  // one common post — so the first question's first postId is a safe,
  // dependency-free source of truth. Used to scope the recommended PDF
  // list (PDF notes are per-post, not per-topic).
  const recommendedPostId = useMemo(() => {
    const list = Array.isArray(questions) ? questions : [];
    for (const q of list) {
      const pids = Array.isArray(q?.postIds) ? q.postIds : [];
      if (pids.length > 0 && pids[0] != null) {
        return String(pids[0]);
      }
    }
    return null;
  }, [questions]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await getTopics({ signal: ac.signal });
        const list = Array.isArray(data?.topics) ? data.topics : [];
        const map = {};
        list.forEach((t) => {
          if (t?._id != null) {
            map[String(t._id)] = t.name ?? '';
          }
        });
        if (!ac.signal.aborted) setTopicMap(map);
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        logger.info('[TOPICS] failed to load:', getApiErrorMessage(e));
      }
    })();
    return () => {
      ac.abort();
    };
  }, []);

  /**
   * Load recommendations (notes + pdfs) whenever the pieces we need
   * become available. The two fetches run in parallel via `allSettled`:
   * a notes failure must not mask pdfs (and vice versa), because the
   * user benefits from whichever list we manage to produce.
   *
   * Short-circuits when there are no weak topics so we don't waste a
   * round-trip on a perfect score.
   */
  useEffect(() => {
    if (weakTopicIds.length === 0) {
      setRecommendedNotes([]);
      setRecommendedPdfs([]);
      setRecError(null);
      return undefined;
    }

    const ac = new AbortController();
    setRecLoading(true);
    setRecError(null);

    (async () => {
      try {
        const [notesResult, pdfsResult] = await Promise.allSettled([
          getNotes({ topicIds: weakTopicIds }, { signal: ac.signal }),
          // `recommendedPostId` may legitimately be null (e.g. questions
          // lacked postIds in a legacy record). Treat that as "no pdfs"
          // rather than fetching every pdf in the catalog.
          recommendedPostId
            ? getPdfNotes(recommendedPostId, { signal: ac.signal })
            : Promise.resolve({ pdfs: [] }),
        ]);

        if (ac.signal.aborted) return;

        const nextNotes =
          notesResult.status === 'fulfilled'
            ? (Array.isArray(notesResult.value?.notes) ? notesResult.value.notes : [])
            : [];
        const nextPdfs =
          pdfsResult.status === 'fulfilled'
            ? (Array.isArray(pdfsResult.value?.pdfs) ? pdfsResult.value.pdfs : [])
            : [];

        setRecommendedNotes(nextNotes.slice(0, MAX_RECOMMENDATIONS));
        setRecommendedPdfs(nextPdfs.slice(0, MAX_RECOMMENDATIONS));

        // Only surface an error when BOTH requests failed — a partial
        // success is a useful recommender and we'd rather hide a pdf
        // outage than scare the user with a red banner.
        if (
          notesResult.status === 'rejected' &&
          pdfsResult.status === 'rejected'
        ) {
          const r1 = notesResult.reason;
          const r2 = pdfsResult.reason;
          if (!isRequestCancelled(r1) && !isRequestCancelled(r2)) {
            setRecError(getApiErrorMessage(r1));
          }
        }
      } finally {
        setRecLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [weakTopicIds, recommendedPostId]);

  const handleOpenNote = (note) => {
    if (!note) return;
    navigation.navigate('NoteDetail', { note });
  };

  /**
   * Open a PDF in the in-app browser (Chrome Custom Tab / SFSafariView).
   * Mirrors the behaviour of PdfListScreen so the PDF UX is consistent
   * wherever the user encounters PDFs in the app.
   */
  const handleOpenPdf = async (pdf) => {
    const id = pdf?._id;
    if (!id) return;
    setOpeningPdfId(id);
    try {
      await openPdfInAppBrowser(pdf, {
        toolbarColor: colors.primary,
        controlsColor: colors.textOnPrimary,
        showTitle: true,
        enableBarCollapsing: true,
        dismissButtonStyle: 'close',
        presentationStyle:
          WebBrowser.WebBrowserPresentationStyle?.PAGE_SHEET ?? 'pageSheet',
      }, { pdfId: String(id) });
    } catch (e) {
      Alert.alert('Could not open PDF', getPdfOpenUserMessage(e));
    } finally {
      setOpeningPdfId(null);
    }
  };

  /**
   * Combined weak-practice flow: pulls a random 10-question batch drawn
   * from *all* weak topics at once via the new `/questions/weak-practice`
   * endpoint, then hands off to `TestScreen` in practice mode (no
   * timer, no backend submit, local answers only).
   *
   * We reuse the same `practiceError` slot as the per-topic Practice
   * buttons because both failure modes are user-visible errors that
   * belong under the Weak Topics section.
   */
  const handleWeakPractice = async () => {
    if (weakLoading || practiceTopicId != null) return;
    if (weakTopicIds.length === 0) return;
    setPracticeError(null);
    setWeakLoading(true);
    try {
      const data = await getWeakPractice(weakTopicIds, { limit: 10 });
      const fetched = Array.isArray(data?.questions) ? data.questions : [];
      if (fetched.length === 0) {
        setPracticeError('No questions available for practice.');
        return;
      }
      const questionIds = fetched
        .map((q) => (q?._id == null ? '' : String(q._id)))
        .filter(Boolean);
      navigation.navigate('Test', {
        mode: 'practice',
        questions: fetched,
        questionIds,
      });
    } catch (e) {
      setPracticeError(getApiErrorMessage(e));
    } finally {
      setWeakLoading(false);
    }
  };

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

      {recoveredSubmit ? (
        <View style={styles.recoveredBanner}>
          <Text style={styles.recoveredBannerText}>
            Test already submitted — showing your saved results.
          </Text>
        </View>
      ) : null}

      {isHistoricalAttempt && testAvailable === false ? (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableBannerText}>This test is no longer available.</Text>
        </View>
      ) : null}

      {isHistoricalAttempt && retrySkippedUnavailableCount > 0 ? (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableBannerText}>
            {retrySkippedUnavailableCount} unavailable question
            {retrySkippedUnavailableCount === 1 ? '' : 's'} cannot be retried from this attempt.
          </Text>
        </View>
      ) : null}

      {isMock && !viewingHistoricalAttempt ? (
        <View style={styles.attemptsBlock}>
          <View style={styles.attemptsHeaderRow}>
            <Text style={styles.sectionTitle}>Previous Attempts</Text>
            {attemptsLoading ? <Text style={styles.attemptsMeta}>Loading…</Text> : null}
          </View>
          {attemptsError ? (
            <Text style={styles.attemptsError}>{attemptsError}</Text>
          ) : null}
          {!attemptsLoading && attempts.length > 0 ? (
            <View style={styles.attemptsSummaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Total attempts</Text>
                <Text style={styles.summaryValue}>{String(attempts.length)}</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Best score</Text>
                <Text style={styles.summaryValue}>{String(bestAttempt?.accuracy ?? 0)}%</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>Latest score</Text>
                <Text style={styles.summaryValue}>
                  {String(attempts?.[0]?.accuracy ?? 0)}%
                </Text>
              </View>
            </View>
          ) : null}
          {bestAttempt ? (
            <View style={styles.bestAttemptCard}>
              <View style={styles.bestAttemptTop}>
                <Text style={styles.bestAttemptLabel}>Best score</Text>
                <Text style={styles.bestAttemptValue}>
                  {String(bestAttempt?.accuracy ?? 0)}%
                </Text>
              </View>
              <Text style={styles.bestAttemptSub}>
                Attempt {String(bestAttempt?.attemptNumber ?? '—')} • {formatAttemptDate(bestAttempt?.endTime)}
              </Text>
            </View>
          ) : null}
          {!attemptsLoading && attempts.length > 0 ? (
            <View style={styles.attemptList}>
              {attempts
                .slice()
                .sort((a, b) => (Number(a?.attemptNumber) || 0) - (Number(b?.attemptNumber) || 0))
                .map((a) => (
                  <View key={String(a?._id)} style={styles.attemptRow}>
                    <View style={styles.attemptLeft}>
                      <Text style={styles.attemptTitle}>
                        Attempt {String(a?.attemptNumber ?? '—')}
                      </Text>
                      <Text style={styles.attemptSub}>
                        Accuracy {String(a?.accuracy ?? 0)}% • Time {formatAttemptTime(a?.timeTaken)}
                      </Text>
                      <Text style={styles.attemptDate}>{formatAttemptDate(a?.endTime)}</Text>
                    </View>
                    <Text style={styles.attemptPct}>{String(a?.accuracy ?? 0)}%</Text>
                  </View>
                ))}
            </View>
          ) : !attemptsLoading ? (
            <Text style={styles.attemptsEmpty}>No previous attempts yet.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statsBlock}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{String(displayStats.totalQ)}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{String(displayStats.answeredQ)}</Text>
            <Text style={styles.statLabel}>Answered</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{String(timeTaken ?? 0)}s</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
        </View>
        {!isRetry && mockAttemptStats ? (
          <View style={[styles.statsRow, styles.statsRowSecondary]}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{String(displayStats.unansweredQ)}</Text>
              <Text style={styles.statLabel}>Unanswered</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{String(mockAttemptStats.correct)}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{String(mockAttemptStats.incorrect)}</Text>
              <Text style={styles.statLabel}>Incorrect</Text>
            </View>
          </View>
        ) : null}
        {!isRetry && isMock && (displayStats.skippedQ != null || displayStats.markedQ != null) ? (
          <View style={[styles.statsRow, styles.statsRowSecondary]}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {displayStats.skippedQ != null ? String(displayStats.skippedQ) : '—'}
              </Text>
              <Text style={styles.statLabel}>Skipped</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {displayStats.markedQ != null ? String(displayStats.markedQ) : '—'}
              </Text>
              <Text style={styles.statLabel}>Marked review</Text>
            </View>
          </View>
        ) : null}
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
      {weakTopicIds.length > 0 ? (
        <Pressable
          onPress={handleWeakPractice}
          disabled={weakLoading || practiceTopicId != null}
          style={({ pressed }) => [
            styles.weakCta,
            pressed && styles.btnPressed,
            (weakLoading || practiceTopicId != null) && styles.btnDisabled,
          ]}
        >
          <Text style={styles.weakCtaText}>
            {weakLoading ? 'Loading…' : '🔥 Practice Weak Topics'}
          </Text>
        </Pressable>
      ) : null}
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

      {weakTopicIds.length > 0 ? renderRecommendations() : null}

      <Text style={styles.sectionTitle}>Review</Text>
      <Pressable
        onPress={handleReviewAnswers}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
      >
        <Text style={styles.primaryBtnText}>Review Answers</Text>
      </Pressable>
    </View>
  );

  const renderRecommendations = () => {
    const hasNotes = recommendedNotes.length > 0;
    const hasPdfs = recommendedPdfs.length > 0;

    return (
      <View>
        <Text style={styles.sectionTitle}>Weak Topic Resources</Text>
        <View style={styles.sectionCard}>
          {recLoading ? (
            <Text style={styles.recMuted}>Finding resources…</Text>
          ) : recError ? (
            <Text style={styles.err}>{recError}</Text>
          ) : !hasNotes && !hasPdfs ? (
            <Text style={styles.recMuted}>
              No matching study material yet. Check back later.
            </Text>
          ) : (
            <>
              {hasNotes ? (
                <View style={styles.recBlock}>
                  <Text style={styles.recBlockTitle}>📘 Notes</Text>
                  {recommendedNotes.map((note) => {
                    const id = String(note?._id ?? '');
                    const preview = previewOf(note?.content, 80);
                    return (
                      <Pressable
                        key={id || note?.title}
                        onPress={() => handleOpenNote(note)}
                        style={({ pressed }) => [
                          styles.recRow,
                          pressed && styles.btnPressed,
                        ]}
                      >
                        <Text style={styles.recRowTitle} numberOfLines={2}>
                          {note?.title || 'Untitled note'}
                        </Text>
                        {preview ? (
                          <Text style={styles.recRowMeta} numberOfLines={2}>
                            {preview}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {hasPdfs ? (
                <View
                  style={[
                    styles.recBlock,
                    hasNotes && styles.recBlockSpaced,
                  ]}
                >
                  <Text style={styles.recBlockTitle}>📄 PDFs</Text>
                  {recommendedPdfs.map((pdf) => {
                    const id = String(pdf?._id ?? '');
                    const opening = openingPdfId === id;
                    const size = formatFileSize(pdf?.fileSize);
                    return (
                      <Pressable
                        key={id || pdf?.title}
                        onPress={() => handleOpenPdf(pdf)}
                        disabled={opening}
                        style={({ pressed }) => [
                          styles.recRow,
                          pressed && styles.btnPressed,
                          opening && styles.btnDisabled,
                        ]}
                      >
                        <Text style={styles.recRowTitle} numberOfLines={2}>
                          {pdf?.title || pdf?.fileName || 'Untitled PDF'}
                        </Text>
                        <Text style={styles.recRowMeta} numberOfLines={1}>
                          {opening
                            ? 'Opening…'
                            : size
                            ? `${size} • Tap to open`
                            : 'Tap to open'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    );
  };

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
          onPress={() =>
            viewingHistoricalAttempt
              ? navigation.navigate('Main', { screen: 'Profile' })
              : navigation.navigate('Main', { screen: 'Home' })
          }
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.secondaryBtnText}>
            {viewingHistoricalAttempt ? 'Back to Profile' : 'Back to Home'}
          </Text>
        </Pressable>
      </View>
    );
  };

  if (routeAttemptId) {
    if (histLoading) {
      return (
        <View style={styles.histGate}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.histGateText}>Loading results…</Text>
        </View>
      );
    }
    if (histError || !historicalExtras) {
      const code = getApiErrorCode(histError);
      const msg =
        code === 'ATTEMPT_RESULTS_PENDING'
          ? 'Results are still being prepared.'
          : getApiErrorMessage(histError) || 'Could not load results.';
      return (
        <View style={styles.histGate}>
          <Text style={styles.histGateTitle}>Could not open results</Text>
          <Text style={styles.histGateText}>{msg}</Text>
          <Pressable
            onPress={() => setRetryTick((t) => t + 1)}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, styles.histRetryBtn]}
          >
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
  }

  if (!hasParams) {
    return (
      <EmptyState
        title="No data available"
        subtitle="Result data is missing. Please start a test first."
        emoji="📭"
      />
    );
  }

  const resultScreenKey = `result-${historicalAttemptId || testId || 'session'}-${isRetry ? 'retry' : 'mock'}`;

  return (
    <ScrollView
      key={resultScreenKey}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {renderHeader()}
      {renderFooter()}
    </ScrollView>
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

  recoveredBanner: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  recoveredBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },

  unavailableBanner: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  unavailableBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },

  histGate: {
    flex: 1,
    backgroundColor: BG,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  histGateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  histGateText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  histRetryBtn: {
    marginTop: 8,
    minWidth: 200,
    alignSelf: 'center',
  },

  statsBlock: {
    marginBottom: 24,
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
  },
  statsRowSecondary: {
    marginTop: 0,
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

  attemptsBlock: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 16,
  },
  attemptsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attemptsMeta: { fontSize: 12, color: MUTED, fontWeight: '600' },
  attemptsError: { color: colors.danger, fontSize: 13, marginTop: 6, fontWeight: '600' },
  attemptsEmpty: { color: MUTED, fontSize: 13, marginTop: 6 },
  attemptsSummaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  summaryPill: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: { fontSize: 16, fontWeight: '800', color: TEXT, marginTop: 6 },
  bestAttemptCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  bestAttemptTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bestAttemptLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bestAttemptValue: { fontSize: 18, fontWeight: '800', color: colors.primaryDark },
  bestAttemptSub: { fontSize: 12, color: colors.primaryText, marginTop: 6, lineHeight: 16, opacity: 0.9 },
  attemptList: { gap: 10 },
  attemptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  attemptLeft: { flex: 1, paddingRight: 10 },
  attemptTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  attemptSub: { fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 16 },
  attemptDate: { fontSize: 11, color: MUTED, marginTop: 6, opacity: 0.9 },
  attemptPct: { fontSize: 15, fontWeight: '800', color: TEXT },

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

  // Combined "🔥 Practice Weak Topics" CTA sitting above the per-topic
  // list. Uses the accent (warm orange) palette to distinguish it from
  // the main primary-colored Retry actions in the footer.
  weakCta: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  weakCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ---- Recommendations (notes + pdfs) ----
  recMuted: {
    fontSize: 14,
    color: MUTED,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  recBlock: {},
  recBlockSpaced: { marginTop: 14 },
  recBlockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 8,
  },
  recRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  recRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryText,
  },
  recRowMeta: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
  },

  err: { color: '#c00', marginTop: 4, marginBottom: 8 },

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  qHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  qIndex: { fontSize: 13, color: MUTED, fontWeight: '600' },
  multiBadge: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  multiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
    letterSpacing: 0.3,
  },
  verdictBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  verdictBadgeOk: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  verdictBadgeBad: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  verdictBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  verdictBadgeTextOk: { color: colors.success },
  verdictBadgeTextBad: { color: colors.danger },
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
