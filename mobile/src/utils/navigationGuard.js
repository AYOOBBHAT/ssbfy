/**
 * Lightweight guards for rapid taps / overlapping navigations.
 * Keeps study flows responsive without heavy animation libraries.
 */

/** Brief lock after navigate() so double-taps do not stack routes. */
export const NAV_TRANSITION_LOCK_MS = 400;

/** PDF in-app browser open — block duplicate sheet launches. */
export const PDF_OPEN_LOCK_MS = 500;

export function tryAcquireLock(lockRef) {
  if (lockRef?.current) return false;
  if (lockRef) lockRef.current = true;
  return true;
}

export function releaseLockAfter(lockRef, delayMs = NAV_TRANSITION_LOCK_MS) {
  if (!lockRef) return undefined;
  if (delayMs <= 0) {
    lockRef.current = false;
    return undefined;
  }
  const timer = setTimeout(() => {
    lockRef.current = false;
  }, delayMs);
  return () => clearTimeout(timer);
}

/**
 * Run async work under a ref lock; release after optional delay (e.g. post-navigate).
 */
export async function withNavigationLock(lockRef, fn, { releaseDelayMs = NAV_TRANSITION_LOCK_MS } = {}) {
  if (!tryAcquireLock(lockRef)) return false;
  try {
    await fn();
    return true;
  } finally {
    if (releaseDelayMs <= 0) {
      lockRef.current = false;
    } else {
      releaseLockAfter(lockRef, releaseDelayMs);
    }
  }
}

export function isGlobalOpening(openingId) {
  return openingId != null && openingId !== '';
}
