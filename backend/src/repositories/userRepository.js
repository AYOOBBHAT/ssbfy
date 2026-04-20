import { User } from '../models/User.js';
import { FREE_TEST_ATTEMPTS } from '../constants/access.js';

export const userRepository = {
  async create(data) {
    return User.create(data);
  },

  async findByEmail(email, { includePassword = false } = {}) {
    const q = User.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      q.select('+password');
    }
    return q.exec();
  },

  async findById(id) {
    return User.findById(id).lean().exec();
  },

  /**
   * Atomically increments freeAttemptsUsed by 1 iff current value is < FREE_TEST_ATTEMPTS.
   * Returns the updated user doc, or null if the increment could not be applied (limit reached).
   */
  async incrementFreeAttemptIfUnderLimit(userId) {
    return User.findOneAndUpdate(
      {
        _id: userId,
        freeAttemptsUsed: { $lt: FREE_TEST_ATTEMPTS },
      },
      { $inc: { freeAttemptsUsed: 1 } },
      { new: true }
    )
      .lean()
      .exec();
  },

  async findLeaderboard(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    return User.find({})
      .select('name streakCount')
      .sort({ streakCount: -1, _id: 1 })
      .limit(safeLimit)
      .lean()
      .exec();
  },

  async setStreak(userId, { streakCount, lastPracticeDate }) {
    return User.findByIdAndUpdate(
      userId,
      { $set: { streakCount, lastPracticeDate } },
      { new: true }
    )
      .lean()
      .exec();
  },

  async setSubscriptionAfterPayment(userId, subscriptionEnd, plan) {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isPremium: true,
          subscriptionEnd,
          plan,
        },
      },
      { new: true }
    )
      .lean()
      .exec();
  },
};
