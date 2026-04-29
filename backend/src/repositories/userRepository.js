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
      {
        $set: { streakCount, lastPracticeDate },
        $inc: { dailyPracticeTotal: 1 },
      },
      { new: true }
    )
      .lean()
      .exec();
  },

  /**
   * Writes the subscription state granted by a successful payment.
   *
   * Truth model:
   * - Lifetime plan  → `isPremium: true`, `subscriptionEnd: null` (caller passes null).
   * - Timed plan     → `isPremium: false`, `subscriptionEnd: <future date>`.
   *
   * The `isPremium` flag is no longer the access gate — `isPremiumUser` is —
   * but we keep the flag set ONLY for lifetime so legacy queries that look
   * for "permanent premium users" stay accurate.
   *
   * Defensive: a non-lifetime write will NOT overwrite an existing lifetime
   * user (currentPlanType=lifetime OR isPremium=true with no subscriptionEnd).
   * In that case the user is returned unchanged. This protects lifetime
   * holders from being demoted by any unexpected downstream call.
   */
  async setSubscriptionAfterPayment(
    userId,
    { subscriptionEnd, plan, currentPlanId = null, currentPlanType = null }
  ) {
    const isLifetime = currentPlanType === 'lifetime';

    const $set = {
      isPremium: isLifetime,
      subscriptionEnd,
      plan,
      currentPlanId,
      currentPlanType,
    };

    if (isLifetime) {
      return User.findByIdAndUpdate(userId, { $set }, { new: true }).lean().exec();
    }

    const filter = {
      _id: userId,
      $nor: [
        { currentPlanType: 'lifetime' },
        { isPremium: true, subscriptionEnd: null },
      ],
    };

    const updated = await User.findOneAndUpdate(filter, { $set }, { new: true }).lean().exec();
    if (updated) return updated;

    return User.findById(userId).lean().exec();
  },
};
