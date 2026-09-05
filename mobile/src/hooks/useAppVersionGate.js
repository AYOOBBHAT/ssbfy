import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { fetchAndroidVersionPolicy } from '../services/appVersionService';
import { shouldForceAndroidUpdate } from '../utils/appVersionPolicy';
import { getInstalledAndroidVersionCode } from '../utils/installedAppVersion';

/**
 * Splash-level gate. Fail-open on any error, missing version, or invalid policy.
 * Does not persist the decision.
 */
export function useAppVersionGate() {
  const [checking, setChecking] = useState(true);
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        if (Platform.OS !== 'android') {
          if (!ac.signal.aborted) {
            setUpdateRequired(false);
            setChecking(false);
          }
          return;
        }

        const installed = getInstalledAndroidVersionCode();
        if (installed == null) {
          if (!ac.signal.aborted) {
            setUpdateRequired(false);
            setChecking(false);
          }
          return;
        }

        const policy = await fetchAndroidVersionPolicy({ signal: ac.signal });
        if (ac.signal.aborted) return;
        setUpdateRequired(shouldForceAndroidUpdate(installed, policy));
        setChecking(false);
      } catch {
        if (!ac.signal.aborted) {
          setUpdateRequired(false);
          setChecking(false);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, []);

  return { checking, updateRequired };
}
