import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, getCsrfToken, setCsrfToken, SESSION_EXPIRED_EVENT } from '../services/api-client.js';

const AuthContext = createContext(null);
export { AuthContext };

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('resolving');
  const [user, setUser] = useState(null);

  const applyUser = useCallback((nextUser, csrfToken) => {
    if (csrfToken) {
      setCsrfToken(csrfToken);
    }
    setUser(nextUser);
    setStatus(nextUser ? 'authenticated' : 'unauthenticated');
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus('resolving');
    try {
      const csrf = await apiRequest('/auth/csrf');
      setCsrfToken(csrf?.data?.csrfToken);
      const me = await apiRequest('/auth/me');
      applyUser(me?.data?.user, me?.data?.csrfToken);
    } catch {
      applyUser(null);
    }
  }, [applyUser]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const ensureCsrf = useCallback(async () => {
    if (getCsrfToken()) {
      return;
    }
    const csrf = await apiRequest('/auth/csrf');
    if (!csrf?.data?.csrfToken) {
      throw new Error('Sign-in service is not available. The API is not running on this site.');
    }
    setCsrfToken(csrf.data.csrfToken);
  }, []);

  useEffect(() => {
    function onExpired() {
      setCsrfToken('');
      applyUser(null);
      ensureCsrf().catch(() => setCsrfToken(''));
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [applyUser, ensureCsrf]);

  const login = useCallback(
    async ({ identifier, password }) => {
      await ensureCsrf();
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (!result?.data?.user) {
        throw new Error('Sign-in service is not available. The API is not running on this site.');
      }
      applyUser(result.data.user, result.data.csrfToken);
      return result.data.user;
    },
    [applyUser, ensureCsrf],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken('');
      applyUser(null);
      try {
        await ensureCsrf();
      } catch {
        setCsrfToken('');
      }
    }
  }, [applyUser, ensureCsrf]);

  const value = useMemo(
    () => ({ status, user, login, logout, bootstrap }),
    [status, user, login, logout, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
