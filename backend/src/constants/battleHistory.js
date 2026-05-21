/** Viewer-centric UX statuses (not raw BattleSession.status). */
export const BATTLE_UX_STATUSES = Object.freeze([
  'waiting',
  'active',
  'awaiting_opponent',
  'completed',
  'expired',
]);

export const BATTLE_HISTORY_RECENT_DEFAULT = 20;
export const BATTLE_HISTORY_RECENT_MAX = 40;
export const BATTLE_HISTORY_PENDING_MAX = 30;
export const BATTLE_RECENT_OPPONENTS_MAX = 8;
