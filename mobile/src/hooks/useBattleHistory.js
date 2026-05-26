import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getBattleHistory } from '../services/battleService';
import { battleHistoryDevLog } from '../utils/battleHistoryDevLog';
import { focusRefetchDevLog } from '../utils/focusRefetchDevLog';
import { getCacheAgeMs, isCacheFresh } from '../utils/requestFreshness';
import { stabilizeBattleHistoryPayload } from '../utils/battleHistoryRowStability';

export const BATTLE_HISTORY_STALE_AFTER_MS = 45 * 1000;

let battleHistoryCache = null;
let battleHistoryInFlight = null;

function setBattleHistoryCacheEntry(value, fetchedAt = Date.now()) {
  battleHistoryCache = { value, fetchedAt };
  return battleHistoryCache;
}

export function getBattleHistorySnapshot() {
  return battleHistoryCache?.value ?? null;
}

export function isBattleHistorySnapshotFresh(
  staleAfterMs = BATTLE_HISTORY_STALE_AFTER_MS
) {
  return Boolean(battleHistoryCache && isCacheFresh(battleHistoryCache.fetchedAt, staleAfterMs));
}

export function useBattleHistory({ enabled = true } = {}) {
  const [data, setData] = useState(() => getBattleHistorySnapshot());
  const [loading, setLoading] = useState(() => !getBattleHistorySnapshot());
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async (options = {}) => {
    const { force = false, source = 'manual', silent } = options;
    if (!enabled) return;
    const cached = battleHistoryCache?.value ?? null;
    const hasCached = !!cached;
    if (cached) {
      setData(cached);
    }
    if (!force && isBattleHistorySnapshotFresh(BATTLE_HISTORY_STALE_AFTER_MS)) {
      setError(null);
      setLoading(false);
      focusRefetchDevLog('battle_history_skip_fresh', {
        source,
        ageMs: getCacheAgeMs(battleHistoryCache?.fetchedAt),
      });
      return cached;
    }
    const shouldShowLoader = silent ?? !hasCached;
    if (shouldShowLoader) {
      setLoading(true);
    } else {
      setLoading(false);
    }
    setError(null);
    battleHistoryDevLog('fetch_start');
    focusRefetchDevLog('battle_history_refresh_request', {
      source,
      force,
      hasCached,
    });
    try {
      const request =
        battleHistoryInFlight ||
        getBattleHistory({ recentLimit: 20 }).then((payload) => {
          const stablePayload = stabilizeBattleHistoryPayload(
            battleHistoryCache?.value,
            payload
          );
          setBattleHistoryCacheEntry(stablePayload);
          return stablePayload;
        });
      if (!battleHistoryInFlight) {
        battleHistoryInFlight = request.finally(() => {
          battleHistoryInFlight = null;
        });
      } else {
        focusRefetchDevLog('battle_history_dedupe_reuse', { source });
      }
      const payload = await battleHistoryInFlight;
      if (!mountedRef.current) return cached;
      setData((prev) => stabilizeBattleHistoryPayload(prev, payload));
      battleHistoryDevLog('fetch_ok', {
        pending: payload?.summary?.pendingCount ?? 0,
        recent: payload?.recentBattles?.length ?? 0,
      });
      focusRefetchDevLog('battle_history_refresh_ok', {
        source,
        pending: payload?.summary?.pendingCount ?? 0,
        recent: payload?.recentBattles?.length ?? 0,
      });
      return payload;
    } catch (e) {
      if (isRequestCancelled(e) || !mountedRef.current) return cached ?? null;
      const msg = getApiErrorMessage(e);
      setError(msg);
      battleHistoryDevLog('fetch_error', { message: msg });
      focusRefetchDevLog('battle_history_refresh_error', { source });
    } finally {
      if (shouldShowLoader && mountedRef.current) {
        setLoading(false);
      }
    }
    return cached ?? null;
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    void reload({ source: 'mount' });
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
