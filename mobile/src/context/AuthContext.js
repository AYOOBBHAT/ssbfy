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
import api, { setAuthToken, clearAuthToken } from '../services/api';
import { clearTopicsCache } from '../services/topicService';

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

  const isAuthenticated = !!token;

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) {
          return;
        }
        if (raw) {
          const parsed = JSON.parse(raw);
          const t = parsed?.token;
          if (typeof t === 'string' && t.length > 0) {
            setToken(t);
            setAuthToken(t);
            try {
              const res = await api.get('/users/me');
              const freshUser = res?.data?.data?.user;
              if (freshUser && typeof freshUser === 'object') {
                setUser(freshUser);
                await persistSession(t, freshUser);
              }
            } catch {
              await clearStoredSession();
              setToken(null);
              setUser(null);
              clearAuthToken();
            }
          }
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setAuthSubmitting(true);
    try {
      const res = (await authService.login({ email, password })) || {};
      const u = res.user;
      const t = res.token;
      if (typeof t !== 'string' || !t || !u) {
        throw new Error('Invalid login response from server.');
      }
      setUser(u);
      setToken(t);
      setAuthToken(t);
      await persistSession(t, u);
      return { user: u };
    } finally {
      submittingRef.current = false;
      setAuthSubmitting(false);
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
      await persistSession(t, u);
      return { user: u };
    } finally {
      submittingRef.current = false;
      setAuthSubmitting(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/users/me');
      const freshUser = res?.data?.data?.user;
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
    } catch {
      // Swallow errors; global 401 handler logs auth issues separately.
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    clearAuthToken();
    clearTopicsCache();
    await clearStoredSession();
  }, []);

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
