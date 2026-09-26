import { Router } from 'express';
import { getLeaderboardHandler, listNotificationsHandler, markNotificationReadHandler, getDailyEventHandler } from '../controllers/liveController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All live endpoints require the same JWT auth as the rest of the API.
router.use(authMiddleware);

// GET /api/live/leaderboard?scope=global|friends - server-derived ranking only.
router.get('/leaderboard', getLeaderboardHandler);

// Sprint 6B: persisted notifications - always scoped to the authenticated user.
// There is intentionally NO client-facing create endpoint.
router.get('/notifications', listNotificationsHandler);
router.post('/notifications/:id/read', markNotificationReadHandler);

// Sprint 6C: today's deterministic event — server derives everything from
// the calendar date; query/body values are never read.
router.get('/daily-event', getDailyEventHandler);

export default router;