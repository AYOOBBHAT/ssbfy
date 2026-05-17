import { useCallback, useRef } from 'react';
import {
  NAV_TRANSITION_LOCK_MS,
  releaseLockAfter,
  tryAcquireLock,
} from '../utils/navigationGuard';

/**
 * Prevents stacked navigations from rapid taps (sync or async).
 */
export function useNavigationActionLock(lockMs = NAV_TRANSITION_LOCK_MS) {
  const lockRef = useRef(false);

  const runOnce = useCallback(
    (fn) => {
      if (!tryAcquireLock(lockRef)) return false;
      try {
        fn();
        return true;
      } finally {
        releaseLockAfter(lockRef, lockMs);
      }
    },
    [lockMs]
  );

  const runOnceAsync = useCallback(
    async (fn) => {
      if (!tryAcquireLock(lockRef)) return false;
      try {
        await fn();
        return true;
      } finally {
        releaseLockAfter(lockRef, lockMs);
      }
    },
    [lockMs]
  );

  return { runOnce, runOnceAsync, lockRef };
}
