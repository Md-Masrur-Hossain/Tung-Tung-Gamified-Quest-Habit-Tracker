// src/hooks/useQuestCreator.ts
// Sprint 8 fix: the quest-creation APIs already existed on the backend
// (POST /api/quests and POST /api/quick-quests) but nothing in the UI ever
// called them, so a new player had no way to add their first quest or quick
// quest. This hook wires the two existing endpoints to the Dashboard using
// the same authenticated axios client and error conventions as the other hooks.
import { useState } from 'react';
import api from '../lib/api';

export interface QuestDraft {
  title: string;
  description?: string;
  category: string;
  difficulty?: string;
}

const CATEGORIES = ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

export const useQuestCreator = (onCreated?: () => void | Promise<void>) => {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createQuest = async (draft: QuestDraft) => {
    setCreating(true);
    setError(null);
    try {
      const resp = await api.post('/api/quests', {
        title: draft.title,
        description: draft.description,
        type: 'daily',
        category: draft.category,
        difficulty: draft.difficulty || 'easy',
      });
      if (onCreated) await onCreated();
      return resp.data?.quest ?? resp.data;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not create quest.');
      return null;
    } finally {
      setCreating(false);
    }
  };

  const createQuickQuest = async (draft: QuestDraft) => {
    setCreating(true);
    setError(null);
    try {
      const resp = await api.post('/api/quick-quests', {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        difficulty: draft.difficulty || 'easy',
      });
      if (onCreated) await onCreated();
      return resp.data?.quest ?? resp.data;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not create quick quest.');
      return null;
    } finally {
      setCreating(false);
    }
  };

  return { creating, error, createQuest, createQuickQuest, categories: CATEGORIES, difficulties: DIFFICULTIES };
};

export default useQuestCreator;