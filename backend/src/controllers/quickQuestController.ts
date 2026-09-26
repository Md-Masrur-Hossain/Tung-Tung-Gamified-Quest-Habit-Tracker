import { Request, Response } from 'express';
import { createQuickQuest, completeQuickQuest, getQuickQuests } from '../services/quickQuestService';

// Create a quick quest
export const createQuickQuestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const quest = await createQuickQuest(userId, req.body);
    res.status(201).json(quest);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// List quick quests (supports optional category/world filter)
export const listQuickQuestsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const category = (req.query.category || req.query.world) as string | undefined;
    const quests = await getQuickQuests(userId, category);
    res.json(quests);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// Complete a quick quest
export const completeQuickQuestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await completeQuickQuest(userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({ message: err.message });
  }
};
