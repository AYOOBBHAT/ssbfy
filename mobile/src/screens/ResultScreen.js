import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  BackHandler,
  Animated,
  AppState,
  InteractionManager,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  resolveResultBackTarget,
  resolveRetryOriginMainTab,
  MAIN_TABS,
} from '../navigation/testFlowNavigation';
import * as WebBrowser from 'expo-web-browser';
import { getQuestionsByTopic, getWeakPractice, getTestAttempts } from '../services/testService';
import { issuePracticeSession } from '../services/practiceService';
import { getAttemptResult } from '../services/resultService';
import { getLearningSession } from '../services/learningSessionService';
import {
  normalizeLearningSessionCachePayload,
  putLearningSessionCache,
  removeLearningSessionCache,
} from '../utils/learningSessionCache';
import { getCachedTopicLabelMap, getTopics } from '../services/topicService';
import { resolvePracticeTopicId } from '../utils/canonicalTopicResolve';
import { getNotes, previewOf } from '../services/noteService';
import {
  formatFileSize,
  getPdfNotes,
  getPdfOpenUserMessage,
  openPdfInAppBrowser,
} from '../services/pdfService';
import { getApiErrorCode, getApiErrorMessage, isRequestCancelled } from '../services/api';
import {
  computeRetryListsFromResult,
  isQuestionDocRetryable as isQuestionRetryable,
} from '../utils/retryWorthy';
import {
  buildRetryAgainCopy,
  buildRetryCtaCopy,
  getEncouragingTierMessage,
} from '../utils/retryMessaging';
import logger from '../utils/logger';
import { EmptyState, ErrorState, InlineLoading, LoadingState } from '../components/StateView';
import { pressFeedbackStyle } from '../utils/pressFeedback';
import { useNavigationActionLock } from '../hooks/useNavigationActionLock';
import {
  useBottomSafeInsets,
  useBottomSafeInsetsDevLog,
} from '../hooks/useBottomSafeInsets';
import { isGlobalOpening } from '../utils/navigationGuard';
import { colors } from '../theme/colors';
import { EMPTY } from '../theme/stateCopy';
import { ERROR_TITLES } from '../utils/userFacingErrors';
import { motion } from '../theme/motion';
import { useAuth } from '../context/AuthContext';
import { questionIdsFromDocs, resolveMongoId } from '../utils/mongoId.js';
import { useDevMountTrace, useDevRenderTrace } from '../utils/renderPerfDevLog';
import {
  logNavigationPayload,
  storeSessionQuestionSnapshot,
} from '../utils/navigationPayloadStore';
import {
  buildRenderableWeakTopics,
  buildTopicLabelMapFromCatalog,
  createTopicLabelContext,
  normalizeWeakTopicsList,
  resolveTopicId,
} from '../utils/topicRef';
import {
  buildRetryStatsFromSummary,
  normalizeResultReviewParams,
} from '../utils/resultReviewPayload';
import {
  createHydrationPayloadError,
  validateAndNormalizeHistoricalPayload,
  ensureRenderSafeReviewParams,
  HYDRATION_PAYLOAD_ERROR,
} from '../utils/resultHydrationPayload';
import PracticeResultHero from '../components/result/PracticeResultHero';
import MockResultHero from '../components/result/MockResultHero';
import RetryResultHero from '../components/result/RetryResultHero';
import WeakTopicFocusRow from '../components/result/WeakTopicFocusRow';
import { resultPalette, resultShadows } from '../components/result/resultTheme';
import {
  getRetryCompletionMessage,
  getRetryEntryCtaSubtitle,
  getRetryEntryCtaTitle,
} from '../utils/retrySessionPresentation';
import {
  buildMockPacingLine,
  formatMockExamHint,
  getMockTierMessage,
  MOCK_WEAK_SECTION,
  PRACTICE_WEAK_SECTION,
} from '../utils/mockResultPresentation';
import {
  assertHydrationInvariants,
  classifyHydrationError,
  createResultHydrationTelemetry,
  HYDRATION_OUTCOME,
  resolveHistoricalHydrationErrorMessage,
} from '../utils/resultHydrationTelemetry';

/*
 * Manual QA — Result screen (mobile):
 * - Historical: Profile attempts → distinct payloads; back → Profile.
 * - Mock result: footer + Android back → Tests tab (returnMainTab: Tests).
 * - Practice result: back → Practice; daily → Home.
 * - Retry chain preserves returnMainTab; finish retry → single Result on stack.
 * - Spam Android back during upstream “Finishing…” handled on TestScreen.
 * - Hierarchy: accuracy hero → stats → next steps (retry/review) → focus areas → history.
 * - All-correct: perfect card + review primary; low score: encouraging tier + focus areas.
 * - Retry tone: "Practice missed" / focused retry — not punitive "wrong" / "failed" language.
 */

// Cap for both recommendation lists — keeps the Result screen readable
// when the user has many weak topics / a large PDF catalog.
const MAX_RECOMMENDATIONS = 5;
const WEAK_FOCUS_PREVIEW = 4;
const RESULT_DEFER_DEEP_DELAY_MS = 140;

const PRIMARY = resultPalette.navy900;
const PRIMARY_ALT = resultPalette.navy800;
const TEXT = resultPalette.text;
const MUTED = resultPalette.textMid;
const BORDER = resultPalette.border;
const BG = resultPalette.background;
const CARD_BG = resultPalette.surface;
const CARD_BG_ALT = resultPalette.surfaceAlt;

function resultDeferDevLog(event, detail = {}) {
  if (!__DEV__) return;
  logger.debug(`[ResultDefer] ${event}`, detail);
}

const TIER_HIGH = {
  color: colors.success,
  bg: '#ECFDF5',
  message: 'Strong work — keep this momentum',
};
const TIER_MID = {
  color: resultPalette.amber,
  bg: '#FFF7ED',
  message: 'Solid effort — small improvements add up',
};
const TIER_LOW = {
  color: PRIMARY_ALT,
  bg: '#EEF2FF',
  message: 'Every session builds skill — focus below',
};

function getSessionContext({ isRetry, isMock, returnMainTab, testTitle }) {
  if (isRetry) {
    return {
      label: 'Second attempt complete',
      hint: testTitle ? `${formatMockExamHint(testTitle)} · recovery` : 'Focused recovery session',
    };
  }
  if (isMock) return { label: 'Mock test complete', hint: testTitle || 'Timed exam' };
  if (returnMainTab === MAIN_TABS.PRACTICE) {
    return { label: 'Practice complete', hint: 'Untimed session' };
  }
  return { label: 'Daily practice complete', hint: 'Quick skills drill' };
}

function formatDuration(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  if (n < 60) return `${n}s`;
  const mm = Math.floor(n / 60);
  const ss = n % 60;
  return `${mm}m ${String(ss).padStart(2, '0')}s`;
}

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
/**
 * Maps GET /learning-sessions/:id into ResultScreen params (immutable snapshot only).
 */
function mapLearningSessionToNavExtras(api) {
  if (!api || typeof api !== 'object') return null;
  const sessionId = resolveMongoId(api.learningSessionId, 'learningSessionId');
  const sessionType =
    typeof api.sessionType === 'string' && api.sessionType.trim()
      ? api.sessionType.trim()
      : null;
  return {
    score: api.score,
    accuracy: api.accuracy,
    timeTaken: api.timeTaken ?? 0,
    weakTopics: Array.isArray(api.weakTopics) ? api.weakTopics : [],
    totalQuestions: api.totalQuestions,
    attemptedQuestions: api.attemptedQuestions,
    unansweredQuestions: api.unansweredQuestions,
    skippedQuestions: api.skippedQuestions ?? 0,
    markedForReviewCount: api.markedForReviewCount ?? 0,
    questions: Array.isArray(api.questions) ? api.questions : [],
    userAnswers: api.userAnswers && typeof api.userAnswers === 'object' ? api.userAnswers : {},
    correctAnswers: Array.isArray(api.correctAnswers) ? api.correctAnswers : [],
    summary: api.summary && typeof api.summary === 'object' ? api.summary : null,
    immutableAttemptSnapshot: api.immutableAttemptSnapshot === true,
    retrySkippedUnavailableCount: Number(api.retrySkippedUnavailableCount) || 0,
    practiceRevealed: api.practiceRevealed !== false,
    retryMeta: api.retryMeta ?? null,
    retry: sessionType === 'retry',
    sessionType,
    viewingHistoricalAttempt: true,
    historicalAttemptMode: true,
    historicalLearningSessionId: sessionId,
    learningSessionId: sessionId,
    returnMainTab: MAIN_TABS.PROFILE,
  };
}

/** P1: Hard cap so AsyncStorage/cache cannot block historical hydration indefinitely. */
const HIST_CACHE_READ_TIMEOUT_MS = 5000;
/** P1: Fail-safe for active historical load ownership (network + cache + parse). */
const HIST_LOAD_TIMEOUT_MS = 25000;

/**
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function getLearningSessionCacheBounded(
  sessionId,
  timeoutMs = HIST_CACHE_READ_TIMEOUT_MS
) {
  let timer;
  try {
    const result = await Promise.race([
      getLearningSessionCache(sessionId),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Cache read timed out')),
          timeoutMs
        );
      }),
    ]);
    return result;
  } catch (e) {
    if (__DEV__) {
      logger.debug('[Result/historical] cache read failed', {
        sessionId,
        message: e?.message,
      });
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * P1: Per-cycle historical hydration ownership — only the active loadId may drive UI.
 * @returns {{ loadId: number, hydrationMode: string, startedAt: number, settled: boolean, uiLoadingReleased: boolean }}
 */
function createHistoricalLoadOwnership(loadId, hydrationMode) {
  return {
    loadId,
    hydrationMode,
    startedAt: Date.now(),
    settled: false,
    uiLoadingReleased: false,
  };
}

function isActiveHistoricalOwnership(ownership, activeLoadIdRef) {
  return (
    !!ownership &&
    !ownership.settled &&
    ownership.loadId === activeLoadIdRef.current
  );
}

function logHistoricalOwnership(event, ownership, activeLoadIdRef, extra = {}) {
  if (!__DEV__) return;
  logger.debug(`[Result/historical] ${event}`, {
    loadId: ownership?.loadId,
    hydrationMode: ownership?.hydrationMode,
    activeLoadId: activeLoadIdRef.current,
    settled: ownership?.settled,
    uiLoadingReleased: ownership?.uiLoadingReleased,
    ...extra,
  });
}

/**
 * P0: Single source of truth for Result server-hydration routing.
 * `learningSessionId` in params always wins over a merged/stale `attemptId`.
 * `inline` only when no valid server ids are present (fresh finish / reset stack).
 */
function resolveHydrationMode(routeParams) {
  const p = routeParams && typeof routeParams === 'object' ? routeParams : {};
  const learningSessionId = resolveMongoId(p.learningSessionId, 'learningSessionId');
  const attemptId = resolveMongoId(p.attemptId, 'attemptId');
  const hasQuestions = Array.isArray(p.questions) && p.questions.length > 0;
  const hasCorrect =
    Array.isArray(p.correctAnswers) && p.correctAnswers.length > 0;
  const hasInline =
    hasQuestions &&
    hasCorrect &&
    (p.immutableAttemptSnapshot === true || p.practiceRevealed === true);

  // Learning-session hydration only when the route is not already a full reveal snapshot
  // (matches legacy `needsLearningSessionFetch = !!learningSessionId && !hasInline`).
  if (learningSessionId && !hasInline) {
    return {
      mode: 'learning-session',
      learningSessionId,
      attemptId: null,
      staleAttemptParamPresent: !!attemptId,
    };
  }
  if (learningSessionId && hasInline) {
    return {
      mode: 'inline',
      learningSessionId: null,
      attemptId: null,
      staleAttemptParamPresent: !!attemptId,
    };
  }
  if (attemptId) {
    return {
      mode: 'attempt',
      learningSessionId: null,
      attemptId,
      staleAttemptParamPresent: false,
    };
  }
  if (hasInline) {
    return {
      mode: 'inline',
      learningSessionId: null,
      attemptId: null,
      staleAttemptParamPresent: !!attemptId,
    };
  }
  return {
    mode: 'none',
    learningSessionId: null,
    attemptId: null,
    staleAttemptParamPresent: false,
  };
}

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
    immutableAttemptSnapshot: api.immutableAttemptSnapshot === true,
    retrySkippedUnavailableCount: Number(api.retrySkippedUnavailableCount) || 0,
    testAvailable: api.testAvailable !== false,
    testRetired: api.testRetired === true,
    testTitle: api.testTitle ?? null,
    viewingHistoricalAttempt: true,
    historicalAttemptMode: true,
    historicalAttemptId: resolveMongoId(api.attemptId, 'attemptId'),
    attemptNumber: api.attemptNumber ?? null,
    returnMainTab: MAIN_TABS.PROFILE,
  };
}

export default function ResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { runOnce, runOnceAsync } = useNavigationActionLock();
  const bottomInsets = useBottomSafeInsets({ extraScrollPadding: 16 });
  useBottomSafeInsetsDevLog('Result', bottomInsets);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const hydration = useMemo(
    () => resolveHydrationMode(route.params),
    [route.params]
  );
  const hydrationMode = hydration.mode;
  const hydrationLearningSessionId = hydration.learningSessionId;
  const hydrationAttemptId = hydration.attemptId;
  const needsServerHydration =
    hydrationMode === 'attempt' || hydrationMode === 'learning-session';

  useDevRenderTrace(
    'ResultScreen',
    () => ({
      hydrationMode,
      needsServerHydration,
      histLoading,
      histError: !!histError,
      routeQuestionCount: Array.isArray(route.params?.questions) ? route.params.questions.length : 0,
      routeCorrectAnswerCount: Array.isArray(route.params?.correctAnswers)
        ? route.params.correctAnswers.length
        : 0,
      routeUserAnswerCount:
        route.params?.userAnswers && typeof route.params.userAnswers === 'object'
          ? Object.keys(route.params.userAnswers).length
          : 0,
    }),
    { logEvery: 4, slowRenderMs: 24 }
  );
  useDevMountTrace(
    'ResultScreen',
    () => ({
      hydrationMode,
      needsServerHydration,
    }),
    { slowMountMs: 55 }
  );

  /** Monotonic load id — active ownership must match this value. */
  const activeLoadIdRef = useRef(0);
  /** P1: Active historical hydration ownership (authoritative for histLoading). */
  const activeOwnershipRef = useRef(null);
  /** Telemetry only — must not gate histLoading. */
  const histPendingRef = useRef(0);
  const [historicalExtras, setHistoricalExtras] = useState(null);
  const [histLoading, setHistLoading] = useState(() => {
    const h = resolveHydrationMode(route.params);
    return h.mode === 'attempt' || h.mode === 'learning-session';
  });
  const [histError, setHistError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const [deferredHydrationState, setDeferredHydrationState] = useState({
    key: null,
    belowFoldReady: false,
    deepReady: false,
  });
  /** P3: Skip cache read for this cycle (retry / stale-cache recovery). */
  const histSkipCacheRef = useRef(false);
  const histRetryGenerationRef = useRef(0);
  const histAbortRef = useRef(null);
  const lastHydrationOutcomeRef = useRef(null);

  const resetHistoricalHydrationForRetry = useCallback(() => {
    histRetryGenerationRef.current += 1;
    histSkipCacheRef.current = true;
    activeLoadIdRef.current += 1;
    const prev = activeOwnershipRef.current;
    if (prev && !prev.settled) {
      prev.settled = true;
    }
    activeOwnershipRef.current = null;
    histPendingRef.current = 0;
    if (histAbortRef.current) {
      histAbortRef.current.abort();
      histAbortRef.current = null;
    }
    if (hydrationLearningSessionId) {
      void removeLearningSessionCache(hydrationLearningSessionId);
    }
    lastHydrationOutcomeRef.current = null;
    setHistoricalExtras(null);
    setHistError(null);
    setHistLoading(true);
    setRetryTick((t) => t + 1);
  }, [hydrationLearningSessionId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' && nextState !== 'inactive') return;
      if (histAbortRef.current) {
        histAbortRef.current.abort();
      }
      const owner = activeOwnershipRef.current;
      if (owner && !owner.settled) {
        activeLoadIdRef.current += 1;
        owner.settled = true;
        activeOwnershipRef.current = null;
        histPendingRef.current = 0;
        setHistLoading(false);
        lastHydrationOutcomeRef.current = HYDRATION_OUTCOME.REQUEST_CANCELLED;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!needsServerHydration) return;
    assertHydrationInvariants('hist-state', {
      loadingHasActiveOwner: !histLoading || Boolean(
        activeOwnershipRef.current && !activeOwnershipRef.current.settled
      ),
      settledOwnerNotLoading: !(
        activeOwnershipRef.current?.settled && histLoading
      ),
      extrasHaveQuestions: !historicalExtras ||
        (Array.isArray(historicalExtras.questions) && historicalExtras.questions.length > 0),
      noReviewWithoutQuestions: histLoading ||
        !historicalExtras ||
        (Array.isArray(historicalExtras.questions) && historicalExtras.questions.length > 0),
    });
  }, [needsServerHydration, histLoading, historicalExtras]);

  useEffect(() => {
    if (!needsServerHydration) {
      const prev = activeOwnershipRef.current;
      if (prev && !prev.settled) {
        prev.settled = true;
        activeLoadIdRef.current += 1;
        logHistoricalOwnership('orphan ownership cleared (no server hydration)', prev, activeLoadIdRef);
      }
      activeOwnershipRef.current = null;
      histPendingRef.current = 0;
      setHistLoading(false);
      setHistoricalExtras(null);
      setHistError(null);
      return undefined;
    }

    const loadId = ++activeLoadIdRef.current;
    const ownership = createHistoricalLoadOwnership(loadId, hydrationMode);
    activeOwnershipRef.current = ownership;
    const ac = new AbortController();
    histAbortRef.current = ac;
    const skipCache = histSkipCacheRef.current;
    histSkipCacheRef.current = false;
    const telemetry = createResultHydrationTelemetry({
      loadId,
      hydrationMode,
      learningSessionId: hydrationLearningSessionId,
      attemptId: hydrationAttemptId,
      retryGeneration: histRetryGenerationRef.current,
    });
    histPendingRef.current += 1;
    setHistLoading(true);
    setHistError(null);
    setHistoricalExtras(null);
    lastHydrationOutcomeRef.current = null;

    let fetchBranch = 'none';
    if (hydrationMode === 'attempt') fetchBranch = 'getAttemptResult';
    else if (hydrationMode === 'learning-session') fetchBranch = 'getLearningSession';

    telemetry.log('load-start', { fetchBranch, skipCache, pending: histPendingRef.current });

    if (__DEV__) {
      const rawAttempt = route.params?.attemptId;
      const rawLs = route.params?.learningSessionId;
      logger.debug('[ResultScreen] hydration', {
        hydrationMode,
        routeAttemptId: rawAttempt,
        routeLearningSessionId: rawLs,
        resolvedAttemptId: hydrationAttemptId,
        resolvedLearningSessionId: hydrationLearningSessionId,
        fetchBranch,
        staleAttemptIgnored:
          hydrationMode === 'learning-session' && hydration.staleAttemptParamPresent,
        inlineTookPrecedenceOverLearningSessionId:
          hydrationMode === 'inline' && !!resolveMongoId(rawLs, 'learningSessionId'),
      });
      if (hydrationMode === 'learning-session' && hydration.staleAttemptParamPresent) {
        logger.debug(
          '[ResultScreen] hydrationMode=learning-session attemptId ignored due to learningSessionId precedence'
        );
      } else if (hydrationMode === 'inline' && resolveMongoId(rawLs, 'learningSessionId')) {
        logger.debug(
          '[ResultScreen] hydrationMode=inline server hydration skipped due to immutable snapshot (learningSessionId retained on route for receipts only)'
        );
      } else if (hydrationMode === 'attempt' && rawAttempt) {
        logger.debug('[ResultScreen] hydrationMode=attempt using getAttemptResult branch');
      } else if (hydrationMode === 'inline' && !rawLs) {
        logger.debug('[ResultScreen] hydrationMode=inline no server hydration');
      }
    }

    let timeoutTimer = null;
    let sessionOutcome = null;
    let telemetryClosed = false;
    const closeTelemetry = (outcome) => {
      if (telemetryClosed) return;
      telemetryClosed = true;
      const finished = telemetry.finish({ sessionOutcome: outcome });
      lastHydrationOutcomeRef.current = finished.outcome || outcome;
    };

    const releaseHistLoadingUi = (reason) => {
      if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) return;
      if (ownership.uiLoadingReleased) return;
      ownership.uiLoadingReleased = true;
      setHistLoading(false);
      logHistoricalOwnership(`histLoading=false (${reason})`, ownership, activeLoadIdRef);
    };

    const settleHistoricalOwnership = (reason, { invalidateStale = false } = {}) => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (ownership.settled) {
        logHistoricalOwnership(`settle ignored (already settled): ${reason}`, ownership, activeLoadIdRef);
        return;
      }
      const wasActive = ownership.loadId === activeLoadIdRef.current;
      ownership.settled = true;
      if (invalidateStale && wasActive) {
        activeLoadIdRef.current += 1;
      }
      if (activeOwnershipRef.current?.loadId === ownership.loadId) {
        activeOwnershipRef.current = null;
      }
      histPendingRef.current = Math.max(0, histPendingRef.current - 1);
      if (wasActive && !ownership.uiLoadingReleased) {
        ownership.uiLoadingReleased = true;
        setHistLoading(false);
        logHistoricalOwnership(`histLoading=false (${reason})`, ownership, activeLoadIdRef);
      }
      logHistoricalOwnership(`load settled: ${reason}`, ownership, activeLoadIdRef, {
        wasActive,
        pending: histPendingRef.current,
        invalidated: invalidateStale && wasActive,
      });
    };

    const applyIfOwner = (label, fn) => {
      if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) {
        logHistoricalOwnership(`stale apply ignored (${label})`, ownership, activeLoadIdRef);
        return false;
      }
      fn();
      return true;
    };

    timeoutTimer = setTimeout(() => {
      if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) return;
      telemetry.recordOutcome(HYDRATION_OUTCOME.NETWORK_TIMEOUT, 'watchdog');
      sessionOutcome = HYDRATION_OUTCOME.NETWORK_TIMEOUT;
      applyIfOwner('timeout-error', () => {
        setHistError(
          (prev) => prev || new Error('Request timed out. Please try again.')
        );
      });
      settleHistoricalOwnership('watchdog-timeout', { invalidateStale: true });
    }, HIST_LOAD_TIMEOUT_MS);

    (async () => {
      let cacheHadPayload = false;
      try {
        if (
          !skipCache &&
          hydrationMode === 'learning-session' &&
          hydrationLearningSessionId
        ) {
          telemetry.markCacheStart();
          let cached = null;
          try {
            cached = normalizeLearningSessionCachePayload(
              await getLearningSessionCacheBounded(hydrationLearningSessionId)
            );
          } catch {
            cached = null;
          }
          telemetry.markCacheEnd({ hit: !!cached });
          if (cached) {
            telemetry.markValidationStart();
            const cachedMapped = mapLearningSessionToNavExtras(cached);
            const cacheValidated = validateAndNormalizeHistoricalPayload(cachedMapped, {
              source: 'cache',
              rawApi: cached,
              requireTestId: false,
            });
            telemetry.markValidationEnd();
            if (cacheValidated.valid && cacheValidated.normalizedPayload?.questions?.length) {
              cacheHadPayload = true;
              sessionOutcome = cacheValidated.recoverable
                ? HYDRATION_OUTCOME.HYDRATION_RECOVERED
                : HYDRATION_OUTCOME.CACHE_HIT;
              telemetry.recordOutcome(sessionOutcome);
              applyIfOwner('cache-hit', () => {
                setHistoricalExtras(cacheValidated.normalizedPayload);
                setHistError(null);
              });
              releaseHistLoadingUi('cache-hit');
            } else {
              telemetry.recordOutcome(HYDRATION_OUTCOME.CACHE_INVALID, cacheValidated.errorReason);
              void removeLearningSessionCache(hydrationLearningSessionId);
            }
          }
        } else if (skipCache && hydrationMode === 'learning-session') {
          telemetry.markCacheEnd({ skipped: true });
        }

        if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) {
          telemetry.recordOutcome(HYDRATION_OUTCOME.STALE_LOAD_IGNORED, 'before-network');
          sessionOutcome = HYDRATION_OUTCOME.STALE_LOAD_IGNORED;
          return;
        }

        let raw = null;
        telemetry.markNetworkStart();
        if (hydrationMode === 'attempt' && hydrationAttemptId) {
          raw = await getAttemptResult(hydrationAttemptId, { signal: ac.signal });
        } else if (hydrationMode === 'learning-session' && hydrationLearningSessionId) {
          raw = await getLearningSession(hydrationLearningSessionId, { signal: ac.signal });
        }
        telemetry.markNetworkEnd();

        if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) {
          telemetry.recordOutcome(HYDRATION_OUTCOME.STALE_LOAD_IGNORED, 'after-network');
          sessionOutcome = HYDRATION_OUTCOME.STALE_LOAD_IGNORED;
          return;
        }

        const mapped =
          hydrationMode === 'attempt'
            ? mapAttemptResultToNavExtras(raw)
            : hydrationMode === 'learning-session'
            ? mapLearningSessionToNavExtras(raw)
            : null;

        telemetry.markValidationStart();
        const validated = validateAndNormalizeHistoricalPayload(mapped, {
          source: hydrationMode,
          rawApi: raw,
          requireTestId: hydrationMode === 'attempt',
        });
        telemetry.markValidationEnd();

        if (!validated.valid) {
          const failOutcome =
            validated.errorCode === HYDRATION_PAYLOAD_ERROR.UNSUPPORTED
              ? HYDRATION_OUTCOME.UNSUPPORTED_SNAPSHOT
              : HYDRATION_OUTCOME.CORRUPT_PAYLOAD;
          telemetry.recordOutcome(failOutcome, validated.errorReason);
          sessionOutcome = failOutcome;
          if (!cacheHadPayload) {
            applyIfOwner('invalid-payload', () => {
              setHistoricalExtras(null);
              setHistError(
                createHydrationPayloadError(
                  validated.errorCode || HYDRATION_PAYLOAD_ERROR.INVALID,
                  validated.errorCode === HYDRATION_PAYLOAD_ERROR.UNSUPPORTED
                    ? undefined
                    : 'Invalid result payload'
                )
              );
            });
          }
          return;
        }

        sessionOutcome = validated.recoverable
          ? HYDRATION_OUTCOME.HYDRATION_RECOVERED
          : HYDRATION_OUTCOME.SUCCESS;
        telemetry.recordOutcome(sessionOutcome);
        applyIfOwner('network-success', () => {
          setHistoricalExtras(validated.normalizedPayload);
          setHistError(null);
        });

        if (hydrationMode === 'learning-session' && hydrationLearningSessionId && raw) {
          void putLearningSessionCache(hydrationLearningSessionId, raw);
        }
      } catch (e) {
        if (isRequestCancelled(e)) {
          telemetry.recordOutcome(HYDRATION_OUTCOME.REQUEST_CANCELLED);
          sessionOutcome = HYDRATION_OUTCOME.REQUEST_CANCELLED;
          return;
        }
        if (!isActiveHistoricalOwnership(ownership, activeLoadIdRef)) {
          telemetry.recordOutcome(HYDRATION_OUTCOME.STALE_LOAD_IGNORED, 'error-path');
          sessionOutcome = HYDRATION_OUTCOME.STALE_LOAD_IGNORED;
          return;
        }
        if (hydrationMode === 'learning-session' && cacheHadPayload) {
          return;
        }
        const failOutcome = classifyHydrationError(e);
        telemetry.recordOutcome(failOutcome, e?.message);
        sessionOutcome = failOutcome;
        applyIfOwner('error', () => {
          setHistoricalExtras(null);
          setHistError(e);
        });
      } finally {
        if (!sessionOutcome && !ownership.settled) {
          sessionOutcome = HYDRATION_OUTCOME.HYDRATION_FAILED;
          telemetry.recordOutcome(sessionOutcome, 'unsettled-exit');
        }
        closeTelemetry(sessionOutcome || HYDRATION_OUTCOME.REQUEST_CANCELLED);
        settleHistoricalOwnership('finally');
        if (histAbortRef.current === ac) {
          histAbortRef.current = null;
        }
      }
    })();

    return () => {
      telemetry.log('effect-cleanup', { loadId });
      ac.abort();
      if (histAbortRef.current === ac) {
        histAbortRef.current = null;
      }
      if (isActiveHistoricalOwnership(ownership, activeLoadIdRef)) {
        telemetry.recordOutcome(HYDRATION_OUTCOME.REQUEST_CANCELLED, 'cleanup');
        closeTelemetry(HYDRATION_OUTCOME.REQUEST_CANCELLED);
        settleHistoricalOwnership('effect-cleanup', { invalidateStale: true });
      }
    };
  }, [
    hydrationMode,
    hydrationAttemptId,
    hydrationLearningSessionId,
    needsServerHydration,
    retryTick,
  ]);

  const params = useMemo(() => {
    const base = route.params && typeof route.params === 'object' ? route.params : {};
    if (!needsServerHydration || !historicalExtras) return base;
    const { attemptId: _a, learningSessionId: _l, ...rest } = base;
    const merged = { ...rest, ...historicalExtras };
    const validated = validateAndNormalizeHistoricalPayload(merged, {
      source: hydrationMode,
      requireTestId: hydrationMode === 'attempt',
    });
    if (validated.valid) return validated.normalizedPayload;
    return rest;
  }, [route.params, needsServerHydration, historicalExtras, hydrationMode]);

  const hasParams = !!params && typeof params === 'object';

  const reviewParams = useMemo(() => {
    const base = normalizeResultReviewParams(params);
    const needsReviewGuard =
      needsServerHydration ||
      base.viewingHistoricalAttempt ||
      base.historicalAttemptMode ||
      base.immutableAttemptSnapshot;
    if (!needsReviewGuard) return base;
    return ensureRenderSafeReviewParams(base, {
      source: hydrationMode === 'inline' ? 'inline' : hydrationMode || 'review',
    });
  }, [params, needsServerHydration, hydrationMode]);

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
    summary: resultSummary = null,
    retryMeta = null,
    recoveredSubmit = false,
    viewingHistoricalAttempt = false,
    historicalAttemptMode = false,
    immutableAttemptSnapshot = false,
    historicalAttemptId = null,
    historicalLearningSessionId = null,
    learningSessionId = null,
    retrySkippedUnavailableCount = 0,
    testAvailable = true,
    testRetired = false,
    testTitle: _testTitle = null,
    returnMainTab = null,
    practiceRevealed = false,
  } = reviewParams;

  const isRetry = !!reviewParams.retry;
  const isHistoricalAttempt = viewingHistoricalAttempt || historicalAttemptMode;
  const resultIdentityKey = `${
    historicalAttemptId ||
    historicalLearningSessionId ||
    learningSessionId ||
    testId ||
    'session'
  }-${isRetry ? 'retry' : 'main'}`;
  const belowFoldReady =
    deferredHydrationState.key === resultIdentityKey && deferredHydrationState.belowFoldReady;
  const deepDeferredReady =
    deferredHydrationState.key === resultIdentityKey && deferredHydrationState.deepReady;

  const navigateBackFromResult = useCallback(() => {
    const { route: mainRoute } = resolveResultBackTarget(params);
    navigation.navigate(mainRoute.name, mainRoute.params);
  }, [navigation, params]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigateBackFromResult();
        return true;
      });
      return () => sub.remove();
    }, [navigateBackFromResult])
  );

  useEffect(() => {
    const readyForDeferredHydration =
      hasParams && (!needsServerHydration || (!!historicalExtras && !histLoading));
    if (!readyForDeferredHydration) return undefined;

    let cancelled = false;
    let deepTimer = null;
    setDeferredHydrationState({
      key: resultIdentityKey,
      belowFoldReady: false,
      deepReady: false,
    });

    const paintHandle = requestAnimationFrame(() => {
      if (cancelled) return;
      resultDeferDevLog('first_useful_paint', {
        key: resultIdentityKey,
        historical: isHistoricalAttempt,
        retry: isRetry,
      });
    });

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      resultDeferDevLog('below_fold_hydrate', { key: resultIdentityKey });
      setDeferredHydrationState({
        key: resultIdentityKey,
        belowFoldReady: true,
        deepReady: false,
      });
      deepTimer = setTimeout(() => {
        if (cancelled) return;
        resultDeferDevLog('deep_sections_hydrate', { key: resultIdentityKey });
        setDeferredHydrationState({
          key: resultIdentityKey,
          belowFoldReady: true,
          deepReady: true,
        });
      }, RESULT_DEFER_DEEP_DELAY_MS);
    });

    return () => {
      cancelled = true;
      if (paintHandle != null) cancelAnimationFrame(paintHandle);
      interactionHandle.cancel();
      if (deepTimer) clearTimeout(deepTimer);
    };
  }, [
    hasParams,
    histLoading,
    historicalExtras,
    isHistoricalAttempt,
    isRetry,
    needsServerHydration,
    resultIdentityKey,
  ]);

  const isMock = !!testId && !isRetry;
  const isPracticeSession = !isMock;

  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState(null);
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    const ac = new AbortController();
    const loadAttempts = async () => {
      if (!isMock || viewingHistoricalAttempt || !deepDeferredReady) {
        setAttemptsLoading(false);
        if (!deepDeferredReady) {
          setAttemptsError(null);
          setAttempts([]);
        }
        return;
      }
      setAttemptsLoading(true);
      setAttemptsError(null);
      resultDeferDevLog('attempt_history_fetch_start', {
        key: resultIdentityKey,
        testId: String(testId || ''),
      });
      try {
        const data = await getTestAttempts(testId, { signal: ac.signal });
        const list = Array.isArray(data?.attempts) ? data.attempts : [];
        if (ac.signal.aborted) return;
        setAttempts(list);
        resultDeferDevLog('attempt_history_fetch_ok', {
          key: resultIdentityKey,
          attempts: list.length,
        });
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
  }, [deepDeferredReady, isMock, resultIdentityKey, testId, viewingHistoricalAttempt]);

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

  const retryLists = useMemo(() => {
    const qs = Array.isArray(questions) ? questions : [];
    return computeRetryListsFromResult({
      questionsOrdered: qs,
      userAnswers: userAnswers && typeof userAnswers === 'object' ? userAnswers : {},
      getCorrectSetFor,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, userAnswers, correctAnswerMap, immutableAttemptSnapshot, isHistoricalAttempt]);

  const wrongQuestions = retryLists.wrongQuestions;
  const wrongQuestionIds = retryLists.wrongQuestionIds;
  const retrySkippedFromSelection = retryLists.retrySkippedUnavailableCount;

  const retryBreakdown = useMemo(() => {
    let unanswered = 0;
    let incorrect = 0;
    const worthy = new Set(wrongQuestionIds);
    const qs = Array.isArray(questions) ? questions : [];
    for (const q of qs) {
      const qid = String(q?._id ?? '');
      if (!worthy.has(qid)) continue;
      const userArr = toIndexArray(userAnswers?.[qid]);
      if (userArr.length === 0) unanswered += 1;
      else incorrect += 1;
    }
    return {
      incorrect,
      unanswered,
      total: wrongQuestionIds.length,
      retryable: wrongQuestions.length,
    };
  }, [questions, wrongQuestionIds, wrongQuestions, userAnswers]);

  const mockAttemptStats = useMemo(() => {
    if (isRetry || !belowFoldReady) return null;
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
  }, [belowFoldReady, isRetry, questions, userAnswers, correctAnswers]);

  const displayStats = useMemo(() => {
    const qlen = Array.isArray(questions) ? questions.length : 0;
    if (isRetry && resultSummary && typeof resultSummary === 'object') {
      const totalQ = Number(resultSummary.totalQuestions) || qlen;
      const answeredQ = Number(resultSummary.answeredQ) || 0;
      const unansweredQ =
        resultSummary.unanswered != null
          ? Number(resultSummary.unanswered)
          : Math.max(0, totalQ - answeredQ);
      return {
        totalQ,
        answeredQ,
        unansweredQ,
        skippedQ: null,
        markedQ: null,
      };
    }
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
    isRetry,
    resultSummary,
    questions,
    totalQuestions,
    attemptedQuestions,
    unansweredQuestionsParam,
    skippedQuestionsParam,
    markedForReviewParam,
  ]);

  const handleReviewAnswers = () => {
    runOnce(() => {
      const reviewParams = {
        questions: Array.isArray(questions) ? questions : [],
        userAnswers: userAnswers && typeof userAnswers === 'object' ? userAnswers : {},
        correctAnswers: Array.isArray(correctAnswers) ? correctAnswers : [],
        readOnly: true,
      };
      logNavigationPayload('ReviewAnswers', reviewParams, {
        includeDebug: true,
        source: 'result_review_answers',
      });
      navigation.navigate('ReviewAnswers', reviewParams);
    });
  };

  const retryStats = useMemo(() => {
    if (!isRetry) return null;
    const fromSummary = buildRetryStatsFromSummary(resultSummary, true);
    if (fromSummary) return fromSummary;
    const list = Array.isArray(questions) ? questions : [];
    const total = list.length;
    let correct = 0;
    for (const q of list) {
      const qid = String(q?._id ?? '');
      const userArr = toIndexArray(userAnswers?.[qid]);
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
  }, [isRetry, resultSummary, questions, userAnswers, correctAnswerMap]);

  /** Retry-session questions still wrong (canonical lists from scored payload). */
  const retryWrongQuestionIds = useMemo(
    () => (isRetry ? wrongQuestionIds : []),
    [isRetry, wrongQuestionIds]
  );

  const retryWrongQuestions = useMemo(
    () => (isRetry ? wrongQuestions : []),
    [isRetry, wrongQuestions]
  );

  const retryCtaCopy = useMemo(
    () =>
      buildRetryCtaCopy({
        total: retryBreakdown.total,
        incorrect: retryBreakdown.incorrect,
        unanswered: retryBreakdown.unanswered,
        retryable: retryBreakdown.retryable,
        examTotal: displayStats.totalQ,
      }),
    [retryBreakdown, displayStats.totalQ]
  );

  const retryAgainCopy = useMemo(
    () => buildRetryAgainCopy(retryWrongQuestionIds.length),
    [retryWrongQuestionIds.length]
  );

  const retryEntryCta = useMemo(
    () => ({
      title: getRetryEntryCtaTitle({
        incorrect: retryBreakdown.incorrect,
        unanswered: retryBreakdown.unanswered,
        retryable: retryBreakdown.retryable,
      }),
      subtitle: getRetryEntryCtaSubtitle(retryBreakdown.retryable),
    }),
    [retryBreakdown]
  );

  const handleRetryWrong = () => {
    if (!wrongQuestionIds.length) return;
    const { retryable, skipped: skippedLocal } = partitionRetryableQuestions(wrongQuestions);
    const skippedTotal =
      (Number(retrySkippedUnavailableCount) || 0) +
      retrySkippedFromSelection +
      skippedLocal;
    if (!retryable.length) {
      Alert.alert(
        'Unable to start practice',
        skippedTotal > 0
          ? `Those questions are no longer available. Try Review answers to study what you can.`
          : 'Nothing from this attempt can be practiced right now. Review answers may still help.'
      );
      return;
    }
    if (skippedTotal > 0) {
      Alert.alert(
        'Starting focused recovery',
        `${skippedTotal} question${skippedTotal === 1 ? '' : 's'} couldn't be included — the rest are ready when you are.`
      );
    }
    const sourceForIssue =
      historicalAttemptId ||
      (retryMeta && retryMeta.sourceAttemptId != null ? String(retryMeta.sourceAttemptId) : null);
    if (!sourceForIssue) {
      Alert.alert('Unable to start practice', 'Missing attempt reference for retry.');
      return;
    }
    void runOnceAsync(async () => {
      const qids = questionIdsFromDocs(retryable);
      try {
        const issued = await issuePracticeSession({
          practiceType: 'retry',
          questionIds: qids,
          sourceAttemptId: sourceForIssue,
        });
        const practiceSessionId = issued?.practiceSessionId;
        if (!practiceSessionId) {
          Alert.alert('Unable to start practice', 'Could not authorize this retry session.');
          return;
        }
        if (!isHistoricalAttempt) {
          storeSessionQuestionSnapshot(practiceSessionId, retryable, {
            source: 'retry_wrong_start',
          });
        }
        const testParams = {
          mode: 'retry',
          questionIds: qids,
          ...(isHistoricalAttempt ? { questions: retryable } : {}),
          practiceSessionId,
          historicalAttemptMode: isHistoricalAttempt,
          sourceAttemptId: sourceForIssue,
          originMainTab: resolveRetryOriginMainTab({
            returnMainTab,
            isHistoricalAttempt,
            testId,
          }),
          ...(() => {
            const tid = !isHistoricalAttempt ? resolveMongoId(testId, 'testId') : null;
            return tid ? { testId: tid } : {};
          })(),
        };
        logNavigationPayload('Test', testParams, {
          includeDebug: true,
          source: 'retry_wrong_start',
        });
        navigation.navigate('Test', testParams);
      } catch (e) {
        if (!isRequestCancelled(e)) {
          Alert.alert('Unable to start practice', getApiErrorMessage(e));
        }
      }
    });
  };

  const handleRetryAgain = () => {
    if (!retryWrongQuestionIds.length) return;
    const histRetry =
      isHistoricalAttempt || !!(retryMeta && retryMeta.historicalAttemptMode);
    const sourceId =
      historicalAttemptId ||
      (retryMeta && retryMeta.sourceAttemptId != null
        ? String(retryMeta.sourceAttemptId)
        : null);
    if (!sourceId) {
      Alert.alert('Unable to start practice', 'Missing attempt reference for retry.');
      return;
    }
    void runOnceAsync(async () => {
      try {
        const issued = await issuePracticeSession({
          practiceType: 'retry',
          questionIds: retryWrongQuestionIds,
          sourceAttemptId: sourceId,
        });
        const practiceSessionId = issued?.practiceSessionId;
        if (!practiceSessionId) {
          Alert.alert('Unable to start practice', 'Could not authorize this retry session.');
          return;
        }
        if (!histRetry) {
          storeSessionQuestionSnapshot(practiceSessionId, retryWrongQuestions, {
            source: 'retry_again_start',
          });
        }
        const testParams = {
          mode: 'retry',
          questionIds: retryWrongQuestionIds,
          ...(histRetry ? { questions: retryWrongQuestions } : {}),
          practiceSessionId,
          historicalAttemptMode: histRetry,
          sourceAttemptId: sourceId,
          originMainTab: resolveRetryOriginMainTab({
            returnMainTab,
            isHistoricalAttempt: histRetry,
            testId,
          }),
          ...(() => {
            const tid = !histRetry ? resolveMongoId(testId, 'testId') : null;
            return tid ? { testId: tid } : {};
          })(),
        };
        logNavigationPayload('Test', testParams, {
          includeDebug: true,
          source: 'retry_again_start',
        });
        navigation.navigate('Test', testParams);
      } catch (e) {
        if (!isRequestCancelled(e)) {
          Alert.alert('Unable to start practice', getApiErrorMessage(e));
        }
      }
    });
  };

  const [practiceTopicId, setPracticeTopicId] = useState(null);
  const [practiceError, setPracticeError] = useState(null);
  const [topicMap, setTopicMap] = useState({});
  const [catalogTopics, setCatalogTopics] = useState([]);
  /** Last good catalog labels — stable fallback when live fetch fails. */
  const [stableCatalogLabels, setStableCatalogLabels] = useState(() =>
    getCachedTopicLabelMap()
  );
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakTopicsExpanded, setWeakTopicsExpanded] = useState(false);

  // "Weak Topic Resources" recommender. Both lists are populated from a
  // single `useEffect` (see below) that fans out to the notes and pdfs
  // APIs in parallel after the result is rendered. Everything is capped
  // at MAX_RECOMMENDATIONS before being committed to state.
  const [recommendedNotes, setRecommendedNotes] = useState([]);
  const [recommendedPdfs, setRecommendedPdfs] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);
  const [openingPdfId, setOpeningPdfId] = useState(null);
  const rawWeakTopics = Array.isArray(weakTopics) ? weakTopics : [];

  // Normalize ids/names from server, local practice, or historical payloads.
  const normalizedWeakTopics = useMemo(
    () => (belowFoldReady ? normalizeWeakTopicsList(rawWeakTopics) : []),
    [belowFoldReady, rawWeakTopics]
  );

  const topicLabelContext = useMemo(
    () =>
      belowFoldReady
        ? createTopicLabelContext({
            catalogMap: topicMap,
            questions,
            historicalQuestions: isHistoricalAttempt ? questions : [],
            supplementalQuestions: wrongQuestions,
            rawWeakTopics: weakTopics,
            cachedCatalogMap: stableCatalogLabels,
          })
        : null,
    [
      belowFoldReady,
      topicMap,
      questions,
      isHistoricalAttempt,
      wrongQuestions,
      weakTopics,
      stableCatalogLabels,
    ]
  );

  const renderableWeakTopics = useMemo(
    () =>
      belowFoldReady && topicLabelContext
        ? buildRenderableWeakTopics(normalizedWeakTopics, topicLabelContext)
        : [],
    [belowFoldReady, normalizedWeakTopics, topicLabelContext]
  );

  const weakTopicIds = useMemo(
    () => (deepDeferredReady ? renderableWeakTopics.map((t) => t.topicId) : []),
    [deepDeferredReady, renderableWeakTopics]
  );

  const visibleWeakTopics = useMemo(() => {
    if (weakTopicsExpanded) return renderableWeakTopics;
    return renderableWeakTopics.slice(0, WEAK_FOCUS_PREVIEW);
  }, [renderableWeakTopics, weakTopicsExpanded]);

  const weakTopicsHiddenCount = Math.max(
    0,
    renderableWeakTopics.length - WEAK_FOCUS_PREVIEW
  );

  const hadRawWeakTopics = rawWeakTopics.length > 0;
  const focusAreasSuppressedOnly =
    hadRawWeakTopics && normalizedWeakTopics.length > 0 && renderableWeakTopics.length === 0;

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
    if (!belowFoldReady) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const data = await getTopics({ signal: ac.signal });
        const list = Array.isArray(data?.topics) ? data.topics : [];
        const map = buildTopicLabelMapFromCatalog(list);
        if (!ac.signal.aborted) {
          setCatalogTopics(list);
          setTopicMap(map);
          if (Object.keys(map).length > 0) {
            setStableCatalogLabels(map);
          }
          resultDeferDevLog('focus_topics_ready', {
            key: resultIdentityKey,
            count: list.length,
          });
        }
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        logger.info('[TOPICS] failed to load:', getApiErrorMessage(e));
      }
    })();
    return () => {
      ac.abort();
    };
  }, [belowFoldReady, resultIdentityKey]);

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
    if (!deepDeferredReady) return undefined;
    if (weakTopicIds.length === 0) {
      setRecommendedNotes([]);
      setRecommendedPdfs([]);
      setRecError(null);
      return undefined;
    }

    const ac = new AbortController();
    setRecLoading(true);
    setRecError(null);
    resultDeferDevLog('resource_hydration_start', {
      key: resultIdentityKey,
      weakTopics: weakTopicIds.length,
    });

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
        resultDeferDevLog('resource_hydration_ok', {
          key: resultIdentityKey,
          notes: nextNotes.length,
          pdfs: nextPdfs.length,
        });

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
  }, [deepDeferredReady, recommendedPostId, resultIdentityKey, weakTopicIds]);

  const handleOpenNote = (note) => {
    if (!note) return;
    runOnce(() => navigation.navigate('NoteDetail', { note }));
  };

  /**
   * Open a PDF in the in-app browser (Chrome Custom Tab / SFSafariView).
   * Mirrors the behaviour of PdfListScreen so the PDF UX is consistent
   * wherever the user encounters PDFs in the app.
   */
  const handleOpenPdf = async (pdf) => {
    if (isGlobalOpening(openingPdfId)) return;
    const id = resolveMongoId(pdf?._id ?? pdf?.pdfId, 'pdfId');
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
      }, { pdfId: id });
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
    const topicIds = weakTopicIds.map((id) => resolvePracticeTopicId(id, catalogTopics));
    await runOnceAsync(async () => {
      setPracticeError(null);
      setWeakLoading(true);
      try {
        const data = await getWeakPractice(topicIds, { limit: 10 });
        const fetched = Array.isArray(data?.questions) ? data.questions : [];
        if (fetched.length === 0) {
          setPracticeError('No questions available for practice.');
          return;
        }
        const questionIds = questionIdsFromDocs(fetched);
        if (!questionIds.length) {
          setPracticeError('No practice questions available for this topic.');
          return;
        }
        const practiceSessionId = data?.practiceSessionId;
        if (!practiceSessionId) {
          setPracticeError('Could not start practice session. Please try again.');
          return;
        }
        storeSessionQuestionSnapshot(practiceSessionId, fetched, {
          source: 'weak_practice_start',
        });
        const testParams = {
          mode: 'practice',
          practiceType: 'weak',
          questionIds,
          practiceSessionId,
          originMainTab: resolveRetryOriginMainTab({
            returnMainTab,
            isHistoricalAttempt,
            testId,
          }),
        };
        logNavigationPayload('Test', testParams, {
          includeDebug: true,
          source: 'weak_practice_start',
        });
        navigation.navigate('Test', testParams);
      } catch (e) {
        setPracticeError(getApiErrorMessage(e));
      } finally {
        setWeakLoading(false);
      }
    });
  };

  const handlePractice = async (topicId) => {
    const id = resolvePracticeTopicId(resolveTopicId(topicId), catalogTopics);
    if (!id || practiceTopicId) return;
    await runOnceAsync(async () => {
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
        const issued = await issuePracticeSession({
          practiceType: 'topic',
          questionIds,
        });
        const practiceSessionId = issued?.practiceSessionId;
        if (!practiceSessionId) {
          setPracticeError('Could not start practice session. Please try again.');
          return;
        }
        storeSessionQuestionSnapshot(practiceSessionId, limited, {
          source: 'topic_practice_start',
        });
        const testParams = {
          mode: 'practice',
          practiceType: 'topic',
          questionIds,
          practiceSessionId,
          originMainTab: resolveRetryOriginMainTab({
            returnMainTab,
            isHistoricalAttempt,
            testId,
          }),
        };
        logNavigationPayload('Test', testParams, {
          includeDebug: true,
          source: 'topic_practice_start',
        });
        navigation.navigate('Test', testParams);
      } catch (e) {
        setPracticeError(getApiErrorMessage(e));
      } finally {
        setPracticeTopicId(null);
      }
    });
  };

  const sessionContext = useMemo(
    () =>
      getSessionContext({
        isRetry,
        isMock,
        returnMainTab,
        testTitle: _testTitle,
      }),
    [isRetry, isMock, returnMainTab, _testTitle]
  );

  const progressInsight = useMemo(() => {
    if (isRetry || isHistoricalAttempt || !isMock || attempts.length === 0) return null;
    const prev = Number(attempts[0]?.accuracy) || 0;
    const current = Number(accuracy) || 0;
    const delta = Math.round((current - prev) * 10) / 10;
    if (Math.abs(delta) < 0.05) {
      return { text: 'On par with your previous attempt', variant: 'neutral' };
    }
    if (delta > 0) return { text: `Up ${delta}% from your previous attempt`, variant: 'up' };
    return {
      text: `${Math.abs(delta)}% below last time — a focused retry can lift you`,
      variant: 'focus',
    };
  }, [isRetry, isHistoricalAttempt, isMock, attempts, accuracy]);

  const streakCount = Number(user?.streakCount) || 0;
  const showStreakChip =
    !isHistoricalAttempt && !isRetry && returnMainTab === MAIN_TABS.HOME && streakCount > 0;

  const immediateCorrectCount = Number(score) || 0;
  const immediateWrongCount = Math.max(
    0,
    (Number(displayStats.answeredQ) || 0) - immediateCorrectCount
  );
  const correctCount = mockAttemptStats?.correct ?? immediateCorrectCount;
  const wrongCount = mockAttemptStats?.incorrect ?? immediateWrongCount;

  const heroAccuracy =
    isRetry && retryStats ? retryStats.accuracyPct : Number(accuracy) || 0;
  const heroCorrect = isRetry && retryStats ? retryStats.correct : correctCount;
  const heroTotal = isRetry && retryStats ? retryStats.total : displayStats.totalQ;
  const heroToImprove = Math.max(0, heroTotal - heroCorrect);
  const retryStillRevisit = retryWrongQuestionIds.length;

  const retryProgressLine = useMemo(() => {
    if (!isRetry || !retryStats) return null;
    return `${retryStats.correct} of ${retryStats.total} correct on this recovery round`;
  }, [isRetry, retryStats]);

  const retrySessionHint = useMemo(() => {
    if (!isRetry) return null;
    if (_testTitle) return `${formatMockExamHint(_testTitle)} · second pass`;
    if (isMock || testId) return 'Recovery from your mock attempt';
    return 'Recovery from your previous session';
  }, [isRetry, _testTitle, isMock, testId]);

  const tier = useMemo(() => {
    const base = getPerformanceTier(heroAccuracy);
    if (isRetry) {
      return {
        ...base,
        message: getRetryCompletionMessage({
          correct: retryStats?.correct ?? heroCorrect,
          total: retryStats?.total ?? heroTotal,
          remainingWrong: retryStillRevisit,
        }),
      };
    }
    if (isMock) {
      return {
        ...base,
        message: getMockTierMessage(
          heroAccuracy,
          wrongQuestionIds.length,
          displayStats.totalQ
        ),
      };
    }
    if (isPracticeSession) {
      return {
        ...base,
        message: getEncouragingTierMessage(
          heroAccuracy,
          wrongQuestionIds.length,
          displayStats.totalQ
        ),
      };
    }
    return base;
  }, [
    heroAccuracy,
    isRetry,
    isMock,
    isPracticeSession,
    wrongQuestionIds.length,
    displayStats.totalQ,
    retryStats,
    retryStillRevisit,
    heroCorrect,
    heroTotal,
  ]);

  const mockPacingLine = useMemo(() => {
    if (!isMock || isRetry) return null;
    return buildMockPacingLine(timeTaken, displayStats.totalQ);
  }, [isMock, isRetry, timeTaken, displayStats.totalQ]);

  const resultAnimKey = resultIdentityKey;

  useEffect(() => {
    heroOpacity.setValue(0);
    Animated.timing(heroOpacity, {
      toValue: 1,
      duration: motion.duration.fast,
      useNativeDriver: true,
    }).start();
  }, [resultAnimKey, heroOpacity]);

  const renderPrimaryActions = () => {
    const hasWrong = !isRetry && wrongQuestionIds.length > 0;
    const hasRetryWrong = isRetry && retryWrongQuestionIds.length > 0;
    const allCorrect =
      !isRetry && wrongQuestionIds.length === 0 && displayStats.totalQ > 0;
    const showReviewPrimary = allCorrect || (isRetry && !hasRetryWrong);
    const showReviewSecondary = hasWrong || hasRetryWrong;

    return (
      <View style={styles.actionsBlock}>
        <Text style={styles.actionsHeading}>Next steps</Text>
        {hasWrong && retryCtaCopy.encourage ? (
          <Text style={styles.retryEncourage} numberOfLines={2}>
            {retryCtaCopy.encourage}
          </Text>
        ) : null}
        {hasWrong ? (
          <Pressable
            onPress={handleRetryWrong}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>{retryCtaCopy.title}</Text>
            <Text style={styles.actionPrimarySub}>{retryCtaCopy.subtitle}</Text>
          </Pressable>
        ) : null}
        {hasRetryWrong ? (
          <Pressable
            onPress={handleRetryAgain}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>{retryAgainCopy.title}</Text>
            <Text style={styles.actionPrimarySub}>{retryAgainCopy.subtitle}</Text>
          </Pressable>
        ) : null}
        {allCorrect ? (
          <View style={styles.perfectCard}>
            <Text style={styles.perfectTitle}>All questions correct</Text>
            <Text style={styles.perfectSub}>
              Reinforce what you know by reviewing your answers.
            </Text>
          </View>
        ) : null}
        {showReviewPrimary ? (
          <Pressable
            onPress={handleReviewAnswers}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>Review answers</Text>
            <Text style={styles.actionPrimarySub}>Questions and explanations</Text>
          </Pressable>
        ) : null}
        {showReviewSecondary ? (
          <Pressable
            onPress={handleReviewAnswers}
            style={({ pressed }) => [styles.actionSecondary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionSecondaryTitle}>Review answers</Text>
            <Text style={styles.actionSecondarySub}>See what you missed</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderPracticeNextSteps = () => {
    const hasWeak = hadRawWeakTopics || renderableWeakTopics.length > 0;
    const hasWrong = wrongQuestionIds.length > 0;
    const allCorrect = !hasWrong && displayStats.totalQ > 0;
    const showReviewPrimary = allCorrect;
    const showReviewSecondary = !showReviewPrimary;

    return (
      <View style={styles.actionsBlockPractice}>
        <Text style={styles.actionsHeading}>Next steps</Text>
        <Text style={styles.actionsHintPractice}>
          {hasWeak
            ? 'Review explanations when you are ready.'
            : 'Walk through answers to reinforce what you learned.'}
        </Text>
        {hasWrong && !hasWeak ? (
          <Pressable
            onPress={handleRetryWrong}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>{retryEntryCta.title}</Text>
            <Text style={styles.actionPrimarySub} numberOfLines={2}>
              {retryEntryCta.subtitle}
            </Text>
          </Pressable>
        ) : null}
        {allCorrect ? (
          <View style={styles.perfectCardCompact}>
            <Text style={styles.perfectTitle}>All questions correct</Text>
            <Text style={styles.perfectSub}>Review once to reinforce.</Text>
          </View>
        ) : null}
        {showReviewPrimary ? (
          <Pressable
            onPress={handleReviewAnswers}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>Review answers</Text>
            <Text style={styles.actionPrimarySub}>Questions and explanations</Text>
          </Pressable>
        ) : null}
        {showReviewSecondary ? (
          <Pressable
            onPress={handleReviewAnswers}
            style={({ pressed }) => [styles.actionSecondary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionSecondaryTitle}>Review answers</Text>
            <Text style={styles.actionSecondarySub}>See what you missed</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderWeakTopicsBlock = (variant = 'practice') => {
    const copy = variant === 'mock' ? MOCK_WEAK_SECTION : PRACTICE_WEAK_SECTION;
    const emptySub =
      renderableWeakTopics.length > 0
        ? copy.subtitle
        : focusAreasSuppressedOnly
        ? 'Unavailable for this session'
        : variant === 'mock'
        ? 'No weak sections flagged'
        : 'No weak topics this time';

    return (
    <>
      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionTitle}>{copy.title}</Text>
        <Text style={styles.sectionSubtitleShort}>{emptySub}</Text>
      </View>
      {renderableWeakTopics.length > 0 ? (
        <>
          <Pressable
            onPress={handleWeakPractice}
            disabled={weakLoading || practiceTopicId != null}
            style={({ pressed }) => [
              variant === 'mock' ? styles.weakCtaMock : styles.weakCtaPrimary,
              pressFeedbackStyle(pressed),
              (weakLoading || practiceTopicId != null) && styles.btnDisabled,
            ]}
          >
            <Text
              style={
                variant === 'mock' ? styles.weakCtaMockText : styles.weakCtaPrimaryText
              }
            >
              {weakLoading ? 'Loading…' : copy.primaryCta}
            </Text>
            <Text
              style={
                variant === 'mock' ? styles.weakCtaMockSub : styles.weakCtaPrimarySub
              }
            >
              {copy.primarySub}
            </Text>
          </Pressable>
          <View style={styles.sectionCardCompact}>
            {visibleWeakTopics.map((item, idx) => (
              <View key={item.topicId}>
                {idx > 0 ? <View style={styles.weakSeparator} /> : null}
                <WeakTopicFocusRow
                  displayLabel={item.displayLabel}
                  mistakeCount={item.mistakeCount}
                  loading={practiceTopicId === item.topicId}
                  disabled={practiceTopicId != null}
                  onPractice={() => handlePractice(item.topicId)}
                />
              </View>
            ))}
          </View>
          {weakTopicsHiddenCount > 0 && !weakTopicsExpanded ? (
            <Pressable
              onPress={() => setWeakTopicsExpanded(true)}
              style={({ pressed }) => [styles.showAllBtn, pressFeedbackStyle(pressed)]}
            >
              <Text style={styles.showAllText}>
                Show all focus areas ({renderableWeakTopics.length})
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.sectionCardCompact}>
          <EmptyState
            compact
            {...(focusAreasSuppressedOnly ? EMPTY.FOCUS_AREAS_EMPTY : EMPTY.WEAK_TOPICS_CLEAR)}
          />
        </View>
      )}
      {practiceError ? <Text style={styles.err}>{practiceError}</Text> : null}
    </>
    );
  };

  const renderMockNextSteps = () => {
    const hasWrong = wrongQuestionIds.length > 0;
    const allCorrect = !hasWrong && displayStats.totalQ > 0;

    return (
      <View style={styles.actionsBlockMock}>
        <Text style={styles.actionsHeading}>Recovery steps</Text>
        <Text style={styles.actionsHintMock}>
          {hasWrong
            ? 'Retry targets what slipped — then review under exam conditions.'
            : 'Review your attempt to reinforce pacing and accuracy.'}
        </Text>
        {hasWrong ? (
          <Pressable
            onPress={handleRetryWrong}
            style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionPrimaryTitle}>{retryEntryCta.title}</Text>
            <Text style={styles.actionPrimarySub} numberOfLines={2}>
              {retryEntryCta.subtitle}
            </Text>
          </Pressable>
        ) : null}
        {allCorrect ? (
          <View style={styles.perfectCardCompact}>
            <Text style={styles.perfectTitle}>Full mock accuracy</Text>
            <Text style={styles.perfectSub}>Review once to confirm exam readiness.</Text>
          </View>
        ) : null}
        <Pressable
          onPress={handleReviewAnswers}
          style={({ pressed }) => [
            hasWrong ? styles.actionSecondary : styles.actionPrimary,
            pressFeedbackStyle(pressed),
          ]}
        >
          <Text
            style={
              hasWrong ? styles.actionSecondaryTitle : styles.actionPrimaryTitle
            }
          >
            Review answers
          </Text>
          <Text
            style={hasWrong ? styles.actionSecondarySub : styles.actionPrimarySub}
          >
            {hasWrong ? 'Explanations for each question' : 'Walk through the full mock'}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderRetryNextSteps = () => {
    const hasRetryWrong = retryWrongQuestionIds.length > 0;
    const clearedRound =
      !hasRetryWrong && (retryStats?.total ?? heroTotal) > 0;

    return (
      <View style={styles.actionsBlockRetry}>
        <Text style={styles.actionsHeading}>Recovery next steps</Text>
        <Text style={styles.actionsHintRetry}>
          {hasRetryWrong
            ? 'Review explanations while they are fresh — another recovery round is optional.'
            : clearedRound
            ? 'You cleared this recovery set — review to make it stick.'
            : 'Walk through explanations from this focused second attempt.'}
        </Text>
        <Pressable
          onPress={handleReviewAnswers}
          style={({ pressed }) => [styles.actionPrimary, pressFeedbackStyle(pressed)]}
        >
          <Text style={styles.actionPrimaryTitle}>Review answers</Text>
          <Text style={styles.actionPrimarySub}>
            {hasRetryWrong
              ? 'Explanations for questions still to revisit'
              : 'Questions and explanations from this round'}
          </Text>
        </Pressable>
        <Pressable
          onPress={navigateBackFromResult}
          style={({ pressed }) => [styles.actionSecondary, pressFeedbackStyle(pressed)]}
        >
          <Text style={styles.actionSecondaryTitle}>Continue learning</Text>
          <Text style={styles.actionSecondarySub}>Return to your study flow</Text>
        </Pressable>
        {hasRetryWrong ? (
          <Pressable
            onPress={handleRetryAgain}
            style={({ pressed }) => [styles.actionTertiary, pressFeedbackStyle(pressed)]}
          >
            <Text style={styles.actionTertiaryTitle}>{retryAgainCopy.title}</Text>
            {retryAgainCopy.subtitle ? (
              <Text style={styles.actionTertiarySub}>{retryAgainCopy.subtitle}</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderDeferredSectionPlaceholder = (title, subtitle, label = 'Loading…') => (
    <View style={styles.deferredSectionBlock}>
      <View style={styles.sectionHeaderCompact}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitleShort}>{subtitle}</Text> : null}
      </View>
      <View style={styles.sectionCardCompact}>
        <InlineLoading size="small" label={label} />
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      {isPracticeSession && !isRetry ? (
        <PracticeResultHero
          opacity={heroOpacity}
          sessionLabel={sessionContext.label}
          sessionHint={sessionContext.hint}
          heroCorrect={heroCorrect}
          heroTotal={heroTotal}
          toImprove={heroToImprove}
          heroAccuracy={heroAccuracy}
          tierMessage={tier.message}
          tierColor={tier.color}
          tierBg={tier.bg}
          timeLabel={Number(timeTaken) > 0 ? `Time ${formatDuration(timeTaken)}` : null}
        >
          {showStreakChip || progressInsight ? (
            <View style={styles.insightRow}>
              {showStreakChip ? (
                <View style={styles.insightChip}>
                  <Text style={styles.insightChipText}>🔥 {streakCount}-day streak</Text>
                </View>
              ) : null}
              {progressInsight ? (
                <View
                  style={[
                    styles.insightChip,
                    progressInsight.variant === 'up' && styles.insightChipUp,
                    progressInsight.variant === 'focus' && styles.insightChipFocus,
                  ]}
                >
                  <Text style={styles.insightChipText}>{progressInsight.text}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </PracticeResultHero>
      ) : isMock && !isRetry ? (
        <MockResultHero
          opacity={heroOpacity}
          sessionLabel="Mock assessment complete"
          examHint={formatMockExamHint(_testTitle)}
          heroCorrect={heroCorrect}
          heroTotal={heroTotal}
          toImprove={heroToImprove}
          heroAccuracy={heroAccuracy}
          tierMessage={tier.message}
          tierColor={tier.color}
          tierBg={tier.bg}
          pacingLine={mockPacingLine}
        >
          {progressInsight ? (
            <View style={styles.insightRow}>
              <View
                style={[
                  styles.insightChip,
                  progressInsight.variant === 'up' && styles.insightChipUp,
                  progressInsight.variant === 'focus' && styles.insightChipFocus,
                ]}
              >
                <Text style={styles.insightChipText}>{progressInsight.text}</Text>
              </View>
            </View>
          ) : null}
        </MockResultHero>
      ) : isRetry ? (
        <RetryResultHero
          opacity={heroOpacity}
          sessionHint={retrySessionHint}
          heroCorrect={heroCorrect}
          heroTotal={heroTotal}
          stillRevisit={retryStillRevisit}
          heroAccuracy={heroAccuracy}
          tierMessage={tier.message}
          tierColor={tier.color}
          tierBg={tier.bg}
          progressLine={retryProgressLine}
        />
      ) : (
        <Animated.View
          style={[
            styles.heroCard,
            { borderColor: tier.color, backgroundColor: tier.bg, opacity: heroOpacity },
          ]}
        >
          <Text style={styles.sessionLabel}>{sessionContext.label}</Text>
          <Text style={styles.sessionHint}>{sessionContext.hint}</Text>
          <Text style={[styles.heroAccuracyMain, { color: tier.color }]}>
            {String(heroAccuracy)}%
          </Text>
          <Text style={styles.heroCorrectLine}>
            {String(heroCorrect)} of {String(heroTotal)} correct
          </Text>
          {Number(timeTaken) > 0 ? (
            <Text style={styles.heroMeta}>Time {formatDuration(timeTaken)}</Text>
          ) : null}
          <Text style={[styles.heroMessage, { color: tier.color }]}>{tier.message}</Text>
          {showStreakChip || progressInsight ? (
            <View style={styles.insightRow}>
              {showStreakChip ? (
                <View style={styles.insightChip}>
                  <Text style={styles.insightChipText}>🔥 {streakCount}-day streak</Text>
                </View>
              ) : null}
              {progressInsight ? (
                <View
                  style={[
                    styles.insightChip,
                    progressInsight.variant === 'up' && styles.insightChipUp,
                    progressInsight.variant === 'focus' && styles.insightChipFocus,
                  ]}
                >
                  <Text style={styles.insightChipText}>{progressInsight.text}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      )}

      {recoveredSubmit ? (
        <View style={styles.recoveredBanner}>
          <Text style={styles.recoveredBannerText}>
            Test already submitted — showing your saved results.
          </Text>
        </View>
      ) : null}

      {isHistoricalAttempt && testAvailable === false ? (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableBannerText}>
            This test record was removed. Your attempt results are preserved below.
          </Text>
        </View>
      ) : null}

      {isHistoricalAttempt && testRetired && testAvailable !== false ? (
        <View style={styles.unavailableBanner}>
          <Text style={styles.unavailableBannerText}>
            This mock test is no longer offered for new attempts. Your historical review is
            unchanged.
          </Text>
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

      <View
        style={[
          styles.statsCompact,
          isPracticeSession && !isRetry && styles.statsCompactPractice,
          isMock && !isRetry && styles.statsCompactMock,
          isRetry && styles.statsCompactRetry,
        ]}
      >
        <View style={styles.statCell}>
          <Text style={[styles.statCellValue, styles.statPositive]}>{String(heroCorrect)}</Text>
          <Text style={styles.statCellLabel}>Correct</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text
            style={[
              styles.statCellValue,
              (isRetry && retryStats
                ? retryStats.total - retryStats.correct
                : wrongCount) > 0 &&
                (isMock && !isRetry ? styles.statMissedMock : styles.statNegative),
            ]}
          >
            {String(
              isRetry && retryStats
                ? Math.max(0, retryStats.total - retryStats.correct)
                : wrongCount
            )}
          </Text>
          <Text style={styles.statCellLabel}>Missed</Text>
        </View>
        {!isRetry && displayStats.unansweredQ > 0 ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>{String(displayStats.unansweredQ)}</Text>
              <Text style={styles.statCellLabel}>Unanswered</Text>
            </View>
          </>
        ) : null}
        {Number(timeTaken) > 0 && !isPracticeSession && !(isMock && !isRetry) ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statCellValue}>{formatDuration(timeTaken)}</Text>
              <Text style={styles.statCellLabel}>Time</Text>
            </View>
          </>
        ) : null}
      </View>

      {isPracticeSession && !isRetry ? (
        <>
          {renderPracticeNextSteps()}
          {belowFoldReady
            ? renderWeakTopicsBlock('practice')
            : hadRawWeakTopics
            ? renderDeferredSectionPlaceholder(
                PRACTICE_WEAK_SECTION.title,
                PRACTICE_WEAK_SECTION.subtitle,
                'Loading focus areas…'
              )
            : null}
        </>
      ) : isMock && !isRetry ? (
        <>
          {renderMockNextSteps()}
          {belowFoldReady
            ? renderWeakTopicsBlock('mock')
            : hadRawWeakTopics
            ? renderDeferredSectionPlaceholder(
                MOCK_WEAK_SECTION.title,
                MOCK_WEAK_SECTION.subtitle,
                'Loading weak sections…'
              )
            : null}
        </>
      ) : isRetry ? (
        <>
          {renderRetryNextSteps()}
          {belowFoldReady && renderableWeakTopics.length > 0
            ? renderWeakTopicsBlock(testId ? 'mock' : 'practice')
            : !belowFoldReady && hadRawWeakTopics
            ? renderDeferredSectionPlaceholder(
                testId ? MOCK_WEAK_SECTION.title : PRACTICE_WEAK_SECTION.title,
                testId ? MOCK_WEAK_SECTION.subtitle : PRACTICE_WEAK_SECTION.subtitle,
                'Loading focus areas…'
              )
            : null}
        </>
      ) : (
        <>
          {renderPrimaryActions()}
          {belowFoldReady
            ? renderWeakTopicsBlock('practice')
            : hadRawWeakTopics
            ? renderDeferredSectionPlaceholder(
                PRACTICE_WEAK_SECTION.title,
                PRACTICE_WEAK_SECTION.subtitle,
                'Loading focus areas…'
              )
            : null}
        </>
      )}

      {deepDeferredReady
        ? weakTopicIds.length > 0
          ? renderRecommendations()
          : null
        : hadRawWeakTopics
        ? renderDeferredSectionPlaceholder('Study resources', null, 'Finding resources…')
        : null}

      {isMock && !viewingHistoricalAttempt ? (
        deepDeferredReady ? (
          <View style={styles.attemptsBlock}>
            <Text style={styles.sectionTitleMuted}>Attempt history</Text>
            <Text style={styles.sectionSubtitleShort}>
              Compare scores across timed attempts on this mock.
            </Text>
            {attemptsLoading ? (
              <View style={styles.attemptsLoadingWrap}>
                <InlineLoading size="small" />
              </View>
            ) : null}
            {attemptsError ? (
              <Text style={styles.attemptsError}>{attemptsError}</Text>
            ) : null}
            {!attemptsLoading && attempts.length > 0 ? (
              <>
                <View style={styles.attemptsSummaryRow}>
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>Attempts</Text>
                    <Text style={styles.summaryValue}>{String(attempts.length)}</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>Best</Text>
                    <Text style={styles.summaryValue}>{String(bestAttempt?.accuracy ?? 0)}%</Text>
                  </View>
                </View>
                <View style={styles.attemptList}>
                  {attempts
                    .slice()
                    .sort(
                      (a, b) => (Number(b?.attemptNumber) || 0) - (Number(a?.attemptNumber) || 0)
                    )
                    .slice(0, 3)
                    .map((a) => (
                      <View key={String(a?._id)} style={styles.attemptRow}>
                        <View style={styles.attemptLeft}>
                          <Text style={styles.attemptTitle}>
                            Attempt {String(a?.attemptNumber ?? '—')}
                          </Text>
                          <Text style={styles.attemptSub}>
                            {String(a?.accuracy ?? 0)}% • {formatAttemptTime(a?.timeTaken)}
                          </Text>
                        </View>
                        <Text style={styles.attemptPct}>{String(a?.accuracy ?? 0)}%</Text>
                      </View>
                    ))}
                </View>
              </>
            ) : !attemptsLoading ? (
              <Text style={styles.attemptsEmpty}>First attempt — your baseline starts here.</Text>
            ) : null}
          </View>
        ) : (
          renderDeferredSectionPlaceholder(
            'Attempt history',
            'Compare scores across timed attempts on this mock.',
            'Loading attempt history…'
          )
        )
      ) : null}
    </View>
  );

  const renderRecommendations = () => {
    const hasNotes = recommendedNotes.length > 0;
    const hasPdfs = recommendedPdfs.length > 0;

    if (
      (isPracticeSession || isMock) &&
      !recLoading &&
      !recError &&
      !hasNotes &&
      !hasPdfs
    ) {
      return null;
    }

    return (
      <View style={styles.recSection}>
        <Text style={styles.sectionTitle}>Study resources</Text>
        <View style={styles.sectionCardCompact}>
          {recLoading ? (
            <LoadingState compact size="small" label="Finding resources…" />
          ) : recError ? (
            <Text style={styles.err}>{recError}</Text>
          ) : !hasNotes && !hasPdfs ? (
            <Text style={styles.recMutedCompact}>
              No matching notes or PDFs yet.
            </Text>
          ) : (
            <>
              {hasNotes ? (
                <View style={styles.recBlock}>
                  <Text style={styles.recBlockTitle}>Notes</Text>
                  {recommendedNotes.map((note) => {
                    const id = String(note?._id ?? '');
                    const preview = previewOf(note?.content, 80);
                    return (
                      <Pressable
                        key={id || note?.title}
                        onPress={() => handleOpenNote(note)}
                        style={({ pressed }) => [
                          styles.recRow,
                          pressFeedbackStyle(pressed),
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
                  <Text style={styles.recBlockTitle}>PDF Notes</Text>
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
                          pressFeedbackStyle(pressed),
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

  const renderFooter = () => (
    <View style={styles.footer}>
      <Pressable
        onPress={navigateBackFromResult}
        style={({ pressed }) => [styles.secondaryBtn, pressFeedbackStyle(pressed)]}
      >
        <Text style={styles.secondaryBtnText}>
          {resolveResultBackTarget(params).label}
        </Text>
      </Pressable>
    </View>
  );

  const mustHydrateFromServer = needsServerHydration;

  if (mustHydrateFromServer) {
    if (histLoading) {
      return (
        <View style={styles.histGate}>
          <LoadingState compact />
        </View>
      );
    }
    if (histError || !historicalExtras) {
      const msg = resolveHistoricalHydrationErrorMessage(histError, {
        outcome: lastHydrationOutcomeRef.current,
      });
      return (
        <View style={styles.histGate}>
          <ErrorState
            compact
            title={ERROR_TITLES.open}
            message={msg}
            context="results"
            onRetry={resetHistoricalHydrationForRetry}
            retrying={histLoading}
          />
        </View>
      );
    }
  }

  if (!hasParams) {
    return (
      <EmptyState {...EMPTY.RESULT_MISSING} />
    );
  }

  const resultScreenKey = `result-${resultIdentityKey}`;

  return (
    <ScrollView
      key={resultScreenKey}
      style={styles.container}
      contentContainerStyle={[styles.content, bottomInsets.scrollContentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {renderHeader()}
      {renderFooter()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 18, paddingBottom: 24 },

  heroCard: {
    backgroundColor: CARD_BG,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    marginBottom: 16,
    ...resultShadows.hero,
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: resultPalette.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.95,
  },
  sessionHint: { fontSize: 19, color: TEXT, marginTop: 8, lineHeight: 26, fontWeight: '700' },
  heroAccuracyMain: {
    fontSize: 46,
    fontWeight: '800',
    marginTop: 18,
    lineHeight: 52,
    color: PRIMARY,
    letterSpacing: -1,
  },
  heroCorrectLine: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginTop: 8,
    lineHeight: 25,
  },
  heroMeta: { fontSize: 13, color: MUTED, marginTop: 8, fontWeight: '600' },
  heroMessage: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    lineHeight: 20,
  },
  insightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  insightChip: {
    backgroundColor: CARD_BG_ALT,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  insightChipUp: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  insightChipFocus: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  insightChipText: { fontSize: 12, fontWeight: '600', color: TEXT },

  statsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 16,
    paddingHorizontal: 10,
    marginBottom: 22,
    ...resultShadows.card,
  },
  statsCompactPractice: {
    paddingVertical: 14,
    marginBottom: 18,
  },
  statsCompactMock: {
    paddingVertical: 14,
    marginBottom: 18,
  },
  statsCompactRetry: {
    paddingVertical: 14,
    marginBottom: 18,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statCellValue: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  statCellLabel: {
    fontSize: 10,
    color: resultPalette.textLight,
    marginTop: 5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  statDivider: { width: 1, height: 34, backgroundColor: BORDER },
  statPositive: { color: colors.success },
  statNegative: { color: resultPalette.amber },
  statMissedMock: { color: TEXT },

  actionsBlock: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 22,
    ...resultShadows.card,
  },
  actionsBlockPractice: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 18,
    marginTop: 4,
    ...resultShadows.card,
  },
  actionsBlockMock: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 18,
    marginTop: 4,
    ...resultShadows.card,
  },
  actionsBlockRetry: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 18,
    marginTop: 4,
    ...resultShadows.card,
  },
  actionsHintRetry: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    marginBottom: 14,
    marginTop: -2,
  },
  actionsHintPractice: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    marginBottom: 14,
    marginTop: -2,
  },
  actionsHintMock: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    marginBottom: 14,
    marginTop: -2,
  },
  actionsHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: resultPalette.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  retryEncourage: {
    fontSize: 14,
    color: TEXT,
    lineHeight: 21,
    marginBottom: 14,
    fontWeight: '600',
  },
  actionPrimary: {
    backgroundColor: PRIMARY,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PRIMARY_ALT,
  },
  actionPrimaryTitle: {
    color: resultPalette.white,
    fontSize: 16,
    fontWeight: '700',
  },
  actionPrimarySub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 5,
    lineHeight: 18,
  },
  actionSecondary: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  actionSecondaryTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  actionSecondarySub: { fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 18 },
  actionTertiary: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: CARD_BG_ALT,
  },
  actionTertiaryTitle: { fontSize: 14, fontWeight: '700', color: PRIMARY_ALT },
  actionTertiarySub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    lineHeight: 17,
    textAlign: 'center',
  },
  perfectCard: {
    backgroundColor: CARD_BG_ALT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
  },
  perfectTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  perfectSub: { fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 18 },
  perfectCardCompact: {
    backgroundColor: CARD_BG_ALT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },

  sectionHeader: { marginTop: 6, marginBottom: 12 },
  sectionHeaderCompact: { marginTop: 4, marginBottom: 10 },
  sectionSubtitle: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    marginTop: -2,
    marginBottom: 4,
  },
  sectionSubtitleShort: {
    fontSize: 12,
    color: resultPalette.textLight,
    lineHeight: 18,
    marginTop: 2,
  },
  sectionTitleMuted: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    marginTop: 6,
    marginBottom: 6,
  },

  recoveredBanner: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: resultPalette.amber,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  recoveredBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },

  unavailableBanner: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: resultPalette.amber,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
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

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
    marginTop: 4,
    marginBottom: 6,
  },
  deferredSectionBlock: {
    marginBottom: 14,
  },

  attemptsBlock: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginTop: 10,
    marginBottom: 12,
    ...resultShadows.card,
  },
  attemptsLoadingWrap: { marginLeft: 8 },
  attemptsMeta: { fontSize: 12, color: MUTED, fontWeight: '600' },
  attemptsError: { color: colors.danger, fontSize: 13, marginTop: 6, fontWeight: '600' },
  attemptsEmpty: { color: MUTED, fontSize: 13, marginTop: 6 },
  attemptsSummaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  summaryPill: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: CARD_BG_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: { fontSize: 16, fontWeight: '800', color: TEXT, marginTop: 6 },
  attemptList: { gap: 8, marginTop: 10 },
  attemptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: CARD_BG_ALT,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 24,
    ...resultShadows.card,
  },
  sectionCardCompact: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
    ...resultShadows.card,
  },

  retryBlock: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 14,
    marginBottom: 18,
  },
  retryMetricsRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  retryMetric: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  retryMetricValue: { fontSize: 20, fontWeight: '800', color: TEXT },
  retryMetricLabel: { fontSize: 11, color: MUTED, marginTop: 4, fontWeight: '600' },

  weakSeparator: { height: 1, backgroundColor: BORDER, marginVertical: 6 },
  weakTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  weakTopicTextBlock: { flex: 1, marginRight: 8 },
  weakTopicName: { fontSize: 15, fontWeight: '600', color: TEXT },
  mistakeBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  mistakeBadgeText: { fontSize: 11, fontWeight: '600', color: colors.warning },

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
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  weakCtaText: { color: colors.primaryText, fontSize: 15, fontWeight: '700' },
  weakCtaSub: { color: colors.primary, fontSize: 12, marginTop: 3, opacity: 0.9 },
  weakCtaPrimary: {
    backgroundColor: PRIMARY,
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PRIMARY_ALT,
  },
  weakCtaPrimaryText: {
    color: resultPalette.white,
    fontSize: 16,
    fontWeight: '700',
  },
  weakCtaPrimarySub: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    marginTop: 4,
  },
  weakCtaMock: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  weakCtaMockText: {
    color: PRIMARY_ALT,
    fontSize: 15,
    fontWeight: '700',
  },
  weakCtaMockSub: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  showAllBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY_ALT,
  },

  // ---- Recommendations (notes + pdfs) ----
  recSection: { marginTop: 8, marginBottom: 12 },
  recMuted: {
    fontSize: 14,
    color: MUTED,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  recMutedCompact: {
    fontSize: 12,
    color: MUTED,
    paddingVertical: 8,
    textAlign: 'center',
  },
  recBlock: {},
  recBlockSpaced: { marginTop: 14 },
  recBlockTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: resultPalette.textLight,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: CARD_BG_ALT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  recRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  recRowMeta: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },

  err: { color: colors.danger, marginTop: 6, marginBottom: 10, fontWeight: '600' },

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

  footer: { marginTop: 8, paddingTop: 8 },

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

  btnDisabled: { opacity: 0.6 },
});
