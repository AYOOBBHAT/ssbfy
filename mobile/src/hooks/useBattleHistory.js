import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getBattleHistory } from '../services/battleService';
import { battleHistoryDevLog } from '../utils/battleHistoryDevLog';

export function useBattleHistory({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadRef = useRef(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    loadRef.current?.abort();
    const ac = new AbortController();
    loadRef.current = ac;
    setLoading(true);
    setError(null);
    battleHistoryDevLog('fetch_start');
    try {
      const payload = await getBattleHistory({ recentLimit: 20 }, { signal: ac.signal });
      if (loadRef.current !== ac) return;
      setData(payload);
      battleHistoryDevLog('fetch_ok', {
        pending: payload?.summary?.pendingCount ?? 0,
        recent: payload?.recentBattles?.length ?? 0,
      });
    } catch (e) {
      if (isRequestCancelled(e) || loadRef.current !== ac) return;
      const msg = getApiErrorMessage(e);
      setError(msg);
      battleHistoryDevLog('fetch_error', { message: msg });
    } finally {
      if (loadRef.current === ac) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
    return () => loadRef.current?.abort();
  }, [reload]);

  return { data, loading, error, reload };
}
