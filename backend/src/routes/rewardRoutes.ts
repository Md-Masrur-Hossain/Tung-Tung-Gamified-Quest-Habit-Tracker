import { Router } from 'express';
import {
  getShopItemsHandler,
  purchaseItemHandler,
  getInventoryHandler,
  equipCosmeticHandler,
  equipTitleHandler,
  getAchievementsHandler,
  getPlayerProfileHandler,
} from '../controllers/rewardController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All reward endpoints are owner-scoped and protected by JWT auth
router.use(authMiddleware);

router.get('/shop', getShopItemsHandler);
router.post('/shop/purchase', purchaseItemHandler);
router.get('/inventory', getInventoryHandler);
router.post('/cosmetics/equip', equipCosmeticHandler);
router.post('/titles/equip', equipTitleHandler);
router.get('/achievements', getAchievementsHandler);
router.get('/profile', getPlayerProfileHandler);

export default router;
