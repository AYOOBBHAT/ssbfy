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
   * Idempotent within a UTC day — extra calls return the unchanged user.
   */
  async completeDailyPractice(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const todayMs = startOfUtcDay(new Date());
    const lastDate = user.lastPracticeDate;
    const currentStreak = Number(user.streakCount) || 0;

    let nextStreak;
    if (!lastDate) {
      nextStreak = 1;
    } else {
      const lastMs = startOfUtcDay(lastDate);
      const diffDays = Math.round((todayMs - lastMs) / MS_PER_DAY);
      if (diffDays <= 0) {
        return {
          streakCount: currentStreak,
          lastPracticeDate: lastDate,
          alreadyCompletedToday: true,
        };
      }
      if (diffDays === 1) {
        nextStreak = currentStreak + 1;
      } else {
        nextStreak = 1;
      }
    }

    const updated = await userRepository.setStreak(userId, {
      streakCount: nextStreak,
      lastPracticeDate: new Date(todayMs),
    });

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
