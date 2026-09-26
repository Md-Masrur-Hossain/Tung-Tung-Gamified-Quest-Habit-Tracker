import { Router } from 'express';
import { getProgressionController } from '../controllers/progressionController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
router.get('/', getProgressionController);
export default router;
