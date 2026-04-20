import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  login as apiLogin,
  fetchMe as apiFetchMe,
  setAuthToken,
} from '../services/api';

const STORAGE_KEY = 'ssbfy.admin.session';
const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(token, user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap: restore session, validate via /users/me, drop if invalid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStoredSession();
      if (!stored) {
        setInitializing(false);
        return;
      }
      setAuthToken(stored.token);
      try {
        const fresh = await apiFetchMe();
        if (cancelled) return;
        if (fresh) {
          setToken(stored.token);
          setUser(fresh);
          writeStoredSession(stored.token, fresh);
        } else {
          clearStoredSession();
          setAuthToken(null);
        }
      } catch {
        if (!cancelled) {
          clearStoredSession();
          setAuthToken(null);
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setSubmitting(true);
    try {
      const { user: u, token: t } = await apiLogin({ email, password });
      setAuthToken(t);
      setToken(t);
      setUser(u);
      writeStoredSession(t, u);
      return u;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    clearStoredSession();
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isAdmin: user?.role === 'admin',
      initializing,
      submitting,
      login,
      logout,
    }),
    [user, token, initializing, submitting, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
