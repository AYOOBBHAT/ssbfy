/**
 * DEV-only mobile API timing logs.
 */
export function apiPerfDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[ApiPerf] ${event}`, detail);
}
