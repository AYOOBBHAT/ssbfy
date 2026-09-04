/**
 * Personal mock-test rank helpers (display only).
 * Rank / participants / percentile are never computed here — only validated.
 */

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const NON_MOCK_SESSION_TYPES = new Set([
  'battle',
  'daily',
  'practice',
  'retry',
  'smart',
  'weak',
]);

function asObjectId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return OBJECT_ID_RE.test(s) ? s : null;
}

/**
 * ResultScreen already treats a normal mock as `!!testId && !retry`.
 * Also refuse battle/daily/practice session types if those params leak a testId.
 *
 * @param {{
 *   testId?: unknown,
 *   isRetry?: boolean,
 *   sessionType?: unknown,
 * }} input
 */
export function shouldFetchMockPersonalRank(input = {}) {
  if (input.isRetry === true) return false;
  if (!asObjectId(input.testId)) return false;
  const sessionType =
    typeof input.sessionType === 'string' ? input.sessionType.trim().toLowerCase() : '';
  if (sessionType && NON_MOCK_SESSION_TYPES.has(sessionType)) return false;
  return true;
}

function toWholeNumber(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

/**
 * Accept only this user's standing fields. Drop leaderboard/list keys.
 *
 * @param {unknown} raw
 * @returns {{
 *   testId: string|null,
 *   rank: number,
 *   totalParticipants: number,
 *   percentile: number|null,
 *   score: number|null,
 *   attemptId: string,
 * }|null}
 */
export function sanitizePersonalRankPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.users || raw.leaderboard || raw.scores || raw.rankings || raw.participants || raw.otherScores || raw.otherRanks) {
    /* extra list keys are ignored; they never become UI data */
  }

  const rank = toWholeNumber(raw.rank);
  const totalParticipants = toWholeNumber(raw.totalParticipants);
  if (rank == null || rank < 1) return null;
  if (totalParticipants == null || totalParticipants < 1) return null;
  if (rank > totalParticipants) return null;

  let percentile = null;
  if (raw.percentile != null && raw.percentile !== '') {
    const n = typeof raw.percentile === 'number' ? raw.percentile : Number(raw.percentile);
    if (Number.isFinite(n)) percentile = n;
  }

  let score = null;
  if (raw.score != null && raw.score !== '') {
    const n = typeof raw.score === 'number' ? raw.score : Number(raw.score);
    if (Number.isFinite(n)) score = n;
  }

  return {
    testId: asObjectId(raw.testId),
    rank,
    totalParticipants,
    percentile,
    score,
    attemptId: raw.attemptId != null ? String(raw.attemptId) : '',
  };
}

/**
 * Accessible copy from a sanitized payload. Percentile line omitted when null.
 *
 * @param {{ rank: number, totalParticipants: number, percentile: number|null }} payload
 */
export function formatPersonalRankCopy(payload) {
  const rank = payload.rank;
  const total = payload.totalParticipants;
  const headline = `Your rank`;
  const rankLabel = `#${rank}`;
  const standing = `${rank} out of ${total} candidate${total === 1 ? '' : 's'}`;
  const percentile =
    payload.percentile == null
      ? null
      : `You performed better than ${payload.percentile}% of candidates`;
  return { headline, rankLabel, standing, percentile };
}
