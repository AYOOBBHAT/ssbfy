import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getMockQuota } from '../services/testService';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { isRequestCancelled } from '../services/api';

/**
 * Fetches read-only mock quota for free users. Premium → `{ unlimited: true }`.
 * @param {{ enabled?: boolean }} [opts]
 */
export function useMockQuota(opts = {}) {
  const { enabled = true } = opts;
  const { user } = useAuth();
  const isPremium = userHasPremiumAccess(user);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setQuota(null);
      setError(null);
      return;
    }
    if (isPremium) {
      setQuota({ unlimited: true });
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMockQuota();
      setQuota(data);
    } catch (e) {
      if (isRequestCancelled(e)) return;
      setQuota(null);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled, user, isPremium]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return {
    quota,
    loading,
    error,
    refresh,
    isPremium,
    showQuota: enabled && !!user && !isPremium,
  };
}
