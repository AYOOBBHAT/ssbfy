/**
 * Personal mock-test rank verification (no Mongo).
 *
 * Mirrors GET /tests/:id/rank:
 *   - TestAttempt only (not Result)
 *   - best completed score per user
 *   - rank = 1 + users with strictly greater best score
 *   - distinct participants
 *   - percentile null when N < 20
 *
 * Run: node scripts/verify-mock-test-rank.mjs
 */
import assert from 'node:assert/strict';
import {
  PERCENTILE_MIN_PARTICIPANTS,
  assertPersonalRankPayloadShape,
  authenticatedUserIdFromRequest,
  computeCompetitionRank,
  computePercentile,
  resolvePersonalRank,
} from '../src/utils/mockTestRank.js';
import { AppError } from '../src/utils/AppError.js';
import { HTTP_STATUS } from '../src/constants/httpStatus.js';

const TEST_A = '64a0000000000000000000aa';
const TEST_B = '64a0000000000000000000bb';
const USER_A = '64b0000000000000000000a1';
const USER_B = '64b0000000000000000000b2';
const USER_C = '64b0000000000000000000c3';

function isCompleted(row) {
  return row.endTime != null;
}

function createPorts(rows, tests = { [TEST_A]: { _id: TEST_A }, [TEST_B]: { _id: TEST_B } }) {
  return {
    findTestById: async (testId) => tests[String(testId)] || null,
    findBestCompletedByUserAndTest: async (userId, testId) => {
      const completed = rows.filter(
        (r) =>
          String(r.userId) === String(userId) &&
          String(r.testId) === String(testId) &&
          isCompleted(r)
      );
      if (!completed.length) return null;
      completed.sort((a, b) => {
        const scoreDelta = Number(b.score) - Number(a.score);
        if (scoreDelta !== 0) return scoreDelta;
        return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
      });
      const best = completed[0];
      return { _id: best._id, score: best.score };
    },
    aggregatePersonalRankStats: async (testId, bestScore) => {
      const byUser = new Map();
      for (const r of rows) {
        if (String(r.testId) !== String(testId) || !isCompleted(r)) continue;
        const uid = String(r.userId);
        const prev = byUser.get(uid);
        const score = Number(r.score);
        if (prev == null || score > prev) byUser.set(uid, score);
      }
      const threshold = Number(bestScore);
      let betterCount = 0;
      for (const score of byUser.values()) {
        if (score > threshold) betterCount += 1;
      }
      return { totalParticipants: byUser.size, betterCount };
    },
  };
}

function rank(userId, testId, ports) {
  return resolvePersonalRank(userId, testId, ports);
}

async function rankAsController(ports, req) {
  return resolvePersonalRank(authenticatedUserIdFromRequest(req), req.params.id, ports);
}

async function expectNotCompleted(fn) {
  try {
    await fn();
    assert.fail('expected TEST_NOT_COMPLETED');
  } catch (err) {
    assert.equal(err instanceof AppError, true);
    assert.equal(err.statusCode, HTTP_STATUS.NOT_FOUND);
    assert.equal(err.meta?.code, 'TEST_NOT_COMPLETED');
  }
}

async function run() {
  assert.equal(computeCompetitionRank(0), 1);
  assert.equal(computeCompetitionRank(4), 5);
  assert.equal(computePercentile(5, 7), null);
  assert.equal(computePercentile(47, 312), 85);
  assert.equal(PERCENTILE_MIN_PARTICIPANTS, 20);

  // 1. No completed attempt → 404 TEST_NOT_COMPLETED
  {
    const deps = createPorts([
      {
        _id: 'open1',
        userId: USER_A,
        testId: TEST_A,
        score: null,
        accuracy: 0,
        timeTaken: 10,
        endTime: null,
      },
    ]);
    await expectNotCompleted(() => rank(USER_A, TEST_A, deps));
  }

  // 2. One participant → rank 1
  {
    const deps = createPorts([
      {
        _id: 'a1',
        userId: USER_A,
        testId: TEST_A,
        score: 40,
        accuracy: 50,
        timeTaken: 999,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const payload = await rank(USER_A, TEST_A, deps);
    assertPersonalRankPayloadShape(payload);
    assert.equal(payload.rank, 1);
    assert.equal(payload.totalParticipants, 1);
    assert.equal(payload.percentile, null);
    assert.equal(payload.score, 40);
    assert.equal(payload.attemptId, 'a1');
    assert.equal(payload.testId, TEST_A);
  }

  // 3 + 4. Multiple participants; equal scores share rank
  {
    const deps = createPorts([
      {
        _id: 'u95',
        userId: 'u95',
        testId: TEST_A,
        score: 95,
        accuracy: 10,
        timeTaken: 5,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'u91a',
        userId: 'u91a',
        testId: TEST_A,
        score: 91,
        accuracy: 99,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'u91b',
        userId: 'u91b',
        testId: TEST_A,
        score: 91,
        accuracy: 1,
        timeTaken: 10_000,
        endTime: new Date('2026-01-02'),
      },
      {
        _id: 'u88',
        userId: 'u88',
        testId: TEST_A,
        score: 88,
        accuracy: 88,
        timeTaken: 50,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'current',
        userId: USER_A,
        testId: TEST_A,
        score: 78,
        accuracy: 20,
        timeTaken: 500,
        endTime: new Date('2026-01-03'),
      },
      {
        _id: 'peer78',
        userId: USER_B,
        testId: TEST_A,
        score: 78,
        accuracy: 90,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'u72',
        userId: 'u72',
        testId: TEST_A,
        score: 72,
        accuracy: 100,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const current = await rank(USER_A, TEST_A, deps);
    assert.equal(current.rank, 5);
    assert.equal(current.totalParticipants, 7);
    assert.equal(current.percentile, null);
    const peer = await rank(USER_B, TEST_A, deps);
    assert.equal(peer.rank, 5, 'equal scores share rank');
    assert.equal(peer.attemptId, 'peer78');
    assert.notEqual(peer.attemptId, current.attemptId);
  }

  // 5. Multiple attempts → best score used
  {
    const deps = createPorts([
      {
        _id: 'first',
        userId: USER_A,
        testId: TEST_A,
        score: 65,
        accuracy: 90,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'best',
        userId: USER_A,
        testId: TEST_A,
        score: 78,
        accuracy: 40,
        timeTaken: 9_000,
        endTime: new Date('2026-01-02'),
      },
      {
        _id: 'later',
        userId: USER_A,
        testId: TEST_A,
        score: 72,
        accuracy: 99,
        timeTaken: 1,
        endTime: new Date('2026-01-03'),
      },
      {
        _id: 'other',
        userId: USER_B,
        testId: TEST_A,
        score: 70,
        accuracy: 10,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const payload = await rank(USER_A, TEST_A, deps);
    assert.equal(payload.score, 78);
    assert.equal(payload.attemptId, 'best');
    assert.equal(payload.rank, 1);
    assert.equal(payload.totalParticipants, 2);
  }

  // 6. Incomplete attempt ignored
  {
    const deps = createPorts([
      {
        _id: 'done',
        userId: USER_A,
        testId: TEST_A,
        score: 10,
        accuracy: 10,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'open-high',
        userId: USER_B,
        testId: TEST_A,
        score: 99,
        accuracy: 99,
        timeTaken: 1,
        endTime: null,
      },
    ]);
    const payload = await rank(USER_A, TEST_A, deps);
    assert.equal(payload.rank, 1);
    assert.equal(payload.totalParticipants, 1, 'open attempt is not a participant');
  }

  // 7. Different test IDs do not affect each other
  {
    const deps = createPorts([
      {
        _id: 'a-on-a',
        userId: USER_A,
        testId: TEST_A,
        score: 50,
        accuracy: 50,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'b-on-b',
        userId: USER_B,
        testId: TEST_B,
        score: 99,
        accuracy: 99,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const payload = await rank(USER_A, TEST_A, deps);
    assert.equal(payload.rank, 1);
    assert.equal(payload.totalParticipants, 1);
    assert.equal(payload.testId, TEST_A);
  }

  // 8. User cannot request another user's rank (JWT user id only)
  {
    const deps = createPorts([
      {
        _id: 'aa',
        userId: USER_A,
        testId: TEST_A,
        score: 40,
        accuracy: 40,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'bb',
        userId: USER_B,
        testId: TEST_A,
        score: 90,
        accuracy: 90,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const req = {
      user: { id: USER_A },
      params: { id: TEST_A },
      query: { userId: USER_B, targetUserId: USER_B, studentId: USER_B },
      body: { userId: USER_B },
    };
    const payload = await rankAsController(deps, req);
    assert.equal(payload.attemptId, 'aa');
    assert.equal(payload.score, 40);
    assert.equal(payload.rank, 2);
    assert.equal(authenticatedUserIdFromRequest(req), USER_A);
    assert.notEqual(authenticatedUserIdFromRequest(req), req.query.userId);
  }

  // 9. totalParticipants counts DISTINCT users (100 users / 250 attempts → 100)
  {
    const rows = [];
    for (let i = 0; i < 100; i += 1) {
      const uid = `user-${i}`;
      const extra = i < 50 ? 1 : 0;
      for (let n = 0; n < 2 + extra; n += 1) {
        rows.push({
          _id: `${uid}-${n}`,
          userId: uid,
          testId: TEST_A,
          score: 10 + n,
          accuracy: 10 + n,
          timeTaken: 10,
          endTime: new Date(`2026-01-${String(n + 1).padStart(2, '0')}`),
        });
      }
    }
    assert.equal(rows.length, 250);
    const deps = createPorts(rows);
    const payload = await rank('user-0', TEST_A, deps);
    assert.equal(payload.totalParticipants, 100);
  }

  // 10. percentile null when participants < 20
  {
    const rows = [];
    for (let i = 0; i < 19; i += 1) {
      rows.push({
        _id: `p${i}`,
        userId: `p${i}`,
        testId: TEST_A,
        score: 50 - i,
        accuracy: 50,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      });
    }
    const deps = createPorts(rows);
    const payload = await rank('p0', TEST_A, deps);
    assert.equal(payload.totalParticipants, 19);
    assert.equal(payload.percentile, null);
  }

  // 11. percentile calculated when participants >= 20
  {
    const rows = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push({
        _id: `q${i}`,
        userId: `q${i}`,
        testId: TEST_A,
        score: 100 - i,
        accuracy: 1,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      });
    }
    const deps = createPorts(rows);
    const first = await rank('q0', TEST_A, deps);
    assert.equal(first.rank, 1);
    assert.equal(first.totalParticipants, 20);
    assert.equal(first.percentile, 95);
    const last = await rank('q19', TEST_A, deps);
    assert.equal(last.rank, 20);
    assert.equal(last.percentile, 0);
  }

  // 12. Rank does not use accuracy
  {
    const deps = createPorts([
      {
        _id: 'low-acc-high-score',
        userId: USER_A,
        testId: TEST_A,
        score: 80,
        accuracy: 10,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'high-acc-low-score',
        userId: USER_B,
        testId: TEST_A,
        score: 50,
        accuracy: 100,
        timeTaken: 10,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const a = await rank(USER_A, TEST_A, deps);
    const b = await rank(USER_B, TEST_A, deps);
    assert.equal(a.rank, 1);
    assert.equal(b.rank, 2);
  }

  // 13. Rank does not use time
  {
    const deps = createPorts([
      {
        _id: 'slow',
        userId: USER_A,
        testId: TEST_A,
        score: 80,
        accuracy: 80,
        timeTaken: 10_000,
        endTime: new Date('2026-01-02'),
      },
      {
        _id: 'fast',
        userId: USER_B,
        testId: TEST_A,
        score: 80,
        accuracy: 80,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
      {
        _id: 'third',
        userId: USER_C,
        testId: TEST_A,
        score: 70,
        accuracy: 70,
        timeTaken: 1,
        endTime: new Date('2026-01-01'),
      },
    ]);
    const a = await rank(USER_A, TEST_A, deps);
    const b = await rank(USER_B, TEST_A, deps);
    assert.equal(a.rank, 1);
    assert.equal(b.rank, 1);
    const c = await rank(USER_C, TEST_A, deps);
    assert.equal(c.rank, 3);
  }

  console.log('verify-mock-test-rank: all checks passed');
}

run();
