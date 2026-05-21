import { BATTLE_UX_STATUSES } from '../constants/battleHistory.js';

function isExpiredBattle(battle, nowMs = Date.now()) {
  if (battle.status === 'expired') return true;
  if (battle.status === 'completed') return false;
  if (battle.expiresAt && new Date(battle.expiresAt).getTime() < nowMs) return true;
  return false;
}

/**
 * @param {object} battle — lean BattleSession
 * @param {string} userId
 * @returns {typeof BATTLE_UX_STATUSES[number]}
 */
export function deriveBattleUxStatus(battle, userId) {
  const uid = String(userId);
  const isCreator = String(battle.creatorUserId) === uid;
  const isOpponent = battle.opponentUserId && String(battle.opponentUserId) === uid;

  if (!isCreator && !isOpponent) return 'expired';

  if (isExpiredBattle(battle)) return 'expired';
  if (battle.status === 'completed') return 'completed';

  const myAttemptId = isCreator ? battle.creatorAttemptId : battle.opponentAttemptId;
  const theirAttemptId = isCreator ? battle.opponentAttemptId : battle.creatorAttemptId;

  if (isCreator && !battle.opponentUserId) return 'waiting';

  if (myAttemptId && !theirAttemptId) return 'awaiting_opponent';
  if (!myAttemptId) return 'active';

  return 'active';
}

/**
 * @param {typeof BATTLE_UX_STATUSES[number]} uxStatus
 */
export function deriveReopenAction(uxStatus) {
  if (uxStatus === 'completed') return 'result';
  if (uxStatus === 'expired') return 'lobby';
  if (uxStatus === 'waiting' || uxStatus === 'awaiting_opponent') return 'lobby';
  if (uxStatus === 'active') return 'lobby';
  return 'lobby';
}

/**
 * @param {object} battle
 * @param {string} userId
 * @returns {'win'|'loss'|'tie'|null}
 */
export function deriveOutcomeForUser(battle, userId) {
  if (battle.status !== 'completed') return null;
  const winner = battle.winnerUserId ? String(battle.winnerUserId) : null;
  if (!winner) return 'tie';
  if (winner === String(userId)) return 'win';
  return 'loss';
}

function firstName(displayName) {
  const s = String(displayName || '').trim();
  if (!s) return 'Opponent';
  return s.split(/\s+/)[0];
}

/**
 * @param {object} opts
 */
export function buildBattleHeadline({
  uxStatus,
  outcome,
  opponentDisplayName,
  yourScore,
  opponentScore,
}) {
  const name = firstName(opponentDisplayName);

  if (uxStatus === 'waiting') return 'Waiting for opponent';
  if (uxStatus === 'awaiting_opponent') return `Waiting on ${name}`;
  if (uxStatus === 'active') {
    if (opponentScore != null && yourScore == null) return `${name} finished — your turn`;
    return 'Battle in progress';
  }
  if (uxStatus === 'expired') return 'Battle expired';

  if (outcome === 'win') return `You defeated ${name}`;
  if (outcome === 'loss') {
    const gap =
      yourScore != null && opponentScore != null && opponentScore > yourScore
        ? opponentScore - yourScore
        : null;
    if (gap === 1) return `You lost to ${name} by 1 point`;
    if (gap != null && gap > 1) return `You lost to ${name} by ${gap} points`;
    return `You lost to ${name}`;
  }
  if (outcome === 'tie') return `Tied with ${name}`;
  return `Battle vs ${name}`;
}

export function buildScoreComparisonLine(yourScore, opponentScore) {
  if (yourScore == null && opponentScore == null) return null;
  const y = yourScore != null ? String(yourScore) : '—';
  const o = opponentScore != null ? String(opponentScore) : '—';
  return `You ${y} · ${o} them`;
}

/** Pending rows surface first — higher priority = lower sort key. */
export function pendingSortPriority(uxStatus) {
  switch (uxStatus) {
    case 'active':
      return 0;
    case 'awaiting_opponent':
      return 1;
    case 'waiting':
      return 2;
    default:
      return 9;
  }
}

export function sortPendingRows(rows) {
  return [...rows].sort((a, b) => {
    const pa = pendingSortPriority(a.uxStatus);
    const pb = pendingSortPriority(b.uxStatus);
    if (pa !== pb) return pa - pb;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
