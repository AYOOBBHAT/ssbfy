import { useCallback, useRef, useState } from 'react';

/**
 * Wraps an async retry handler so rapid taps cannot stack duplicate fetches.
 */
export function useGuardedRetry(asyncFn) {
  const guardRef = useRef(false);
  const [retrying, setRetrying] = useState(false);

  const onRetry = useCallback(async () => {
    if (!asyncFn || guardRef.current) return;
    guardRef.current = true;
    setRetrying(true);
    try {
      await asyncFn();
    } finally {
      guardRef.current = false;
      setRetrying(false);
    }
  }, [asyncFn]);

  return { onRetry, retrying };
}
