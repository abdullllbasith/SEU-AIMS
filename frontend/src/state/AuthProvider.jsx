import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, setCsrfToken, SESSION_EXPIRED_EVENT } from '../services/api-client.js';

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
      setCsrfToken(csrf.data.csrfToken);
      const me = await apiRequest('/auth/me');
      applyUser(me.data.user, me.data.csrfToken);
    } catch {
      applyUser(null);
    }
  }, [applyUser]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    function onExpired() {
      setCsrfToken('');
      applyUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [applyUser]);

  const login = useCallback(
    async ({ identifier, password }) => {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      applyUser(result.data.user, result.data.csrfToken);
      return result.data.user;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken('');
      applyUser(null);
    }
  }, [applyUser]);

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
