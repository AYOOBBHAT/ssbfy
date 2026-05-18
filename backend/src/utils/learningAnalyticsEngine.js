import { LEARNING_SESSION_SNAPSHOT_VERSION } from '../constants/learningSessionTypes.js';

export const ANALYTICS_STATE_VERSION = 2;
const MAX_PROCESSED_IDS = 400;
const MAX_DAILY_BUCKETS = 90;
const MAX_TOPIC_SAMPLES = 8;
const RECENT_ACCURACY_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 100) return 100;
  return Math.round(v * 100) / 100;
}

function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function emptyState() {
  return {
    version: ANALYTICS_STATE_VERSION,
    processedSessionIds: [],
    practiceBreakdown: {
      topic: 0,
      smart: 0,
      weak: 0,
      daily: 0,
      retry: 0,
      practice: 0,
    },
    totals: {
      sessions: 0,
      questions: 0,
      correct: 0,
      accuracySum: 0,
    },
    topicStats: {},
    dailyBuckets: {},
    weakTopicEvents: [],
    retryStats: {
      sessions: 0,
      accuracySum: 0,
      improvementSum: 0,
      improvementCount: 0,
      topicsImproved: {},
    },
    sessionIndex: {},
    lastUpdatedAt: null,
  };
}

function normalizeTopicKey(topicId, topicName) {
  if (topicId != null && String(topicId).trim()) return String(topicId);
  if (topicName) return `label:${String(topicName).trim().toLowerCase()}`;
  return null;
}

/**
 * Canonical aggregation key — unifies renamed/merged topic lineages.
 * @param {string | null | undefined} topicId
 * @param {string | null | undefined} topicName
 * @param {string | null | undefined} snapshotCanonicalId
 * @param {import('../services/canonicalTopicResolver.js').CanonicalTopicResolver | null} [resolver]
 */
export function resolveAggregateTopicKey(topicId, topicName, snapshotCanonicalId, resolver) {
  if (snapshotCanonicalId) {
    return `canonical:${String(snapshotCanonicalId)}`;
  }
  if (resolver && topicId != null && String(topicId).trim()) {
    const cid = resolver.resolveCanonicalId(String(topicId));
    if (cid) return `canonical:${cid}`;
  }
  const legacy = normalizeTopicKey(topicId, topicName);
  return legacy ? `legacy:${legacy}` : null;
}

/**
 * Transparent mastery: weighted recent accuracy + retry bonus + practice frequency.
 * @param {{ recentAccuracies: number[], sessionCount: number, retryBonus: number }} t
 */
export function computeTopicMasteryScore(t) {
  const samples = Array.isArray(t.recentAccuracies) ? t.recentAccuracies : [];
  let weightedAcc = 0;
  let weightSum = 0;
  const recent = samples.slice(-MAX_TOPIC_SAMPLES);
  const offset = RECENT_ACCURACY_WEIGHTS.length - recent.length;
  for (let i = 0; i < recent.length; i += 1) {
    const w = RECENT_ACCURACY_WEIGHTS[offset + i] ?? 0.05;
    weightedAcc += pct(recent[i]) * w;
    weightSum += w;
  }
  const accuracyPart = weightSum > 0 ? weightedAcc / weightSum : 0;
  const freqBonus = Math.min((Number(t.sessionCount) || 0) * 3, 10);
  const retryBonus = Math.min(Math.max(0, Number(t.retryBonus) || 0), 15);
  const raw = accuracyPart * 0.75 + retryBonus + freqBonus;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function ensureTopic(state, key, topicName, canonicalTopicId = null) {
  if (!state.topicStats[key]) {
    const parsedCanonical =
      key.startsWith('canonical:') ? key.slice('canonical:'.length) : canonicalTopicId;
    state.topicStats[key] = {
      topicId: key.startsWith('legacy:')
        ? key.slice('legacy:'.length)
        : parsedCanonical || null,
      canonicalTopicId: parsedCanonical || null,
      topicName: topicName || '',
      sessionCount: 0,
      questionCount: 0,
      correctCount: 0,
      recentAccuracies: [],
      masteryScore: 0,
      retryBonus: 0,
      lastSeenAt: null,
      priorMastery: null,
      masteryAt14dAgo: null,
    };
  } else if (topicName && !state.topicStats[key].topicName) {
    state.topicStats[key].topicName = topicName;
  }
  return state.topicStats[key];
}

/**
 * @param {object} session — LearningSession lean doc
 * @returns {object | null} normalized session metrics
 */
export function extractSessionMetrics(session, resolver = null) {
  const snap = session?.snapshot;
  if (!snap || snap.version !== LEARNING_SESSION_SNAPSHOT_VERSION) return null;

  const summary = snap.summary && typeof snap.summary === 'object' ? snap.summary : {};
  const accuracy = pct(summary.accuracy);
  const totalQuestions = Number(summary.totalQuestions) || 0;
  const correct = Number(summary.correct) || 0;
  const sessionType = String(session.sessionType || snap.sessionType || 'practice').toLowerCase();
  const completedAt = session.completedAt || snap.completedAt || new Date();

  const perTopic = new Map();
  const rows = Array.isArray(snap.questions) ? snap.questions : [];
  for (const row of rows) {
    const key = resolveAggregateTopicKey(
      row.topicId,
      row.topicName,
      row.canonicalTopicId,
      resolver
    );
    if (!key) continue;
    const entry = perTopic.get(key) || {
      topicId: row.topicId,
      canonicalTopicId:
        row.canonicalTopicId ||
        (resolver && row.topicId ? resolver.resolveCanonicalId(String(row.topicId)) : null),
      topicName: row.topicName || '',
      questions: 0,
      correct: 0,
    };
    entry.questions += 1;
    if (row.isCorrect) entry.correct += 1;
    if (row.topicName) entry.topicName = row.topicName;
    perTopic.set(key, entry);
  }

  const weakTopics = (Array.isArray(snap.weakTopics) ? snap.weakTopics : []).map((w) => ({
    topicId: w.topicId,
    canonicalTopicId:
      w.canonicalTopicId ||
      (resolver && w.topicId ? resolver.resolveCanonicalId(String(w.topicId)) : null),
    topicName: w.topicName || '',
    mistakeCount: w.mistakeCount ?? 1,
  }));

  return {
    sessionId: String(session._id),
    sessionType,
    completedAt: new Date(completedAt),
    accuracy,
    totalQuestions,
    correct,
    perTopic,
    weakTopics,
    sourceAttemptId: snap.sourceAttemptId ? String(snap.sourceAttemptId) : null,
    sourceLearningSessionId: snap.sourceLearningSessionId
      ? String(snap.sourceLearningSessionId)
      : null,
  };
}

/**
 * Apply one immutable session to aggregate state (deterministic).
 * @param {object} state
 * @param {object} session — LearningSession doc
 */
export function applySessionToAggregate(state, session, resolver = null) {
  const metrics = extractSessionMetrics(session, resolver);
  if (!metrics) return state;

  const sid = metrics.sessionId;
  if (state.processedSessionIds.includes(sid)) return state;

  const next = {
    ...state,
    processedSessionIds: [...state.processedSessionIds, sid].slice(-MAX_PROCESSED_IDS),
    practiceBreakdown: { ...state.practiceBreakdown },
    totals: { ...state.totals },
    topicStats: { ...state.topicStats },
    dailyBuckets: { ...state.dailyBuckets },
    weakTopicEvents: [...state.weakTopicEvents],
    retryStats: { ...state.retryStats, topicsImproved: { ...state.retryStats.topicsImproved } },
    sessionIndex: { ...state.sessionIndex },
  };

  const typeKey = metrics.sessionType;
  if (Object.prototype.hasOwnProperty.call(next.practiceBreakdown, typeKey)) {
    next.practiceBreakdown[typeKey] += 1;
  } else {
    next.practiceBreakdown.practice += 1;
  }

  next.totals.sessions += 1;
  next.totals.questions += metrics.totalQuestions;
  next.totals.correct += metrics.correct;
  next.totals.accuracySum += metrics.accuracy;

  const dk = dayKey(metrics.completedAt);
  if (dk) {
    const bucket = next.dailyBuckets[dk] || { sessions: 0, questions: 0, correct: 0, accuracySum: 0 };
    bucket.sessions += 1;
    bucket.questions += metrics.totalQuestions;
    bucket.correct += metrics.correct;
    bucket.accuracySum += metrics.accuracy;
    next.dailyBuckets[dk] = bucket;
  }

  for (const [key, t] of metrics.perTopic) {
    const topic = ensureTopic(next, key, t.topicName, t.canonicalTopicId);
    topic.sessionCount += 1;
    topic.questionCount += t.questions;
    topic.correctCount += t.correct;
    const topicAcc = t.questions > 0 ? pct((t.correct / t.questions) * 100) : 0;
    topic.recentAccuracies = [...topic.recentAccuracies, topicAcc].slice(-MAX_TOPIC_SAMPLES);
    topic.lastSeenAt = metrics.completedAt.toISOString();
    topic.masteryScore = computeTopicMasteryScore(topic);
  }

  for (const w of metrics.weakTopics) {
    const key = resolveAggregateTopicKey(
      w.topicId,
      w.topicName,
      w.canonicalTopicId,
      resolver
    );
    if (!key) continue;
    next.weakTopicEvents.push({
      topicKey: key,
      canonicalTopicId: w.canonicalTopicId || null,
      topicName: w.topicName || '',
      mistakeCount: w.mistakeCount,
      at: metrics.completedAt.toISOString(),
      sessionId: sid,
    });
  }
  next.weakTopicEvents = next.weakTopicEvents.slice(-300);

  next.sessionIndex[sid] = {
    accuracy: metrics.accuracy,
    sessionType: metrics.sessionType,
    completedAt: metrics.completedAt.toISOString(),
    sourceAttemptId: metrics.sourceAttemptId,
    sourceLearningSessionId: metrics.sourceLearningSessionId,
  };

  if (metrics.sessionType === 'retry') {
    next.retryStats.sessions += 1;
    next.retryStats.accuracySum += metrics.accuracy;

    const sourceId =
      metrics.sourceLearningSessionId || metrics.sourceAttemptId || null;
    const source = sourceId ? next.sessionIndex[sourceId] : null;
    if (source && Number.isFinite(source.accuracy)) {
      const delta = metrics.accuracy - source.accuracy;
      next.retryStats.improvementSum += delta;
      next.retryStats.improvementCount += 1;
      for (const [key, t] of metrics.perTopic) {
        const topic = next.topicStats[key];
        if (!topic) continue;
        if (delta > 0) {
          topic.retryBonus = Math.min(20, (topic.retryBonus || 0) + Math.min(delta, 10));
          next.retryStats.topicsImproved[key] =
            (next.retryStats.topicsImproved[key] || 0) + 1;
        }
        topic.masteryScore = computeTopicMasteryScore(topic);
      }
    }
  }

  const bucketKeys = Object.keys(next.dailyBuckets).sort();
  if (bucketKeys.length > MAX_DAILY_BUCKETS) {
    const trimmed = {};
    for (const k of bucketKeys.slice(-MAX_DAILY_BUCKETS)) {
      trimmed[k] = next.dailyBuckets[k];
    }
    next.dailyBuckets = trimmed;
  }

  next.lastUpdatedAt = new Date().toISOString();
  return next;
}

export function createEmptyAnalyticsState() {
  return emptyState();
}

function sumBuckets(buckets, days) {
  const keys = Object.keys(buckets).sort().slice(-days);
  let sessions = 0;
  let questions = 0;
  let correct = 0;
  let accuracySum = 0;
  const daily = [];
  for (const k of keys) {
    const b = buckets[k];
    sessions += b.sessions;
    questions += b.questions;
    correct += b.correct;
    accuracySum += b.accuracySum;
    daily.push({
      date: k,
      sessions: b.sessions,
      accuracy: b.sessions > 0 ? pct(b.accuracySum / b.sessions) : 0,
    });
  }
  return {
    sessions,
    questions,
    correct,
    averageAccuracy: sessions > 0 ? pct(accuracySum / sessions) : 0,
    daily,
  };
}

function enrichTopicRow(row, resolver) {
  const canonicalId =
    row.canonicalTopicId ||
    (row.topicKey?.startsWith('canonical:') ? row.topicKey.slice('canonical:'.length) : null);
  const currentDisplayName =
    resolver && canonicalId ? resolver.getDisplayName(canonicalId) : '';
  const historicalLabel = row.topicName || 'Topic';
  return {
    ...row,
    canonicalTopicId: canonicalId,
    currentDisplayName: currentDisplayName || historicalLabel,
    ...(currentDisplayName &&
    historicalLabel &&
    currentDisplayName.toLowerCase() !== historicalLabel.toLowerCase()
      ? { previousLabel: historicalLabel }
      : {}),
  };
}

function buildTopicLists(topicStats, weakTopicEvents, resolver = null) {
  const entries = Object.entries(topicStats)
    .map(([key, t]) => ({
      topicKey: key,
      topicId: t.topicId,
      canonicalTopicId: t.canonicalTopicId || (key.startsWith('canonical:') ? key.slice(10) : null),
      topicName: t.topicName || 'Topic',
      masteryScore: t.masteryScore,
      accuracy:
        t.questionCount > 0 ? pct((t.correctCount / t.questionCount) * 100) : 0,
      sessionCount: t.sessionCount,
      questionCount: t.questionCount,
    }))
    .filter((t) => t.questionCount >= 3);

  const strongest = [...entries].sort((a, b) => b.masteryScore - a.masteryScore).slice(0, 5);
  const weakest = [...entries]
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 5);

  const now = Date.now();
  const ms14 = 14 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;

  const weakRecent = weakTopicEvents.filter((e) => {
    const t = new Date(e.at).getTime();
    return !Number.isNaN(t) && now - t <= ms30;
  });

  const weakCountByKey = new Map();
  for (const e of weakRecent) {
    weakCountByKey.set(e.topicKey, (weakCountByKey.get(e.topicKey) || 0) + 1);
  }

  const recurring = [];
  const improving = [];
  const resolved = [];

  for (const [key, count] of weakCountByKey) {
    if (count >= 2) {
      const t = topicStats[key];
      recurring.push({
        topicId: t?.topicId ?? null,
        topicName: t?.topicName || 'Topic',
        sessions: count,
      });
    }
  }

  for (const e of entries) {
    const recentWeak = weakRecent.some(
      (w) => w.topicKey === e.topicKey && now - new Date(w.at).getTime() <= ms14
    );
    const olderWeak = weakRecent.some(
      (w) =>
        w.topicKey === e.topicKey &&
        now - new Date(w.at).getTime() > ms14 &&
        now - new Date(w.at).getTime() <= ms30
    );
    if (olderWeak && !recentWeak && e.masteryScore >= 65) {
      resolved.push({
        topicId: e.topicId,
        topicName: e.topicName,
        masteryScore: e.masteryScore,
        message: `Improved in ${e.topicName}`,
      });
    }
    if (recentWeak && e.masteryScore >= 55) {
      const t = topicStats[e.topicKey];
      const samples = t?.recentAccuracies || [];
      if (samples.length >= 2) {
        const latest = samples[samples.length - 1];
        const prior = samples[Math.max(0, samples.length - 3)];
        if (latest - prior >= 8) {
          improving.push({
            topicId: e.topicId,
            topicName: e.topicName,
            delta: Math.round(latest - prior),
            message: `You improved in ${e.topicName}`,
          });
        }
      }
    }
  }

  return {
    strongestTopics: strongest.map((t) =>
      enrichTopicRow(
        {
          topicKey: t.topicKey,
          topicId: t.topicId,
          canonicalTopicId: t.canonicalTopicId,
          topicName: t.topicName,
          masteryScore: t.masteryScore,
          accuracy: t.accuracy,
        },
        resolver
      )
    ),
    weakestTopics: weakest.map((t) =>
      enrichTopicRow(
        {
          topicKey: t.topicKey,
          topicId: t.topicId,
          canonicalTopicId: t.canonicalTopicId,
          topicName: t.topicName,
          masteryScore: t.masteryScore,
          accuracy: t.accuracy,
        },
        resolver
      )
    ),
    weakTopicEvolution: {
      recurring: recurring.slice(0, 5),
      improving: improving.slice(0, 5),
      resolved: resolved.slice(0, 5),
    },
  };
}

/**
 * @param {object} state — aggregate state
 * @param {{ streakDays: number, mockSessions: number }} extras
 */
export function buildOverviewFromState(state, extras = {}, resolver = null) {
  const totals = state.totals || {};
  const sessions = Number(totals.sessions) || 0;
  const averageAccuracy =
    sessions > 0 ? pct((Number(totals.accuracySum) || 0) / sessions) : 0;

  const topicLists = buildTopicLists(
    state.topicStats || {},
    state.weakTopicEvents || [],
    resolver
  );

  const retry = state.retryStats || {};
  const retrySessions = Number(retry.sessions) || 0;
  const avgRetryAccuracy =
    retrySessions > 0 ? pct((Number(retry.accuracySum) || 0) / retrySessions) : 0;
  const avgImprovement =
    (Number(retry.improvementCount) || 0) > 0
      ? pct((Number(retry.improvementSum) || 0) / retry.improvementCount)
      : 0;

  const topicsImprovedAfterRetry = Object.entries(retry.topicsImproved || {})
    .map(([key, count]) => {
      const t = state.topicStats[key];
      return {
        topicId: t?.topicId ?? null,
        topicName: t?.topicName || 'Topic',
        retryCount: count,
      };
    })
    .sort((a, b) => b.retryCount - a.retryCount)
    .slice(0, 5);

  return {
    streakDays: Math.max(0, Number(extras.streakDays) || 0),
    totalSessions: sessions + (Number(extras.mockSessions) || 0),
    totalQuestions: Number(totals.questions) || 0,
    averageAccuracy,
    ...topicLists,
    recentTrend: {
      last7Days: sumBuckets(state.dailyBuckets || {}, 7),
      last30Days: sumBuckets(state.dailyBuckets || {}, 30),
    },
    practiceBreakdown: {
      mock: Number(extras.mockSessions) || 0,
      topic: state.practiceBreakdown?.topic || 0,
      smart: state.practiceBreakdown?.smart || 0,
      weak: state.practiceBreakdown?.weak || 0,
      retry: state.practiceBreakdown?.retry || 0,
      daily: state.practiceBreakdown?.daily || 0,
      practice: state.practiceBreakdown?.practice || 0,
    },
    retryEffectiveness: {
      retrySessions,
      avgRetryAccuracy,
      avgImprovementDelta: avgImprovement,
      topicsImprovedAfterRetry,
    },
    generatedAt: state.lastUpdatedAt || new Date().toISOString(),
    hasPracticeData: sessions > 0,
  };
}

export function foldSessionsIntoState(sessions, resolver = null) {
  let state = createEmptyAnalyticsState();
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );
  for (const s of ordered) {
    state = applySessionToAggregate(state, s, resolver);
  }
  return state;
}
