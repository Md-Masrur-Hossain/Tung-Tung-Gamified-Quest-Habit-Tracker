import { Request, Response } from 'express';
import { getProgression } from '../services/progressionService';

export const getProgressionController = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    const progression = await getProgression(userId);
    res.json({ progression });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
