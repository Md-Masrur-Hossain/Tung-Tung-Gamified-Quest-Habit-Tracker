import { Request, Response } from 'express';
import { createQuest, completeQuest, getQuests } from '../services/questService';
import { validationResult } from 'express-validator';

export const createQuestController = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Invalid input', errors: errors.array() });
  }
  const userId = (req as any).user.id;
  try {
    const quest = await createQuest(userId, req.body);
    res.status(201).json({ quest });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

export const getQuestsController = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const status = req.query.status as string | undefined;
  try {
    const quests = await getQuests(userId, { status });
    res.json({ quests });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

export const completeQuestController = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const questId = req.params.id;
  try {
    const result = await completeQuest(userId, questId);
    // Random reaction messages pool
    const reactions = [
      'QUEST CLEARED! 🔥',
      "Look who decided to be productive.",
      'Nice. One less thing haunting you.',
      'XP acquired. 😎',
    ];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    res.json({ ...result, reaction });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
