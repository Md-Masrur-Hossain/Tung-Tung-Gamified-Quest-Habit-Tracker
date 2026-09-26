import { Request, Response } from 'express';
import { createBoss, getBosses, getBossById, completeBossAction } from '../services/bossService';

// Create a new boss
export const createBossHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const boss = await createBoss(userId, req.body);
    res.status(201).json(boss);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// Get list of bosses (optional category filter)
export const listBossesHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const category = req.query.category as string | undefined;
    const bosses = await getBosses(userId, category);
    res.json(bosses);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// Get single boss by id
export const getBossHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const boss = await getBossById(userId, req.params.id);
    if (!boss) return res.status(404).json({ message: 'Boss not found' });
    res.json(boss);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// Complete a boss action
export const completeBossActionHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { bossId, actionId } = req.params;
    const result = await completeBossAction(userId, bossId, actionId);
    res.json(result);
  } catch (err: any) {
    const status = err.message === 'Not authorized' ? 403 : err.message === 'Action not found' || err.message === 'Boss not found' ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};
