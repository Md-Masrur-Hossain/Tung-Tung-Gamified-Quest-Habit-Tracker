import { Router } from 'express';
import { createQuestController, getQuestsController, completeQuestController } from '../controllers/questController';
import { authMiddleware } from '../middleware/authMiddleware';
import { body, param } from 'express-validator';

const router = Router();

// All routes are protected
router.use(authMiddleware);

router.post(
  '/',
  [
    body('title').isString().isLength({ min: 1 }).trim(),
    body('type').isIn(['daily', 'weekly', 'epic', 'boss', 'quick']),
    body('category').isIn(['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other']),
    body('difficulty').isIn(['easy', 'medium', 'hard', 'epic']),
    // description optional, deadline optional
  ],
  createQuestController
);

router.get('/', getQuestsController);

router.post(
  '/:id/complete',
  [param('id').isMongoId()],
  completeQuestController
);

export default router;
