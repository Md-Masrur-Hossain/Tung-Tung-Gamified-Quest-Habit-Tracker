import { Router } from 'express';
import {
  getAnalyticsSummaryController,
  getNextActionController,
  getSuggestionsController,
  getRestModeController,
  setRestModeController,
} from '../controllers/analyticsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All analytics endpoints are read-only and protected by the same JWT auth.
router.use(authMiddleware);

// Sprint 7A: server-derived player analytics summary (own data only).
router.get('/summary', getAnalyticsSummaryController);

// Sprint 7B: deterministic "what should I do now?" engine — one advisory
// recommendation, server-derived, own data only, never writes anything.
router.get('/next-action', getNextActionController);

// Sprint 7C: deterministic Smart Suggestions — up to 3 advisory entries,
// server-derived, own data only, read-only, never writes anything.
router.get('/suggestions', getSuggestionsController);

// Sprint 7D: player-owned Rest Mode preference. GET is read-only; POST
// persists ONLY the preference flag (explicitly set by the player) and
// touches no XP, coins, streak, quest, reward or leaderboard data.
router.get('/rest-mode', getRestModeController);
router.post('/rest-mode', setRestModeController);

export default router;
