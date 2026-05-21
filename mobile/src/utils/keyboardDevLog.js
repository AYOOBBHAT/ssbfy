/**
 * DEV-only keyboard instrumentation for form layout debugging.
 */

export function keyboardDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[Keyboard] ${event}`, detail);
}
