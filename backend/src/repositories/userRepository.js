import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { FREE_TEST_ATTEMPTS } from '../constants/access.js';
import { ROLES } from '../constants/roles.js';

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

  async countByEmail(email) {
    return User.countDocuments({ email: email.toLowerCase() }).exec();
  },

  async findByGoogleSub(sub) {
    if (!sub) return null;
    return User.findOne({ 'authProviders.google.sub': sub }).exec();
  },

  /**
   * Link Google provider to an existing account without touching progress/subscription fields.
   */
  async linkGoogleProvider(userId, { sub, email }) {
    const now = new Date();
    return User.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          'authProviders.google.sub': sub,
          'authProviders.google.email': email.toLowerCase(),
          'authProviders.google.linkedAt': now,
          emailVerified: true,
        },
      },
      { new: true }
    ).exec();
  },

  /**
   * Update stored Google email when the provider reports a change (sub remains stable).
   */
  async updateGoogleProviderEmail(userId, { sub, email }) {
    return User.findOneAndUpdate(
      {
        _id: userId,
        'authProviders.google.sub': sub,
      },
      {
        $set: {
          'authProviders.google.email': email.toLowerCase(),
          emailVerified: true,
        },
      },
      { new: true }
    ).exec();
  },

  /**
   * Create a Google-only user. Does not reset or overwrite any legacy user data paths.
   */
  async createGoogleUser({ name, email, sub, picture = null }) {
    const now = new Date();
    return User.create({
      name: name?.trim() || email.split('@')[0] || 'SSBFY User',
      email: email.toLowerCase(),
      role: ROLES.USER,
      emailVerified: true,
      avatarUrl: picture || null,
      authProviders: {
        google: {
          sub,
          email: email.toLowerCase(),
          linkedAt: now,
        },
      },
    });
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

  /** Lightweight display names for battle history / social rows. */
  async findDisplayNamesByIds(ids) {
    if (!ids?.length) return [];
    const oids = [...new Set(ids.map(String))]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!oids.length) return [];
    return User.find({ _id: { $in: oids } })
      .select('name email')
      .lean()
      .exec();
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

  /**
   * Atomically claim today's daily-practice slot for a user.
   *
   * The "did anyone already complete today?" check lives INSIDE the DB
   * filter, not in app code. This collapses the read-then-write race that
   * could otherwise let two concurrent requests both pass an idempotency
   * check and both fire `$inc: { dailyPracticeTotal: 1 }`.
   *
   * Filter semantics:
   *   - `lastPracticeDate` is null (user has never completed), OR
   *   - `lastPracticeDate` is strictly before today's UTC midnight
   *     (last completion was on a previous UTC day).
   *
   * Only one update can match in a given UTC day. The winner gets the
   * updated doc back. Every concurrent loser gets `null`, which the
   * caller MUST treat as "already completed today" and re-read state.
   *
   * @param {string} userId
   * @param {{ todayUtcMidnight: Date, nextStreak: number }} args
   * @returns {Promise<object|null>} updated user lean doc, or null if
   *   the day was already claimed by another concurrent write.
   */
  async claimDailyPracticeForToday(userId, { todayUtcMidnight, nextStreak }) {
    return User.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { lastPracticeDate: null },
          { lastPracticeDate: { $lt: todayUtcMidnight } },
        ],
      },
      {
        $set: {
          streakCount: nextStreak,
          lastPracticeDate: todayUtcMidnight,
        },
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
