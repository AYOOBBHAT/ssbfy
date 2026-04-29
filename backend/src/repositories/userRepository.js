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

  /**
   * User doc with password + reset OTP fields (for verify / reset only).
   */
  async findByEmailForPasswordReset(email) {
    return User.findOne({ email: email.toLowerCase() })
      .select('+password +passwordResetOtpHash')
      .exec();
  },

  async findById(id) {
    return User.findById(id).lean().exec();
  },

  async findByIdWithPassword(id) {
    return User.findById(id).select('+password').exec();
  },

  async updatePassword(userId, hashedPassword) {
    return User.updateOne({ _id: userId }, { $set: { password: hashedPassword } }).exec();
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

  /**
   * Unconditional +1 on freeAttemptsUsed (analytics). Used when a device
   * slot is consumed for a new mock test — device collection enforces the
   * cap; user field is no longer the gate.
   */
  async incrementFreeAttemptsUsed(userId) {
    return User.updateOne({ _id: userId }, { $inc: { freeAttemptsUsed: 1 } }).exec();
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

  async setSubscriptionAfterPayment(
    userId,
    { subscriptionEnd, plan, currentPlanId = null, currentPlanType = null }
  ) {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isPremium: true,
          subscriptionEnd,
          plan,
          currentPlanId,
          currentPlanType,
        },
      },
      { new: true }
    )
      .lean()
      .exec();
  },
};
