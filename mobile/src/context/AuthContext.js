import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as authService from '../services/authService';
import api, { setAuthToken, clearAuthToken, isRequestCancelled } from '../services/api';
import { withSingleAuthNetworkRetry } from '../utils/authNetworkRetry.js';
import { clearTopicsCache } from '../services/topicService';
import { setMonitoringUser } from '../monitoring/sentry';
import {
  invalidateSensitiveCachesOnLogout,
  removeLegacySensitiveAsyncKeys,
  setActiveCacheUserId,
} from '../utils/authScopedCache';
import { markStartup } from '../utils/startupTiming';

const STORAGE_KEY = '@ssbfy/auth_session';

const AuthContext = createContext(null);

async function persistSession(token, user) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

async function clearStoredSession() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const refreshUserAbortRef = useRef(null);
  const loginAbortRef = useRef(null);

  const isAuthenticated = !!token;

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setMonitoringUser(user);
  }, [user]);

  useEffect(() => {
    const uid = user?._id ?? user?.id ?? null;
    setActiveCacheUserId(uid);
  }, [user?._id, user?.id]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const clearInvalidBootstrapSession = async () => {
        await clearStoredSession();
        if (ac.signal.aborted) return;
        setToken(null);
        setUser(null);
        clearAuthToken();
      };

      const restoreBootstrapUser = async (sessionToken, { background = false } = {}) => {
        try {
          const res = await withSingleAuthNetworkRetry(
            () => api.get('/users/me', { signal: ac.signal }),
            { signal: ac.signal, label: 'bootstrap_me' }
          );
          const freshUser = res?.data?.data?.user;
          if (ac.signal.aborted) return false;
          if (freshUser && typeof freshUser === 'object') {
            setUser(freshUser);
            await Promise.allSettled([
              removeLegacySensitiveAsyncKeys(),
              persistSession(sessionToken, freshUser),
            ]);
            markStartup('auth_refresh_complete', { background });
            return true;
          }
        } catch (e) {
          if (ac.signal.aborted || isRequestCancelled(e)) return false;
          await clearInvalidBootstrapSession();
          markStartup('auth_refresh_failed', { background });
        }
        return false;
      };

      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (ac.signal.aborted) {
          return;
        }
        if (!raw) {
          void removeLegacySensitiveAsyncKeys();
          return;
        }

        const parsed = JSON.parse(raw);
        const t = parsed?.token;
        const cachedUser = parsed?.user;

        if (typeof t !== 'string' || t.length === 0) {
          await clearStoredSession();
          return;
        }

        setToken(t);
        setAuthToken(t);

        if (cachedUser && typeof cachedUser === 'object') {
          setUser(cachedUser);
          markStartup('auth_cache_restored');
          void Promise.allSettled([
            removeLegacySensitiveAsyncKeys(),
            restoreBootstrapUser(t, { background: true }),
          ]);
          return;
        }

        await Promise.allSettled([removeLegacySensitiveAsyncKeys()]);
        await restoreBootstrapUser(t, { background: false });
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setInitializing(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, []);

  const login = useCallback(async ({ email, password, onNetworkRetrying } = {}) => {
    if (submittingRef.current) {
      return;
    }
    loginAbortRef.current?.abort();
    const ac = new AbortController();
    loginAbortRef.current = ac;
    submittingRef.current = true;
    setAuthSubmitting(true);
    try {
      const res =
        (await authService.login({
          email,
          password,
          signal: ac.signal,
          onRetrying: () => {
            if (!ac.signal.aborted) onNetworkRetrying?.('retrying');
          },
        })) || {};
      if (ac.signal.aborted) {
        return;
      }
      const u = res.user;
      const t = res.token;
      if (typeof t !== 'string' || !t || !u) {
        throw new Error('Invalid login response from server.');
      }
      setUser(u);
      setToken(t);
      setAuthToken(t);
      await removeLegacySensitiveAsyncKeys();
      await persistSession(t, u);
      return { user: u };
    } finally {
      if (loginAbortRef.current === ac) {
        loginAbortRef.current = null;
      }
      submittingRef.current = false;
      setAuthSubmitting(false);
      onNetworkRetrying?.('');
    }
  }, []);

  const signup = useCallback(async ({ name, email, password }) => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setAuthSubmitting(true);
    try {
      const res = (await authService.signup({ name, email, password })) || {};
      const u = res.user;
      const t = res.token;
      if (typeof t !== 'string' || !t || !u) {
        throw new Error('Invalid signup response from server.');
      }
      setUser(u);
      setToken(t);
      setAuthToken(t);
      await removeLegacySensitiveAsyncKeys();
      await persistSession(t, u);
      return { user: u };
    } finally {
      submittingRef.current = false;
      setAuthSubmitting(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    refreshUserAbortRef.current?.abort();
    const ac = new AbortController();
    refreshUserAbortRef.current = ac;
    try {
      const res = await api.get('/users/me', { signal: ac.signal });
      const freshUser = res?.data?.data?.user;
      if (refreshUserAbortRef.current !== ac) return null;
      if (freshUser && typeof freshUser === 'object') {
        setUser(freshUser);
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const t = parsed?.token;
        if (typeof t === 'string' && t.length > 0) {
          await persistSession(t, freshUser);
        }
        return freshUser;
      }
    } catch (e) {
      if (isRequestCancelled(e)) return null;
      // Swallow errors; global 401 handler logs auth issues separately.
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    const previousUserId = user?._id ?? user?.id ?? null;
    loginAbortRef.current?.abort();
    refreshUserAbortRef.current?.abort();
    clearAuthToken();
    setToken(null);
    setUser(null);
    setActiveCacheUserId(null);
    await invalidateSensitiveCachesOnLogout(previousUserId);
    clearTopicsCache();
    await clearStoredSession();
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      initializing,
      authSubmitting,
      login,
      signup,
      logout,
      refreshUser,
    }),
    [
      user,
      token,
      isAuthenticated,
      initializing,
      authSubmitting,
      login,
      signup,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
