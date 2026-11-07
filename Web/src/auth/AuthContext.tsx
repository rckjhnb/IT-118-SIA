import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Config, type User } from '../lib/api';

interface AuthState {
  user: User | null;
  unread: number;
  config: Config;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const EMPTY: Config = { categories: [], locations: [], demo: false };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [unread, setUnread] = useState(0);
  const [config, setConfig] = useState<Config>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api<{ user: User | null; unread: number; config: Config }>('/me');
      setUser(d.user);
      setUnread(d.unread);
      setConfig(d.config);
    } catch {
      /* keep the last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  const value = useMemo(
    () => ({ user, unread, config, loading, refresh, setUser }),
    [user, unread, config, loading, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
