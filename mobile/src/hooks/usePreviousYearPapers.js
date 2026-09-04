import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getApiErrorMessage,
  isFreeTestLimitError,
  isTestDisabledError,
  FREE_TEST_LIMIT_MESSAGE,
  isRequestCancelled,
} from '../services/api';
import { getTests, startTest } from '../services/testService';
import {
  NAV_TRANSITION_LOCK_MS,
  releaseLockAfter,
  tryAcquireLock,
} from '../utils/navigationGuard';
import {
  buildMockAttemptNavSnapshot,
  logNavigationPayload,
} from '../utils/navigationPayloadStore';
import { useAuth } from '../context/AuthContext';
import { showBeforeMockStart } from '../services/ads/interstitialOrchestrator';
import {
  TEST_KIND_PREVIOUS_YEAR,
  keepPreviousYearPapers,
  resolvePyqOriginMainTab,
} from '../utils/previousYearPapers';

export function usePreviousYearPapers() {
  const navigation = useNavigation();
  const route = useRoute();
  const originMainTab = resolvePyqOriginMainTab(route?.name);
  const { user } = useAuth();
  const startLockRef = useRef(false);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startError, setStartError] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const loadAbortRef = useRef(null);

  const loadPapers = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    setError(null);
    setLoading(true);
    try {
      const data = await getTests({
        signal: ac.signal,
        kind: TEST_KIND_PREVIOUS_YEAR,
      });
      if (loadAbortRef.current !== ac) return;
      setTests(keepPreviousYearPapers(data?.tests));
    } catch (e) {
      if (isRequestCancelled(e)) return;
      if (loadAbortRef.current !== ac) return;
      setError(getApiErrorMessage(e));
      setTests([]);
    } finally {
      if (loadAbortRef.current === ac) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPapers();
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [loadPapers]);

  const handleStartPaper = async (item) => {
    if (!tryAcquireLock(startLockRef)) return;
    const testId = item?._id;
    if (!testId) {
      releaseLockAfter(startLockRef, 0);
      setError('This paper is unavailable.');
      return;
    }
    setStartError(null);
    setStartingId(testId);
    try {
      const data = (await startTest(testId)) || {};
      if (!data.attempt) {
        setStartError('Could not start this paper. Please try again.');
        return;
      }
      const testParams = {
        testId,
        attempt: buildMockAttemptNavSnapshot(data.attempt),
        durationMinutes: item?.duration,
        originMainTab,
        kind: TEST_KIND_PREVIOUS_YEAR,
      };
      logNavigationPayload('Test', testParams, {
        includeDebug: true,
        source: 'pyq_start',
      });
      try {
        await showBeforeMockStart({ user });
      } catch (_) {
        /* ads must never block paper start */
      }
      navigation.navigate('Test', testParams);
    } catch (e) {
      if (isRequestCancelled(e)) return;
      setStartError(
        isTestDisabledError(e)
          ? 'This paper is no longer available.'
          : isFreeTestLimitError(e)
            ? FREE_TEST_LIMIT_MESSAGE
            : getApiErrorMessage(e)
      );
    } finally {
      setTimeout(() => {
        startLockRef.current = false;
        setStartingId(null);
      }, NAV_TRANSITION_LOCK_MS);
    }
  };

  return {
    tests,
    loading,
    error,
    loadPapers,
    startError,
    startingId,
    handleStartPaper,
    FREE_TEST_LIMIT_MESSAGE,
  };
}
