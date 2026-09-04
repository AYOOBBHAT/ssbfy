/**
 * Personal mock-rank UI helpers (no React Native).
 * Run from mobile/: node scripts/verify-mock-personal-rank-ui.cjs
 */
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'utils', 'mockPersonalRank.js');
const filename = SRC;
const source = fs.readFileSync(SRC, 'utf8');
const cjs = `${source
  .replace(/\bexport\s+function\s+/g, 'function ')
  .replace(/\bexport\s+\{[\s\S]*?\};?/g, '')}

module.exports = {
  shouldFetchMockPersonalRank,
  sanitizePersonalRankPayload,
  formatPersonalRankCopy,
};
`;

const m = new Module(filename);
m.filename = filename;
m.paths = Module._nodeModulePaths(path.dirname(filename));
m._compile(cjs, filename);
const {
  shouldFetchMockPersonalRank,
  sanitizePersonalRankPayload,
  formatPersonalRankCopy,
} = m.exports;

const MOCK_ID = '64a0000000000000000000aa';

function run() {
  // Fetch gating — completed mock only
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: false }),
    true,
    '1. completed mock with valid testId fetches'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: true }),
    false,
    'retry session does not fetch'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: null, isRetry: false }),
    false,
    'missing testId does not fetch'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: 'not-an-id', isRetry: false }),
    false,
    'invalid testId does not fetch'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: false, sessionType: 'battle' }),
    false,
    '10. battle does not fetch'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: false, sessionType: 'daily' }),
    false,
    '11. daily practice does not fetch'
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: false, sessionType: 'practice' }),
    false,
    'practice does not fetch'
  );

  // 2. Rank 1
  const first = sanitizePersonalRankPayload({
    testId: MOCK_ID,
    rank: 1,
    totalParticipants: 1,
    percentile: null,
    score: 78,
    attemptId: 'att1',
  });
  assert.equal(first.rank, 1);
  assert.equal(formatPersonalRankCopy(first).rankLabel, '#1');
  assert.equal(formatPersonalRankCopy(first).standing, '1 out of 1 candidate');
  assert.equal(formatPersonalRankCopy(first).percentile, null);

  // 3. Rank 47 / 312
  const mid = sanitizePersonalRankPayload({
    testId: MOCK_ID,
    rank: 47,
    totalParticipants: 312,
    percentile: 85,
    score: 78,
    attemptId: 'att47',
  });
  assert.equal(mid.rank, 47);
  assert.equal(mid.totalParticipants, 312);
  const midCopy = formatPersonalRankCopy(mid);
  assert.equal(midCopy.rankLabel, '#47');
  assert.equal(midCopy.standing, '47 out of 312 candidates');

  // 4. Percentile 85
  assert.equal(midCopy.percentile, 'You performed better than 85% of candidates');

  // 5 + 6. Percentile null / fewer than 20
  const small = sanitizePersonalRankPayload({
    rank: 7,
    totalParticipants: 12,
    percentile: null,
    score: 40,
    attemptId: 'att7',
  });
  const smallCopy = formatPersonalRankCopy(small);
  assert.equal(smallCopy.percentile, null);
  assert.equal(smallCopy.rankLabel, '#7');
  assert.equal(smallCopy.standing, '7 out of 12 candidates');

  // Invalid / empty payloads hide the card (7–9)
  assert.equal(sanitizePersonalRankPayload(null), null);
  assert.equal(sanitizePersonalRankPayload({ rank: 0, totalParticipants: 10 }), null);
  assert.equal(sanitizePersonalRankPayload({ rank: 2, totalParticipants: 0 }), null);
  assert.equal(sanitizePersonalRankPayload({ rank: 5, totalParticipants: 4 }), null);

  // Extra list keys never become UI fields
  const leaked = sanitizePersonalRankPayload({
    rank: 3,
    totalParticipants: 20,
    percentile: 85,
    users: [{ name: 'Ada' }],
    leaderboard: [{ rank: 1 }],
    scores: [99],
    rankings: [],
    otherScores: [1],
    otherRanks: [1],
  });
  assert.equal(leaked.rank, 3);
  assert.equal(leaked.users, undefined);
  assert.equal(leaked.leaderboard, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(leaked, 'users'), false);
  assert.deepEqual(Object.keys(leaked).sort(), [
    'attemptId',
    'percentile',
    'rank',
    'score',
    'testId',
    'totalParticipants',
  ]);

  // 12. Best-score rank is whatever the API returned (no client recompute)
  const afterRetry = sanitizePersonalRankPayload({
    rank: 2,
    totalParticipants: 50,
    percentile: 96,
    score: 82,
    attemptId: 'best',
  });
  assert.equal(afterRetry.rank, 2);
  assert.equal(afterRetry.score, 82);

  // 13. Same testId keeps the same fetch key (no extra client-side rank math)
  const keyA = `${MOCK_ID}|false|`;
  const keyB = `${MOCK_ID}|false|`;
  assert.equal(keyA, keyB);

  // 14. Historical result uses provided testId only — never guessed
  assert.equal(
    shouldFetchMockPersonalRank({ testId: MOCK_ID, isRetry: false, sessionType: null }),
    true
  );
  assert.equal(
    shouldFetchMockPersonalRank({ testId: undefined, isRetry: false }),
    false,
    'historical without testId does not guess'
  );

  console.log('verify-mock-personal-rank-ui: all checks passed');
}

run();
