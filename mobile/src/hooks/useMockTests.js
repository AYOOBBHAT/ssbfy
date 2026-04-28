import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  getApiErrorMessage,
  isFreeTestLimitError,
  FREE_TEST_LIMIT_MESSAGE,
} from '../services/api';
import { getTests, startTest } from '../services/testService';

export function useMockTests() {
  const navigation = useNavigation();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mockStartError, setMockStartError] = useState(null);
  const [startingId, setStartingId] = useState(null);

  const loadTests = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getTests();
      setTests(Array.isArray(data?.tests) ? data.tests : []);
    } catch (e) {
      setError(getApiErrorMessage(e));
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const handleStartTest = async (item) => {
    const testId = item?._id;
    if (!testId) {
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
      });
    } catch (e) {
      setMockStartError(
        isFreeTestLimitError(e)
          ? FREE_TEST_LIMIT_MESSAGE
          : getApiErrorMessage(e)
      );
    } finally {
      setStartingId(null);
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
