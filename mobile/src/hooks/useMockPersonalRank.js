import { useEffect, useState } from 'react';
import { getTestRank } from '../services/testService';
import { isRequestCancelled } from '../services/api';
import { resolveMongoId } from '../utils/mongoId';
import {
  sanitizePersonalRankPayload,
  shouldFetchMockPersonalRank,
} from '../utils/mockPersonalRank';

/**
 * Non-blocking personal rank for one completed mock.
 * Failures (404 TEST_NOT_COMPLETED, 5xx, network) hide the card — never toast.
 */
export function useMockPersonalRank({ testId, isRetry, sessionType, enabled = true }) {
  const resolvedId = resolveMongoId(testId, 'testId');
  const canFetch =
    enabled &&
    shouldFetchMockPersonalRank({
      testId: resolvedId,
      isRetry,
      sessionType,
    });

  const [status, setStatus] = useState('idle');
  const [rank, setRank] = useState(null);

  useEffect(() => {
    if (!canFetch || !resolvedId) {
      setStatus('idle');
      setRank(null);
      return undefined;
    }

    const ac = new AbortController();
    setStatus('loading');
    setRank(null);

    const load = async () => {
      try {
        const data = await getTestRank(resolvedId, { signal: ac.signal });
        if (ac.signal.aborted) return;
        const sanitized = sanitizePersonalRankPayload(data);
        if (!sanitized) {
          setRank(null);
          setStatus('hidden');
          return;
        }
        setRank(sanitized);
        setStatus('ready');
      } catch (e) {
        if (ac.signal.aborted || isRequestCancelled(e)) return;
        setRank(null);
        setStatus('hidden');
      }
    };

    void load();
    return () => {
      ac.abort();
    };
  }, [canFetch, resolvedId]);

  const statusOut = canFetch && status === 'idle' ? 'loading' : status;
  return { status: statusOut, rank: statusOut === 'ready' ? rank : null };
}
