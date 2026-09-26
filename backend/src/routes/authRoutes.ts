import { Router } from 'express';
import { registerController, loginController, getMeController } from '../controllers/authController';
import { body } from 'express-validator';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post(
  '/register',
  [
    body('username').isString().isLength({ min: 2 }).trim(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  registerController
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  loginController
);

// Protected route to fetch current user profile
router.get('/me', authMiddleware, getMeController);

export default router;
