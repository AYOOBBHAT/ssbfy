/**
 * DEV-only instrumentation for focus-triggered fetch throttling.
 * Keep logs low-noise and easy to strip if we ever retire them.
 */
export function focusRefetchDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[FocusRefresh] ${event}`, detail);
}
