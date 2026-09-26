// src/hooks/useAuth.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

type User = {
  _id: string;
  username: string;
  email: string;
  totalXP: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<User>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(() => !!localStorage.getItem('token'));
  const navigate = useNavigate();

  const login = async (email: string, password: string) => {
    const resp = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('token', resp.data.token);
    setToken(resp.data.token);
    setUser(resp.data.user);
    navigate('/dashboard');
  };

  const register = async (username: string, email: string, password: string) => {
    await api.post('/api/auth/register', { username, email, password });
    // after registration, automatically log in
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  const refreshUser = async () => {
    // Use stored token as fallback: on mount, setToken is async so the state
    // variable may still be null when this runs.
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken) {
      setLoading(false);
      throw new Error('No active session');
    }
    try {
      const resp = await api.get('/api/auth/me');
      const nextUser = resp.data.user as User;
      setUser(nextUser);
      return nextUser;
    } catch (err) {
      // Token expired or invalid — clear it
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // On mount, try to load token & user
  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (stored) {
      setToken(stored);
      // Call refreshUser directly — it reads from localStorage as fallback
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
