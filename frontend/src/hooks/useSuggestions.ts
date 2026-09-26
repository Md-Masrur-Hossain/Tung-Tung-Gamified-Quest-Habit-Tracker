// src/hooks/useSuggestions.ts
// Sprint 7C UI: fetches the server-generated smart suggestions from
// GET /api/analytics/suggestions (authenticated). All suggestion rules
// live server-side — this hook only stores/returns the payload. No polling.
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export type SuggestionType =
  | 'STREAK'
  | 'WORLD_BALANCE'
  | 'MOMENTUM'
  | 'QUEST_BACKLOG'
  | 'RECENT_SUCCESS'
  | 'INACTIVE_PLAYER';

export interface SmartSuggestion {
  type: SuggestionType;
  title: string;
  message: string;
  world: string | null;
  metadata: Record<string, string | number | boolean | string[]>;
}

export interface SuggestionsResponse {
  suggestions: SmartSuggestion[]; // 0–3 entries
}

type UseSuggestionsReturn = {
  data: SuggestionsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useSuggestions = (): UseSuggestionsReturn => {
  const [data, setData] = useState<SuggestionsResponse | null>(null);
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
      const resp = await api.get('/api/analytics/suggestions');
      setData(resp.data as SuggestionsResponse);
      setError(null);
    } catch {
      setError('Could not load tips. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
};

export default useSuggestions;
