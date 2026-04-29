import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';

/**
 * Clamp + round a 0–100 accuracy/percent value into a presentable integer.
 * NaN / undefined / negative collapse to 0.
 */
function pctInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 100) return 100;
  return Math.round(v);
}

/**
 * Returns the analytics payload for the profile screen.
 *
 * Source-of-truth contract:
 *   - Mock metrics come from `TestAttempt` documents with `endTime != null`.
 *     Every completed attempt counts (retries are first-class).
 *   - `currentStreak` and `dailyPracticeCount` come straight from the User
 *     document; no second streak system is introduced.
 *   - `smartPracticeCount` is always 0 today: smart practice is a question
 *     fetch, not a "completion" event, and there is no completion log to
 *     count. Returning an honest 0 (instead of inventing a number) lets the
 *     mobile UI hide the card cleanly.
 *
 * Returns safe zeros for users with no attempts (CASE A — empty state).
 */
export const profileAnalyticsService = {
  async getForUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const [agg, latest] = await Promise.all([
      testAttemptRepository.aggregateProfileStats(userId),
      testAttemptRepository.findLatestCompletedByUser(userId),
    ]);

    const totalMocks = Number(agg?.totalMocks) || 0;
    const totalQuestionsSolved = Number(agg?.totalQuestionsSolved) || 0;

    const bestScore = pctInt(agg?.bestScore);
    const averageScore = pctInt(agg?.averageAccuracy);
    const overallAccuracy =
      totalQuestionsSolved > 0
        ? pctInt(Number(agg?.sumAccuracyXCount) / totalQuestionsSolved)
        : 0;
    const latestScore = pctInt(latest?.accuracy);

    return {
      totalMocks,
      bestScore,
      latestScore,
      averageScore,
      overallAccuracy,
      totalQuestionsSolved,
      currentStreak: Math.max(0, Number(user.streakCount) || 0),
      dailyPracticeCount: Math.max(0, Number(user.dailyPracticeTotal) || 0),
      smartPracticeCount: 0,
    };
  },
};
