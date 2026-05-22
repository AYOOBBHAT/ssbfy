/** Production HTTPS battle invite base (Android App Links host). */
export const BATTLE_WEB_INVITE_BASE = 'https://api.jkssbfy.in/battle';

export function buildBattleWebInviteUrl(inviteCode) {
  const code = String(inviteCode ?? '').trim().toUpperCase();
  return `${BATTLE_WEB_INVITE_BASE}/${code}`;
}

/** Canonical api.jkssbfy.in link; rewrites legacy apex/ssbfy.app webLinks. */
export function normalizeBattleWebLink(webLink, inviteCode) {
  const canonical = buildBattleWebInviteUrl(inviteCode);
  const raw = String(webLink ?? '').trim();
  if (raw.includes('api.jkssbfy.in/battle/')) return raw;
  if (/\/battle\/[^/?#]+/i.test(raw)) return canonical;
  return canonical;
}

/** Share + copy fallback: always includes code and HTTPS link. */
export function formatBattleShareMessage(inviteCode, webLink) {
  const code = String(inviteCode ?? '').trim().toUpperCase();
  const link = normalizeBattleWebLink(webLink, code);
  return `Challenge me on SSBFY!\nBattle code: ${code}\n${link}`;
}
