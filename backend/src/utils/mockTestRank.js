import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from './AppError.js';

export const PERCENTILE_MIN_PARTICIPANTS = 20;

const PERSONAL_RANK_KEYS = Object.freeze([
  'testId',
  'rank',
  'totalParticipants',
  'percentile',
  'score',
  'attemptId',
]);

/**
 * Competition rank: ties share a rank (no time tie-break).
 * rank = 1 + number of users with a strictly better best score.
 */
export function computeCompetitionRank(betterCount) {
  return 1 + Math.max(0, Number(betterCount) || 0);
}

/**
 * Percentile is omitted for small samples.
 * Formula: ((totalParticipants - rank) / totalParticipants) * 100, nearest int.
 */
export function computePercentile(rank, totalParticipants) {
  const total = Number(totalParticipants) || 0;
  const r = Number(rank) || 0;
  if (total < PERCENTILE_MIN_PARTICIPANTS) return null;
  if (r < 1 || r > total) return null;
  return Math.round(((total - r) / total) * 100);
}

/**
 * JWT subject only — never query/body/params user ids.
 * @param {{ user?: { id?: unknown } }} req
 */
export function authenticatedUserIdFromRequest(req) {
  return req?.user?.id != null ? String(req.user.id) : '';
}

function toPersonalRankPayload({ testId, rank, totalParticipants, percentile, score, attemptId }) {
  return {
    testId: String(testId),
    rank,
    totalParticipants,
    percentile,
    score,
    attemptId: String(attemptId),
  };
}

export function assertPersonalRankPayloadShape(payload) {
  const keys = Object.keys(payload || {});
  if (keys.length !== PERSONAL_RANK_KEYS.length) {
    throw new Error('personal rank payload has unexpected keys');
  }
  for (const key of PERSONAL_RANK_KEYS) {
    if (!keys.includes(key)) {
      throw new Error(`personal rank payload missing ${key}`);
    }
  }
  if (payload.users || payload.leaderboard || payload.scores || payload.rankings || payload.participants) {
    throw new Error('personal rank payload leaked a list');
  }
}

/**
 * Personal mock rank from TestAttempt-backed ports. Does not load other users.
 *
 * @param {string} userId
 * @param {string} testId
 * @param {{
 *   findTestById: (id: string) => Promise<object|null>,
 *   findBestCompletedByUserAndTest: (userId: string, testId: string) => Promise<{ _id: unknown, score: unknown }|null>,
 *   aggregatePersonalRankStats: (testId: string, bestScore: number) => Promise<{ totalParticipants: number, betterCount: number }>,
 * }} ports
 */
export async function resolvePersonalRank(userId, testId, ports) {
  const test = await ports.findTestById(testId);
  if (!test) {
    throw new AppError('Test not found', HTTP_STATUS.NOT_FOUND);
  }

  const best = await ports.findBestCompletedByUserAndTest(userId, testId);
  if (!best || !Number.isFinite(Number(best.score))) {
    throw new AppError('Complete this test to see your rank', HTTP_STATUS.NOT_FOUND, null, {
      code: 'TEST_NOT_COMPLETED',
    });
  }

  const score = Number(best.score);
  const { totalParticipants, betterCount } = await ports.aggregatePersonalRankStats(testId, score);
  const rank = computeCompetitionRank(betterCount);
  const percentile = computePercentile(rank, totalParticipants);

  return toPersonalRankPayload({
    testId,
    rank,
    totalParticipants,
    percentile,
    score,
    attemptId: best._id,
  });
}
