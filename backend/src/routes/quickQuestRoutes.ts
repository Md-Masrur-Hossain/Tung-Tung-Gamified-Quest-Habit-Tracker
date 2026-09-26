import { Router } from 'express';
import { createQuickQuestHandler, listQuickQuestsHandler, completeQuickQuestHandler } from '../controllers/quickQuestController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
router.post('/', createQuickQuestHandler);
router.get('/', listQuickQuestsHandler);
router.post('/:id/complete', completeQuickQuestHandler);
export default router;
