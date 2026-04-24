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
