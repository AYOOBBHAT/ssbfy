/**
 * DEV-only safe-area instrumentation for bottom CTA layout debugging.
 */

export function safeAreaDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[SafeArea] ${event}`, detail);
}
