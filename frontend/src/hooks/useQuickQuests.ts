import { useEffect, useState } from 'react';
import { getQuickQuests } from '../lib/api';
import type { World } from '../types/worlds';

export interface QuickQuest {
  _id: string;
  title: string;
  description?: string;
  category: string;
  difficulty: string;
  xpReward: number;
  status: string;
}

export const useQuickQuests = (world?: World) => {
  const [quests, setQuests] = useState<QuickQuest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuests = async () => {
    setLoading(true);
    try {
      const params = world ? { category: world } : undefined;
      const response = await getQuickQuests(params);
      setQuests(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load quick quests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuests();
  }, [world]);

  return { quests, loading, error, refresh: fetchQuests };
};
