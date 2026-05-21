/** Minimum questions per battle (prevents trivial farming). */
export const BATTLE_MIN_QUESTIONS = 5;

/** Aligns with practice issuance / reveal caps. */
export const BATTLE_MAX_QUESTIONS = 50;

/** Battle invite window — async friend challenges, not live play. */
export const BATTLE_EXPIRY_MS = 48 * 60 * 60 * 1000;

/** Free-tier daily limits (backend-authoritative via BattleUsage). */
export const BATTLE_FREE_CREATE_PER_DAY = 1;
export const BATTLE_FREE_JOIN_PER_DAY = 3;

/** Invite code length (uppercase alphanumeric, no ambiguous chars). */
export const BATTLE_INVITE_CODE_LENGTH = 6;

export const BATTLE_INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BATTLE_STATUSES = Object.freeze([
  'waiting',
  'active',
  'completed',
  'expired',
]);

export const BATTLE_TIMER_MODES = Object.freeze(['none', 'per_question', 'total']);

/** Deep link / universal link path prefix (mobile registers scheme). */
export const BATTLE_DEEP_LINK_SCHEME = 'ssbfy';
export const BATTLE_WEB_INVITE_BASE = 'https://ssbfy.app/battle';
