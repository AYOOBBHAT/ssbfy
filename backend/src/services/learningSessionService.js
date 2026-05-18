import mongoose from 'mongoose';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { learningSessionRepository } from '../repositories/learningSessionRepository.js';
import {
  buildLearningSessionSnapshotV1,
  resolveLearningSessionResultView,
} from '../utils/learningSessionSnapshot.js';
import { assertSnapshotWithinSizeLimit } from '../utils/learningSessionSnapshotSize.js';
import { learningAnalyticsService } from './learningAnalyticsService.js';
export const learningSessionService = {
  /**
   * Persist immutable snapshot after reveal/scoring. Idempotent when clientSessionKey set.
   */
  async persistFromReveal(userId, revealPayload, context = {}) {
    const {
      sessionType,
      questionIds,
      questionsById,
      userAnswersByQid,
      correctAnswers,
      weakTopics,
      summary,
      retryMeta,
      sourceAttemptId,
      sourceTestAttemptId,
      topicNameById,
      subjectNameById,
      canonicalTopicIdByTopicId = new Map(),
      clientSessionKey,
    } = context;

    if (clientSessionKey) {
      const existing = await learningSessionRepository.findByUserAndClientKey(
        userId,
        clientSessionKey
      );
      if (existing) {
        return {
          learningSessionId: String(existing._id),
          reused: true,
        };
      }
    }

    const snapshot = buildLearningSessionSnapshotV1({
      sessionType,
      orderedQuestionIds: questionIds,
      questionsById,
      userAnswersByQid,
      correctAnswersPayload: correctAnswers,
      weakTopics,
      summary,
      retryMeta,
      sourceAttemptId,
      sourceTestAttemptId,
      topicNameById,
      subjectNameById,
      canonicalTopicIdByTopicId,
    });

    if (!Array.isArray(snapshot.questions) || snapshot.questions.length === 0) {
      throw new AppError('Session snapshot is empty', HTTP_STATUS.BAD_REQUEST, null, {
        code: 'SESSION_SNAPSHOT_EMPTY',
      });
    }

    try {
      assertSnapshotWithinSizeLimit(snapshot);
    } catch (e) {
      if (e?.code === 'SESSION_SNAPSHOT_TOO_LARGE') {
        throw new AppError(
          'This session is too large to store for historical review.',
          HTTP_STATUS.BAD_REQUEST,
          e,
          { code: 'SESSION_SNAPSHOT_TOO_LARGE' }
        );
      }
      throw e;
    }

    const created = await learningSessionRepository.create({
      userId: new mongoose.Types.ObjectId(String(userId)),
      sessionType: snapshot.sessionType,
      completedAt: snapshot.completedAt,
      clientSessionKey: clientSessionKey || null,
      summary: snapshot.summary,
      weakTopics: snapshot.weakTopics,
      snapshot,
    });

    try {
      await learningAnalyticsService.applySession(userId, created);
    } catch {
      // Analytics must not block session persistence.
    }

    return {
      learningSessionId: String(created._id),
      reused: false,
    };
  },

  /**
   * Historical Result payload — snapshot only, no live Question/Topic reconstruction.
   */
  async getResultViewBySessionId(userId, sessionIdRaw) {
    const sessionId = String(sessionIdRaw ?? '').trim();
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new AppError('Invalid session id', HTTP_STATUS.BAD_REQUEST);
    }

    const doc = await learningSessionRepository.findById(sessionId);
    if (!doc) {
      throw new AppError('Session not found', HTTP_STATUS.NOT_FOUND);
    }
    if (doc.userId.toString() !== String(userId)) {
      throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
    }

    const { payload, reason } = resolveLearningSessionResultView(doc);
    if (!payload) {
      const code =
        reason === 'unsupported'
          ? 'SESSION_SNAPSHOT_UNSUPPORTED'
          : 'SESSION_SNAPSHOT_INVALID';
      throw new AppError('Session snapshot is unavailable', HTTP_STATUS.BAD_REQUEST, null, {
        code,
        reason,
      });
    }

    return payload;
  },

  async listRecent(userId, { limit = 15 } = {}) {
    const rows = await learningSessionRepository.listRecentByUser(userId, { limit });
    return rows.map((r) => ({
      _id: r._id,
      sessionType: r.sessionType,
      completedAt: r.completedAt,
      score: r.summary?.score ?? 0,
      accuracy: r.summary?.accuracy ?? 0,
      totalQuestions: r.summary?.totalQuestions ?? 0,
    }));
  },
};
