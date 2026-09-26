import { Router } from 'express';
import { createBossHandler, listBossesHandler, getBossHandler, completeBossActionHandler } from '../controllers/bossController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
router.post('/', createBossHandler);
router.get('/', listBossesHandler);
router.get('/:id', getBossHandler);
router.post('/:bossId/actions/:actionId/complete', completeBossActionHandler);
export default router;
