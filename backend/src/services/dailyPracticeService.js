import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { questionRepository } from '../repositories/questionRepository.js';
import { userRepository } from '../repositories/userRepository.js';

const DAILY_PRACTICE_LIMIT = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC for the given date. */
function startOfUtcDay(date) {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const dailyPracticeService = {
  async getDailyPractice() {
    const questions = await questionRepository.findRandomActive(DAILY_PRACTICE_LIMIT);
    return { questions };
  },

  /**
   * Mark today's daily practice as completed and update streak.
   *
   * Idempotency model:
   *   - Read user state to compute the *intended* nextStreak.
   *   - Hand the actual claim to the DB via `claimDailyPracticeForToday`,
   *     whose filter only matches when today has not yet been claimed
   *     (`lastPracticeDate` is null OR strictly before today's UTC midnight).
   *   - Exactly one concurrent request can pass that filter on a given UTC
   *     day; every other call gets `null` back and is treated as
   *     `alreadyCompletedToday` with NO increment.
   *
   * This guarantees `dailyPracticeTotal` is incremented EXACTLY ONCE per
   * user per UTC day, even under double-submit, retry, or true concurrent
   * races where both requests read pre-write state.
   */
  async completeDailyPractice(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const todayMs = startOfUtcDay(new Date());
    const todayUtcMidnight = new Date(todayMs);
    const lastDate = user.lastPracticeDate;
    const currentStreak = Number(user.streakCount) || 0;

    // App-side fast-path: if our local read already shows today claimed,
    // skip the DB round-trip entirely. Concurrency safety is NOT relying
    // on this branch — the DB filter below is the real guard.
    if (lastDate) {
      const lastMs = startOfUtcDay(lastDate);
      const diffDays = Math.round((todayMs - lastMs) / MS_PER_DAY);
      if (diffDays <= 0) {
        return {
          streakCount: currentStreak,
          lastPracticeDate: lastDate,
          alreadyCompletedToday: true,
        };
      }
    }

    let nextStreak;
    if (!lastDate) {
      nextStreak = 1;
    } else {
      const lastMs = startOfUtcDay(lastDate);
      const diffDays = Math.round((todayMs - lastMs) / MS_PER_DAY);
      nextStreak = diffDays === 1 ? currentStreak + 1 : 1;
    }

    const updated = await userRepository.claimDailyPracticeForToday(userId, {
      todayUtcMidnight,
      nextStreak,
    });

    if (!updated) {
      // Another concurrent request claimed today's slot first. Re-read so
      // we return the canonical post-write state and an honest
      // `alreadyCompletedToday: true`. Crucially, we did NOT increment.
      const fresh = await userRepository.findById(userId);
      console.log('[STREAK] claim lost (already completed today)', {
        userId: String(userId),
        streakCount: fresh?.streakCount ?? currentStreak,
        lastPracticeDate: fresh?.lastPracticeDate ?? lastDate,
      });
      return {
        streakCount: Number(fresh?.streakCount) || currentStreak,
        lastPracticeDate: fresh?.lastPracticeDate ?? lastDate,
        alreadyCompletedToday: true,
      };
    }

    console.log('[STREAK] updated', {
      userId,
      streakCount: updated.streakCount,
      lastPracticeDate: updated.lastPracticeDate,
    });

    return {
      streakCount: updated.streakCount,
      lastPracticeDate: updated.lastPracticeDate,
      alreadyCompletedToday: false,
    };
  },
};
