import { TestAttempt } from '../models/TestAttempt.js';
import mongoose from 'mongoose';

export const testAttemptRepository = {
  async create(data) {
    const doc = await TestAttempt.create(data);
    return doc.toObject();
  },

  async findById(id) {
    return TestAttempt.findById(id).lean().exec();
  },

  async findInProgressByUserAndTest(userId, testId) {
    return TestAttempt.findOne({
      userId,
      testId,
      endTime: null,
    })
      .lean()
      .exec();
  },

  async findSubmittedByUserAndTest(userId, testId) {
    return TestAttempt.findOne({
      userId,
      testId,
      endTime: { $ne: null },
    })
      .lean()
      .exec();
  },

  async countCompletedByUserAndTest(userId, testId) {
    return TestAttempt.countDocuments({
      userId,
      testId,
      endTime: { $ne: null },
    }).exec();
  },

  async getMaxAttemptNumber(userId, testId) {
    const row = await TestAttempt.findOne(
      { userId, testId, attemptNumber: { $type: 'number' } },
      { attemptNumber: 1 }
    )
      .sort({ attemptNumber: -1 })
      .lean()
      .exec();
    return row?.attemptNumber ?? null;
  },

  /**
   * Next attempt number for a brand-new attempt.
   * Uses max(existing attemptNumber) and falls back to count(completed) so
   * legacy null docs still produce stable numbering.
   */
  async getNextAttemptNumber(userId, testId) {
    const [maxN, completedCount] = await Promise.all([
      this.getMaxAttemptNumber(userId, testId),
      this.countCompletedByUserAndTest(userId, testId),
    ]);
    const base = Math.max(Number(maxN) || 0, Number(completedCount) || 0);
    return base + 1;
  },

  async listSubmittedByUserAndTest(userId, testId) {
    return TestAttempt.find({
      userId,
      testId,
      endTime: { $ne: null },
    })
      .sort({ endTime: -1, createdAt: -1 })
      .lean()
      .exec();
  },

  async listInProgressByUser(userId) {
    return TestAttempt.find({ userId, endTime: null })
      .select('testId startTime createdAt')
      .lean()
      .exec();
  },

  async listCompletedByUser(userId) {
    return TestAttempt.find({ userId, endTime: { $ne: null } })
      .select('testId endTime createdAt')
      .lean()
      .exec();
  },

  async distinctOpenTestIdsByUser(userId) {
    return TestAttempt.distinct('testId', { userId, endTime: null }).exec();
  },

  async distinctCompletedTestIdsByUser(userId) {
    return TestAttempt.distinct('testId', { userId, endTime: { $ne: null } }).exec();
  },

  /**
   * One-pass status aggregation for all tests attempted by a user.
   * Returns rows shaped like:
   *   { testId: ObjectId, hasOpenAttempt: boolean, hasCompletedAttempt: boolean }
   */
  async getStatusFlagsByUser(userId) {
    const normalizedUserId = new mongoose.Types.ObjectId(String(userId));
    return TestAttempt.aggregate([
      { $match: { userId: normalizedUserId } },
      {
        $group: {
          _id: '$testId',
          hasOpenAttempt: {
            $max: {
              $cond: [{ $eq: ['$endTime', null] }, 1, 0],
            },
          },
          hasCompletedAttempt: {
            $max: {
              $cond: [{ $ne: ['$endTime', null] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          testId: '$_id',
          hasOpenAttempt: { $eq: ['$hasOpenAttempt', 1] },
          hasCompletedAttempt: { $eq: ['$hasCompletedAttempt', 1] },
        },
      },
    ]).exec();
  },

  /**
   * Removes an in-progress attempt when free-tier enforcement fails after
   * the attempt row was created (device slot could not be consumed).
   */
  async deleteOpenAttemptByIdForUser(attemptId, userId) {
    return TestAttempt.deleteOne({
      _id: attemptId,
      userId,
      endTime: null,
    }).exec();
  },

  /**
   * Single-pass aggregation for the profile analytics endpoint.
   *
   * Counts EVERY completed attempt (retries included) — never collapses by
   * testId. `accuracy` is already a 0–100 percentage at write time, so we
   * read it as-is and let the caller round.
   *
   * Returns:
   *   {
   *     totalMocks,             // # completed attempts
   *     bestScore,              // max(accuracy)
   *     averageAccuracy,        // mean(accuracy) — simple average
   *     sumAccuracyXCount,      // sum(accuracy * questionCount)  → for weighted overall
   *     totalQuestionsSolved,   // sum(questionCount)
   *   }
   * If the user has no completed attempts, returns null.
   */
  async aggregateProfileStats(userId) {
    const normalizedUserId = new mongoose.Types.ObjectId(String(userId));
    const rows = await TestAttempt.aggregate([
      { $match: { userId: normalizedUserId, endTime: { $ne: null } } },
      {
        $project: {
          accuracy: { $ifNull: ['$accuracy', 0] },
          questionCount: { $size: { $ifNull: ['$questionIds', []] } },
        },
      },
      {
        $group: {
          _id: null,
          totalMocks: { $sum: 1 },
          bestScore: { $max: '$accuracy' },
          averageAccuracy: { $avg: '$accuracy' },
          sumAccuracyXCount: { $sum: { $multiply: ['$accuracy', '$questionCount'] } },
          totalQuestionsSolved: { $sum: '$questionCount' },
        },
      },
      { $project: { _id: 0 } },
    ]).exec();
    return rows[0] || null;
  },

  /**
   * Latest completed attempt's accuracy. Used for `latestScore` on profile
   * analytics. Sorted by endTime DESC (createdAt as tiebreaker) so retries
   * are reflected.
   */
  async findLatestCompletedByUser(userId) {
    return TestAttempt.findOne({ userId, endTime: { $ne: null } })
      .select('accuracy endTime createdAt')
      .sort({ endTime: -1, createdAt: -1 })
      .lean()
      .exec();
  },

  /**
   * Recent completed attempts for profile UI.
   * Includes retries; sorted by endTime DESC (createdAt as tiebreaker).
   */
  async findRecentCompletedByUser(userId, limit = 5) {
    const lim = Math.min(Math.max(Number(limit) || 5, 1), 20);
    return TestAttempt.find({ userId, endTime: { $ne: null } })
      .select('testId attemptNumber accuracy score timeTaken endTime createdAt')
      .sort({ endTime: -1, createdAt: -1 })
      .limit(lim)
      .populate({ path: 'testId', select: 'title duration type' })
      .lean()
      .exec();
  },

  async finalizeAttempt(attemptId, userId, testId, payload) {
    return TestAttempt.findOneAndUpdate(
      {
        _id: attemptId,
        userId,
        testId,
        endTime: null,
      },
      {
        $set: {
          answers: payload.answers,
          endTime: payload.endTime,
          score: payload.score,
          accuracy: payload.accuracy,
          timeTaken: payload.timeTaken,
          ...(payload.resultSnapshot != null ? { resultSnapshot: payload.resultSnapshot } : {}),
        },
      },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },

  /**
   * Merge partial answers into an open attempt. Each normalized answer must
   * reference a questionId on the attempt snapshot. Missing questions stay as
   * empty selections until submit.
   */
  async mergeAnswersIntoOpenAttempt(userId, testId, normalizedAnswers) {
    const attempt = await this.findInProgressByUserAndTest(userId, testId);
    if (!attempt || attempt.endTime != null) return null;

    const allowed = new Set(attempt.questionIds.map((id) => id.toString()));
    const byQ = new Map();
    for (const a of attempt.answers || []) {
      byQ.set(a.questionId.toString(), a);
    }
    for (const a of normalizedAnswers) {
      const sid = a.questionId.toString();
      if (!allowed.has(sid)) {
        continue;
      }
      byQ.set(sid, a);
    }

    const merged = attempt.questionIds.map((qid) => {
      const key = qid.toString();
      return (
        byQ.get(key) ?? {
          questionId: qid,
          selectedOptionIndexes: [],
          selectedOptionIndex: null,
        }
      );
    });

    return TestAttempt.findOneAndUpdate(
      { _id: attempt._id, userId, testId, endTime: null },
      { $set: { answers: merged } },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },
};
