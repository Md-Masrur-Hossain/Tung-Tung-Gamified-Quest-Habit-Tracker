import { Request, Response } from 'express';
import { User } from '../models/User';
import { validationResult } from 'express-validator';
import { register, login } from '../services/authService';

export const registerController = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Invalid input', errors: errors.array() });
  }
  const { username, email, password } = req.body;
  try {
    const user = await register(username, email, password);
    const { passwordHash, ...userData } = user.toObject();
    res.status(201).json({ user: userData });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

export const loginController = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Invalid input', errors: errors.array() });
  }
  const { email, password } = req.body;
  try {
    const { token, user } = await login(email, password);
    const { passwordHash, ...userData } = user.toObject();
    res.json({ token, user: userData });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

export const getMeController = async (req: Request, res: Response) => {
  // authMiddleware attaches req.user
  const userId = (req as any).user.id;
  try {
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
