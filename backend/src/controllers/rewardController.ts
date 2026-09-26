import { Request, Response } from 'express';
import {
  getAvailableShopItems,
  purchaseItem,
  getUserInventory,
  equipCosmetic,
  equipTitle,
  getUserAchievements,
  getPlayerProfile,
} from '../services/rewardService';

export const getShopItemsHandler = async (_req: Request, res: Response) => {
  try {
    const items = getAvailableShopItems();
    res.json(items);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const purchaseItemHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }
    const result = await purchaseItem(userId, itemId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getInventoryHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const inventory = await getUserInventory(userId);
    res.json(inventory);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const equipCosmeticHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }
    const result = await equipCosmetic(userId, itemId);
    res.json(result);
  } catch (err: any) {
    const status = err.message === 'Item not owned' ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const equipTitleHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    const result = await equipTitle(userId, title);
    res.json(result);
  } catch (err: any) {
    const status = err.message === 'Title not unlocked' ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const getAchievementsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const achievements = await getUserAchievements(userId);
    res.json(achievements);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getPlayerProfileHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const profile = await getPlayerProfile(userId);
    res.json(profile);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};
