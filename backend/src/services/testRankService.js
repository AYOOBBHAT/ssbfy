import { testRepository } from '../repositories/testRepository.js';
import { testAttemptRepository } from '../repositories/testAttemptRepository.js';
import { resolvePersonalRank } from '../utils/mockTestRank.js';

export {
  PERCENTILE_MIN_PARTICIPANTS,
  assertPersonalRankPayloadShape,
  authenticatedUserIdFromRequest,
  computeCompetitionRank,
  computePercentile,
} from '../utils/mockTestRank.js';

export const testRankService = {
  /**
   * Personal standing for the authenticated user on one mock test.
   * Source of truth: TestAttempt (not Result). Does not touch scoring/submit.
   */
  async getPersonalRank(userId, testId) {
    return resolvePersonalRank(userId, testId, {
      findTestById: (id) => testRepository.findById(id),
      findBestCompletedByUserAndTest: (uid, tid) =>
        testAttemptRepository.findBestCompletedByUserAndTest(uid, tid),
      aggregatePersonalRankStats: (tid, bestScore) =>
        testAttemptRepository.aggregatePersonalRankStats(tid, bestScore),
    });
  },
};
