import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, getStoredToken, setStoredToken, clearStoredToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(getStoredToken()));
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Invalid session');
        const userData = await res.json();
        if (isMounted) {
          setUser(userData);
          setAuthNotice('');
        }
      } catch {
        clearStoredToken();
        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setIsAuthLoading(false);
      }
    };

    verifySession();
    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredToken();
      setToken(null);
      setUser(null);
      setIsAuthLoading(false);
      setAuthNotice('Your session has expired. Please sign in again.');
    };

    window.addEventListener('smartclass:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('smartclass:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthNotice('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.detail || 'Invalid username or password' };
      }

      setStoredToken(data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      setIsAuthLoading(false);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Cannot connect to backend server. Please try again.' };
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setIsAuthLoading(false);
    setAuthNotice('');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAdmin: user?.role === 'admin',
        isAuthLoading,
        authNotice,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
