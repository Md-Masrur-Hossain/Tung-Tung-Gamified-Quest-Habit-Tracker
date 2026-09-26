// src/hooks/useNextAction.ts
// Sprint 7B UI: fetches the server-generated recommendation from
// GET /api/analytics/next-action (authenticated). All decision logic lives
// server-side — this hook only stores/returns the payload. No polling.
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export type NextActionType = 'COMPLETE_QUEST' | 'CREATE_QUICK_QUEST';

export type NextActionPriority =
  | 'OVERDUE'
  | 'STREAK'
  | 'FRESH_WORLD'
  | 'NEXT_QUEST'
  | 'MOMENTUM'
  | 'GET_STARTED'
  | 'QUICK_START';

export interface NextActionResponse {
  recommendation: {
    actionType: NextActionType;
    title: string;
    reason: string;
    questId: string | null;
    world: string | null;
    priority: NextActionPriority;
    metadata: {
      currentStreak: number;
      streakAtRisk: boolean;
      pendingQuests: number;
      recentWorlds: string[];
    };
  };
  context: {
    hasQuests: boolean;
    totalQuests: number;
    pendingQuests: number;
    completedToday: boolean;
    activeLast7Days: boolean;
  };
}

type UseNextActionReturn = {
  data: NextActionResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useNextAction = (): UseNextActionReturn => {
  const [data, setData] = useState<NextActionResponse | null>(null);
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
      const resp = await api.get('/api/analytics/next-action');
      setData(resp.data as NextActionResponse);
      setError(null);
    } catch {
      setError('Could not load your recommendation. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
};

export default useNextAction;
