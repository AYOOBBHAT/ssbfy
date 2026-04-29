import { TestAttempt } from '../models/TestAttempt.js';

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
        },
      },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
  },
};
