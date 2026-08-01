import { BATTLE_STATUSES } from '../constants/battle.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from './AppError.js';
import { logger } from './logger.js';

/** Initial status for newly created battles (not a transition). */
export const INITIAL_BATTLE_STATUS = 'waiting';

/**
 * Strict battle status transition table.
 *
 * waiting  → active | expired
 * active   → completed | expired
 * completed → (none)
 * expired   → (none)
 */
export const BATTLE_STATUS_TRANSITIONS = Object.freeze({
  waiting: Object.freeze(['active', 'expired']),
  active: Object.freeze(['completed', 'expired']),
  completed: Object.freeze([]),
  expired: Object.freeze([]),
});

const STATUS_SET = new Set(BATTLE_STATUSES);

export function isBattleStatus(value) {
  return STATUS_SET.has(String(value ?? ''));
}

export function isTerminalBattleStatus(status) {
  const s = String(status ?? '');
  return s === 'completed' || s === 'expired';
}

/**
 * Statuses that may still accept gameplay mutations (start / reveal / join).
 * Not a transition — business eligibility for open battles.
 */
export function openBattleStatuses() {
  return Object.freeze(['waiting', 'active']);
}

/**
 * From-statuses allowed to transition into `toStatus`.
 * @param {string} toStatus
 * @returns {readonly string[]}
 */
export function sourceStatusesFor(toStatus) {
  const to = String(toStatus ?? '');
  const sources = [];
  for (const from of BATTLE_STATUSES) {
    if (BATTLE_STATUS_TRANSITIONS[from]?.includes(to)) {
      sources.push(from);
    }
  }
  return Object.freeze(sources);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransitionBattleStatus(from, to) {
  const f = String(from ?? '');
  const t = String(to ?? '');
  if (!isBattleStatus(f) || !isBattleStatus(t)) return false;
  if (f === t) return false;
  return (BATTLE_STATUS_TRANSITIONS[f] || []).includes(t);
}

/**
 * Throws a descriptive AppError when the transition is illegal.
 * @param {string} from
 * @param {string} to
 * @param {{ battleId?: string, reason?: string }} [meta]
 */
export function assertBattleStatusTransition(from, to, meta = {}) {
  const f = String(from ?? '');
  const t = String(to ?? '');

  if (!isBattleStatus(f)) {
    logger.warn(
      {
        event: 'battle_status_transition_rejected',
        battleId: meta.battleId ? String(meta.battleId) : null,
        from: f,
        to: t,
        reason: meta.reason || 'invalid_from_status',
        timestamp: new Date().toISOString(),
      },
      'battle_status_transition_rejected'
    );
    throw new AppError(
      `Invalid battle status "${f}"`,
      HTTP_STATUS.CONFLICT,
      null,
      { code: 'BATTLE_INVALID_STATUS', from: f, to: t }
    );
  }

  if (!isBattleStatus(t)) {
    logger.warn(
      {
        event: 'battle_status_transition_rejected',
        battleId: meta.battleId ? String(meta.battleId) : null,
        from: f,
        to: t,
        reason: meta.reason || 'invalid_to_status',
        timestamp: new Date().toISOString(),
      },
      'battle_status_transition_rejected'
    );
    throw new AppError(
      `Invalid target battle status "${t}"`,
      HTTP_STATUS.CONFLICT,
      null,
      { code: 'BATTLE_INVALID_STATUS', from: f, to: t }
    );
  }

  if (!canTransitionBattleStatus(f, t)) {
    const allowed = BATTLE_STATUS_TRANSITIONS[f] || [];
    logger.warn(
      {
        event: 'battle_status_transition_rejected',
        battleId: meta.battleId ? String(meta.battleId) : null,
        from: f,
        to: t,
        allowed,
        reason: meta.reason || 'illegal_transition',
        timestamp: new Date().toISOString(),
      },
      'battle_status_transition_rejected'
    );
    throw new AppError(
      `Illegal battle status transition: ${f} → ${t}` +
        (allowed.length ? ` (allowed: ${allowed.join(', ')})` : ' (terminal state)'),
      HTTP_STATUS.CONFLICT,
      null,
      {
        code: 'BATTLE_INVALID_STATUS_TRANSITION',
        from: f,
        to: t,
        allowed,
      }
    );
  }
}

/**
 * MongoDB aggregation `$set.status` expression: waiting → active, else unchanged.
 * Only encodes the single valid promote transition.
 */
export function promoteWaitingToActiveStatusExpr() {
  assertBattleStatusTransition('waiting', 'active', { reason: 'expr_definition' });
  return {
    $cond: [{ $eq: ['$status', 'waiting'] }, 'active', '$status'],
  };
}

/**
 * Structured transition log (success path).
 * @param {{
 *   battleId: unknown,
 *   from: string,
 *   to: string,
 *   userId?: unknown,
 *   reason: string,
 *   timestamp?: string,
 * }} params
 */
export function logBattleStatusTransition({
  battleId,
  from,
  to,
  userId = null,
  reason,
  timestamp = new Date().toISOString(),
}) {
  logger.info(
    {
      event: 'battle_status_transition',
      battleId: battleId != null ? String(battleId) : null,
      from: String(from),
      to: String(to),
      userId: userId != null ? String(userId) : null,
      reason: String(reason || 'unspecified'),
      timestamp,
    },
    'battle_status_transition'
  );
}

/**
 * Validate + log a transition that already succeeded in Mongo (or is about to).
 * No-ops when from === to.
 */
export function recordBattleStatusTransition({
  battleId,
  from,
  to,
  userId = null,
  reason,
}) {
  if (String(from) === String(to)) return;
  assertBattleStatusTransition(from, to, { battleId, reason });
  logBattleStatusTransition({ battleId, from, to, userId, reason });
}
