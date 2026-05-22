/**
 * DEV-only setup presentation resolution (practice vs battle CTAs/copy).
 */

export function setupPresentationDevLog(event, detail = {}) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[SetupPresentation] ${event}`, detail);
}
