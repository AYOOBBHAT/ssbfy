import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  getCachedMockQuotaSnapshot,
  getMockQuota,
  isMockQuotaSnapshotFresh,
  MOCK_QUOTA_STALE_AFTER_MS,
} from '../services/testService';
import { userHasPremiumAccess } from '../utils/premiumAccess';
import { isRequestCancelled } from '../services/api';
import { focusRefetchDevLog } from '../utils/focusRefetchDevLog';

/**
 * Fetches read-only mock quota for free users. Premium → `{ unlimited: true }`.
 * @param {{ enabled?: boolean }} [opts]
 */
export function useMockQuota(opts = {}) {
  const { enabled = true } = opts;
  const { user } = useAuth();
  const isPremium = userHasPremiumAccess(user);
  const [quota, setQuota] = useState(() => getCachedMockQuotaSnapshot());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !user) {
      setQuota(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (isPremium) {
      setQuota({ unlimited: true });
      setError(null);
      setLoading(false);
      return;
    }
    const cached = getCachedMockQuotaSnapshot();
    setQuota(cached);
    setLoading(!cached);
  }, [enabled, isPremium, user?._id, user?.id]);

  const refresh = useCallback(async (options = {}) => {
    const { force = false, source = 'manual', silent } = options;
    if (!enabled || !user) {
      setQuota(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (isPremium) {
      setQuota({ unlimited: true });
      setError(null);
      setLoading(false);
      return;
    }
    const cached = getCachedMockQuotaSnapshot();
    const hasCached = !!cached;
    if (cached) {
      setQuota(cached);
    }
    if (!force && isMockQuotaSnapshotFresh(MOCK_QUOTA_STALE_AFTER_MS)) {
      setError(null);
      setLoading(false);
      focusRefetchDevLog('mock_quota_skip_focus', {
        source,
        hasCached,
      });
      return cached;
    }
    const shouldShowLoader = silent ?? !hasCached;
    if (!shouldShowLoader) {
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    focusRefetchDevLog('mock_quota_refresh_request', {
      source,
      force,
      hasCached,
    });
    try {
      const data = await getMockQuota({
        force: true,
        staleAfterMs: MOCK_QUOTA_STALE_AFTER_MS,
        reason: source,
      });
      setQuota(data);
      return data;
    } catch (e) {
      if (isRequestCancelled(e)) return;
      if (!hasCached) {
        setQuota(null);
      }
      setError(e);
    } finally {
      if (shouldShowLoader) {
        setLoading(false);
      }
    }
    return cached ?? null;
  }, [enabled, user, isPremium]);

  useFocusEffect(
    useCallback(() => {
      void refresh({ source: 'focus' });
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
