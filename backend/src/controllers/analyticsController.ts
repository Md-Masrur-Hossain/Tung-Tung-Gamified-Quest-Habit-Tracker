import { Request, Response } from 'express';
import { getAnalyticsSummary } from '../services/analyticsService';
import { getNextAction } from '../services/nextActionService';
import { getSuggestions } from '../services/suggestionsService';
import { getRestMode, setRestMode } from '../services/restModeService';

/**
 * GET /api/analytics/summary
 * Sprint 7A: read-only, server-derived player analytics. Identity comes
 * exclusively from the authenticated request (authMiddleware); any
 * userId supplied in query/body is never read.
 */
export const getAnalyticsSummaryController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const summary = await getAnalyticsSummary(userId);
    res.json(summary);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /api/analytics/next-action
 * Sprint 7B: single deterministic next-action recommendation. Identity
 * comes exclusively from the authenticated request; no query/body values
 * (userId, streak, stats...) are ever read.
 */
export const getNextActionController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await getNextAction(userId);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /api/analytics/suggestions
 * Sprint 7C: up to 3 deterministic smart suggestions. Identity comes
 * exclusively from the authenticated request; no query/body values
 * (userId, XP, streak, stats...) are ever read.
 */
export const getSuggestionsController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await getSuggestions(userId);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/**
 * GET /api/analytics/rest-mode
 * Sprint 7D: current Rest Mode state + a small read-only lighter-session
 * context. Identity comes exclusively from the authenticated request; no
 * query/body values (userId, state, ...) are ever read. Changes nothing.
 */
export const getRestModeController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await getRestMode(userId);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /api/analytics/rest-mode
 * Sprint 7D: explicit player-owned toggle. Body is `{ enabled: boolean }`
 * only — a client-supplied userId is ignored (auth is the only identity
 * source) and no progression field is ever touched. Idempotent.
 */
export const setRestModeController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await setRestMode(userId, (req.body || {}).enabled);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};
