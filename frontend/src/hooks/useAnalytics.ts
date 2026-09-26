// src/hooks/useAnalytics.ts
// Sprint 7A: fetches the server-derived player analytics summary from
// GET /api/analytics/summary (authenticated, own data only). The server
// does all calculations — this hook only stores/returns them.
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export interface DayActivity {
  date: string; // YYYY-MM-DD (UTC)
  questsCompleted: number;
  xpEarned: number;
}

export interface WindowActivity {
  questsCompleted: number;
  xpEarned: number;
}

export interface WorldActivity {
  world: string;
  completedQuests: number;
}

export interface AnalyticsSummary {
  overview: {
    level: number;
    totalXP: number;
    currentStreak: number;
    longestStreak: number;
    totalQuests: number;
    totalQuestsCompleted: number;
    completionRate: number | null;
  };
  recent: {
    today: WindowActivity;
    last7Days: WindowActivity & { activeDays: number };
    previous7Days: WindowActivity;
    byDay: DayActivity[];
  };
  worlds: {
    activity: WorldActivity[];
    mostActiveWorld: string | null;
  };
}

type UseAnalyticsReturn = {
  summary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useAnalytics = (): UseAnalyticsReturn => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await api.get('/api/analytics/summary');
      setSummary(resp.data as AnalyticsSummary);
      setError(null);
    } catch {
      setError('Could not load your stats. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
};

export default useAnalytics;
