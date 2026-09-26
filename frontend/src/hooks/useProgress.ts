// src/hooks/useProgress.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from './useAuth';

type Progression = {
  totalXP: number;
  level: number;
  xpForNext: number;
  progressPercent: number;
  currentStreak: number;
  longestStreak: number;
};

type UseProgressReturn = {
  progression: Progression | null;
  refresh: () => Promise<void>;
  previousLevel: number | null;
  previousStreak: number | null;
};

export const useProgress = (): UseProgressReturn => {
  const { token } = useAuth();
  const [progression, setProgression] = useState<Progression | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [previousStreak, setPreviousStreak] = useState<number | null>(null);
  // Keeps the latest progression without making fetchProgress depend on state,
  // so the callback identity stays stable and the effect cannot retrigger itself.
  const progressionRef = useRef<Progression | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await api.get('/api/progression');
      const data = resp.data.progression as Progression;
      // Capture the values seen before this fetch so the Dashboard can detect
      // a level-up / streak increase caused by this refetch.
      const current = progressionRef.current;
      setPreviousLevel(current ? current.level : null);
      setPreviousStreak(current ? current.currentStreak : null);
      progressionRef.current = data;
      setProgression(data);
    } catch (e) {
      console.error('Failed to fetch progression', e);
    }
  }, [token]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { progression, refresh: fetchProgress, previousLevel, previousStreak };
};
