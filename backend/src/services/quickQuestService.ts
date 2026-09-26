import { Types } from 'mongoose';
import { Quest, IQuest, QuestType } from '../models/Quest';
import { calculateXpReward } from './progressionService';
import { normalizeWorld } from '../constants/worlds';

/**
 * Create a quick quest. It forces type 'quick' and uses existing calculateXpReward logic.
 */
export const createQuickQuest = async (
  userId: string,
  data: {
    title: string;
    description?: string;
    category: string;
    difficulty?: string;
    deadline?: Date;
  }
) => {
  if (!userId) {
    throw new Error('User ID is required');
  }
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Quick Quest title is required');
  }

  const category = normalizeWorld(data.category);
  const difficulty = data.difficulty || 'easy';
  const xpReward = calculateXpReward('quick', difficulty);

  const quest = await Quest.create({
    owner: new Types.ObjectId(userId),
    title: data.title.trim(),
    description: data.description,
    type: 'quick' as QuestType,
    category,
    difficulty,
    xpReward,
    status: 'pending',
    deadline: data.deadline,
  });
  return quest;
};

/**
 * Complete a quick quest, delegating to existing quest completion logic.
 */
export const completeQuickQuest = async (userId: string, questId: string) => {
  const { completeQuest } = await import('./questService');
  return completeQuest(new Types.ObjectId(userId), questId);
};

/**
 * Get quick quests for a user, optionally filtered by category/world.
 */
export const getQuickQuests = async (userId: string, category?: string) => {
  const query: any = { owner: new Types.ObjectId(userId), type: 'quick' };
  if (category) {
    query.category = normalizeWorld(category);
  }
  return Quest.find(query).sort({ createdAt: -1 });
};
