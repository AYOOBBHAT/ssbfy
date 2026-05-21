/**
 * DEV-only battle history instrumentation — no production noise.
 */

export function battleHistoryDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[BattleHistory] ${event}`, detail);
}
