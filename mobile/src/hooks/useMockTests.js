import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
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

export function useMockTests() {
  const navigation = useNavigation();
  const startLockRef = useRef(false);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mockStartError, setMockStartError] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const loadAbortRef = useRef(null);

  const loadTests = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    setError(null);
    setLoading(true);
    try {
      const data = await getTests({ signal: ac.signal });
      if (loadAbortRef.current !== ac) return;
      setTests(Array.isArray(data?.tests) ? data.tests : []);
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
    void loadTests();
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [loadTests]);

  const handleStartTest = async (item) => {
    if (!tryAcquireLock(startLockRef)) return;
    const testId = item?._id;
    if (!testId) {
      releaseLockAfter(startLockRef, 0);
      setError('This test is unavailable.');
      return;
    }
    setMockStartError(null);
    setStartingId(testId);
    try {
      const data = (await startTest(testId)) || {};
      if (!data.attempt) {
        setMockStartError('Could not start this test. Please try again.');
        return;
      }
      navigation.navigate('Test', {
        testId,
        attempt: data.attempt,
        durationMinutes: item?.duration,
        originMainTab: 'Tests',
      });
    } catch (e) {
      if (isRequestCancelled(e)) return;
      setMockStartError(
        isTestDisabledError(e)
          ? 'This test is no longer available.'
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
    loadTests,
    mockStartError,
    startingId,
    handleStartTest,
    FREE_TEST_LIMIT_MESSAGE,
  };
}
