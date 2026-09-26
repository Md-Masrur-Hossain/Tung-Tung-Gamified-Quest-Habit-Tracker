import { Router } from 'express';
import {
  searchUsersHandler,
  sendFriendRequestHandler,
  acceptFriendRequestHandler,
  rejectFriendRequestHandler,
  getFriendsHandler,
  getIncomingRequestsHandler,
  getOutgoingRequestsHandler,
  removeFriendHandler,
  createPartyHandler,
  getPartyHandler,
  getUserPartiesHandler,
  inviteToPartyHandler,
  removeFromPartyHandler,
  leavePartyHandler,
  createCoopQuestHandler,
  getPartyCoopQuestsHandler,
  contributeToCoopQuestHandler,
  createChallengeHandler,
  acceptChallengeHandler,
  declineChallengeHandler,
  getUserChallengesHandler,
  recordChallengeProgressHandler,
} from '../controllers/socialController';
import { authMiddleware } from '../middleware/authMiddleware';
import { body, param } from 'express-validator';

const router = Router();

// All social routes require authentication
router.use(authMiddleware);

// FRIEND routes
router.get('/friends/search', [param('q').optional().isString()], searchUsersHandler);
router.post('/friends/requests', [body('recipientId').isString()], sendFriendRequestHandler);
router.post('/friends/requests/:id/accept', acceptFriendRequestHandler);
router.post('/friends/requests/:id/reject', rejectFriendRequestHandler);
router.get('/friends', getFriendsHandler);
router.get('/friends/requests/incoming', getIncomingRequestsHandler);
router.get('/friends/requests/outgoing', getOutgoingRequestsHandler);
router.delete('/friends/:friendId', removeFriendHandler);

// PARTY routes
router.post('/parties', [body('name').isString().optional()], createPartyHandler);
router.get('/parties/:id', getPartyHandler);
router.get('/parties', getUserPartiesHandler);
router.post('/parties/:id/invite', [body('friendId').isString()], inviteToPartyHandler);
router.delete('/parties/:id/members/:memberId', removeFromPartyHandler);
router.post('/parties/:id/leave', leavePartyHandler);

// CO-OP QUEST routes
router.post('/coop-quests', [
  body('partyId').isString(),
  body('title').isString().isLength({ min: 1 }),
  body('category').isString(),
  body('targetCount').optional().isInt({ min: 1, max: 4 }),
], createCoopQuestHandler);
router.get('/parties/:partyId/coop-quests', getPartyCoopQuestsHandler);
router.post('/coop-quests/:id/contribute', contributeToCoopQuestHandler);

// CHALLENGE routes
router.post('/challenges', [
  body('challengedId').isString(),
  body('title').isString().isLength({ min: 1 }),
  body('goalType').isIn(['QUEST_COUNT', 'XP_EARNED', 'STREAK']),
  body('target').isInt({ min: 1 })
], createChallengeHandler);
router.post('/challenges/:id/accept', acceptChallengeHandler);
router.post('/challenges/:id/decline', declineChallengeHandler);
router.get('/challenges', getUserChallengesHandler);
// Progress sync: client cannot submit progressAmount / winner / result.
// Body is intentionally not validated for gameplay values.
router.post('/challenges/:id/progress', recordChallengeProgressHandler);

export default router;
