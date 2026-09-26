import { useEffect, useState } from 'react';
import { getBosses } from '../lib/api';
import type { World } from '../types/worlds';

export interface Boss {
  _id: string;
  title: string;
  description?: string;
  category: string;
  maxHp: number;
  currentHp: number;
  status: 'ACTIVE' | 'DEFEATED';
  actions: BossAction[];
}

export interface BossAction {
  _id: string;
  title: string;
  damage: number;
  xpReward?: number;
  completed: boolean;
}

export const useBosses = (world?: World) => {
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBosses = async () => {
    setLoading(true);
    try {
      const params = world ? { category: world } : undefined;
      const response = await getBosses(params);
      setBosses(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load bosses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBosses();
  }, [world]);

  return { bosses, loading, error, refresh: fetchBosses };
};
