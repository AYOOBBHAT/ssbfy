/**
 * DEV-only Android App Links / battle deep link instrumentation.
 */

export function parseBattleInviteFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/battle\/([^/?#]+)/i) || url.match(/battle\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  return String(match[1]).trim().toUpperCase();
}

export function battleDeepLinkDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[BattleDeepLink] ${event}`, detail);
}
