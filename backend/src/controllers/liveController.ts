import { Request, Response } from 'express';
import {
  getLeaderboard,
  FRIENDS_LEADERBOARD_MAX,
  LeaderboardScope,
} from '../services/leaderboardService';
import { listNotifications, markNotificationRead } from '../services/notificationService';
import { checkDailyEventRollover, getDailyEvent } from '../realtime/dailyEvent';

/**
 * GET /api/live/leaderboard?scope=global|friends[&limit=N]
 * Identity comes exclusively from the authenticated request (authMiddleware);
 * client-supplied rank/XP/level/userId values are never read.
 */
export const getLeaderboardHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const rawScope = typeof req.query.scope === 'string' ? req.query.scope : 'global';
    if (rawScope !== 'global' && rawScope !== 'friends') {
      return res.status(400).json({ message: 'Invalid leaderboard scope' });
    }
    const scope: LeaderboardScope = rawScope;

    let limit: number | undefined;
    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return res.status(400).json({ message: 'Invalid limit' });
      }
      // Honor the requested limit up to the hard maximum (20).
      limit = Math.min(parsed, FRIENDS_LEADERBOARD_MAX);
    }

    const snapshot = await getLeaderboard(scope, userId, limit);
    res.json(snapshot);
  } catch (err: any) {
    res.status(err.status || 400).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /api/live/notifications
 * The authenticated user's notifications only - identity from JWT, never query.
 */
export const listNotificationsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const notifications = await listNotifications(userId);
    res.json(notifications);
  } catch (err: any) {
    res.status(err.status || 400).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /api/live/notifications/:id/read
 * Marks read only within the authenticated user's own notifications
 * (foreign or malformed ids are rejected by the scoped service query).
 */
export const markNotificationReadHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const notification = await markNotificationRead(userId, String(req.params.id));
    res.json(notification);
  } catch (err: any) {
    res.status(err.status || 400).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /api/live/daily-event
 * Sprint 6C: today's deterministic event. Everything is derived from the
 * server's calendar date — query/body values (type, date, multiplier...)
 * are never read. Also nudges the lazy day-rollover check.
 */
export const getDailyEventHandler = async (_req: Request, res: Response) => {
  try {
    checkDailyEventRollover();
    res.json(getDailyEvent());
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};