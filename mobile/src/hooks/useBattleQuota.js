import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage, isRequestCancelled } from '../services/api';
import { getBattleQuota } from '../services/battleService';

export function useBattleQuota() {
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadRef = useRef(null);

  const reload = useCallback(async () => {
    loadRef.current?.abort();
    const ac = new AbortController();
    loadRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const data = await getBattleQuota({ signal: ac.signal });
      if (loadRef.current !== ac) return;
      setQuota(data);
    } catch (e) {
      if (isRequestCancelled(e) || loadRef.current !== ac) return;
      setError(getApiErrorMessage(e));
    } finally {
      if (loadRef.current === ac) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      loadRef.current?.abort();
      loadRef.current = null;
    };
  }, [reload]);

  return { quota, loading, error, reload };
}
