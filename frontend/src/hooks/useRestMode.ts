// src/hooks/useRestMode.ts
// Sprint 7D UI: reads and toggles the player-owned Rest Mode preference via
// GET/POST /api/analytics/rest-mode (authenticated, own data only).
// The server owns ALL Rest Mode state and every recommendation rule — this
// hook only stores/returns what the server sends. It never invents a
// suggestion, never fabricates quest data, and never touches XP, coins,
// streak, rewards or quests. No polling, no realtime.
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export type RestSuggestionType =
  | 'QUICK_QUEST'
  | 'EASY_QUEST'
  | 'SMALL_QUEST'
  | 'QUIET_LOG'
  | 'NORMAL_MODE';

export interface RestModeSuggestion {
  type: RestSuggestionType;
  title: string;
  message: string;
  questId: string | null; // always a real pending quest owned by the caller
}

export interface RestModeResponse {
  enabled: boolean;
  mode: 'REST' | 'NORMAL';
  suggestion: RestModeSuggestion;
  context: {
    pendingQuests: number;
    lightweightQuests: number;
    currentStreak: number;
    progressionUnchanged: boolean;
  };
}

type UseRestModeReturn = {
  data: RestModeResponse | null;
  loading: boolean;
  error: string | null;
  toggling: boolean;
  toggleError: string | null;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};

const READ_ERROR = 'Could not load Rest Mode. Try again in a moment.';
const WRITE_ERROR = 'Rest Mode was not changed. Try again in a moment.';

export const useRestMode = (): UseRestModeReturn => {
  const [data, setData] = useState<RestModeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await api.get('/api/analytics/rest-mode');
      setData(resp.data as RestModeResponse); // server is the source of truth
      setError(null);
    } catch {
      // Stale-preserving: keep the last good state on screen, only flag the error.
      setError(READ_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setToggling(true);
    setToggleError(null);
    try {
      // Explicit preference toggle. The body carries ONLY { enabled } — the
      // server takes the player's identity from the auth token, never from input.
      const resp = await api.post('/api/analytics/rest-mode', { enabled });
      setData(resp.data as RestModeResponse); // update immediately, no page reload
      setError(null);
    } catch {
      // Nothing changed server-side — keep the previous state exactly as it was.
      setToggleError(WRITE_ERROR);
    } finally {
      setToggling(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, toggling, toggleError, refresh, setEnabled };
};

export default useRestMode;
