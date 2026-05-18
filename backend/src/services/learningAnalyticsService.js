import mongoose from 'mongoose';
import { userRepository } from '../repositories/userRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { learningSessionRepository } from '../repositories/learningSessionRepository.js';
import { userLearningAnalyticsRepository } from '../repositories/userLearningAnalyticsRepository.js';
import {
  ANALYTICS_STATE_VERSION,
  applySessionToAggregate,
  buildOverviewFromState,
  createEmptyAnalyticsState,
  foldSessionsIntoState,
} from '../utils/learningAnalyticsEngine.js';
import { getCanonicalTopicResolver } from './canonicalTopicResolver.js';

const REBUILD_SESSION_LIMIT = 500;

async function countCompletedMocks(userId) {
  const rows = await testAttemptRepository.aggregateProfileStats(userId);
  return Number(rows?.totalMocks) || 0;
}

export const learningAnalyticsService = {
  /**
   * Incremental update after a new LearningSession is persisted.
   */
  async applySession(userId, sessionDoc) {
    if (!sessionDoc?._id) return;

    const uid = new mongoose.Types.ObjectId(String(userId));
    const existing = await userLearningAnalyticsRepository.findByUserId(uid);
    const baseState =
      existing?.state && typeof existing.state === 'object'
        ? existing.state
        : createEmptyAnalyticsState();

    const resolver = await getCanonicalTopicResolver();
    const nextState = applySessionToAggregate(baseState, sessionDoc, resolver);
    await userLearningAnalyticsRepository.upsertState(uid, nextState);
  },

  /**
   * Full rebuild from immutable snapshots (bounded).
   */
  async rebuildForUser(userId) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    const sessions = await learningSessionRepository.listForAnalyticsRebuild(uid, {
      limit: REBUILD_SESSION_LIMIT,
    });
    const resolver = await getCanonicalTopicResolver();
    const state = foldSessionsIntoState(sessions, resolver);
    await userLearningAnalyticsRepository.upsertState(uid, state);
    return state;
  },

  /**
   * GET /analytics/overview — lightweight, cache-friendly.
   */
  async getOverview(userId) {
    const user = await userRepository.findById(userId);
    const streakDays = Math.max(0, Number(user?.streakCount) || 0);
    const mockSessions = await countCompletedMocks(userId);

    const uid = new mongoose.Types.ObjectId(String(userId));
    let doc = await userLearningAnalyticsRepository.findByUserId(uid);

    const sessionCount = await learningSessionRepository.countByUser(uid);
    const aggregated = Number(doc?.state?.totals?.sessions) || 0;

    const stateVersion = Number(doc?.state?.version) || 0;
    const needsVersionRebuild = doc?.state && stateVersion < ANALYTICS_STATE_VERSION;

    if ((sessionCount > 0 && !doc?.state) || needsVersionRebuild) {
      const state = await this.rebuildForUser(userId);
      doc = { state };
    } else if (sessionCount > aggregated) {
      const latest = await learningSessionRepository.findLatestByUser(uid);
      const latestId = latest?._id ? String(latest._id) : null;
      const processed = doc?.state?.processedSessionIds || [];
      if (latestId && !processed.includes(latestId)) {
        try {
          const resolver = await getCanonicalTopicResolver();
          const baseState =
            doc?.state && typeof doc.state === 'object'
              ? doc.state
              : createEmptyAnalyticsState();
          const nextState = applySessionToAggregate(baseState, latest, resolver);
          await userLearningAnalyticsRepository.upsertState(uid, nextState);
          doc = await userLearningAnalyticsRepository.findByUserId(uid);
        } catch {
          const state = await this.rebuildForUser(userId);
          doc = { state };
        }
      } else if (sessionCount - aggregated > 2) {
        const state = await this.rebuildForUser(userId);
        doc = { state };
      }
    }

    const state =
      doc?.state && typeof doc.state === 'object' ? doc.state : createEmptyAnalyticsState();

    const resolver = await getCanonicalTopicResolver();
    const overview = buildOverviewFromState(state, { streakDays, mockSessions }, resolver);
    overview.practiceSessions = Number(state.totals?.sessions) || 0;
    overview.mockSessions = mockSessions;

    return overview;
  },
};
