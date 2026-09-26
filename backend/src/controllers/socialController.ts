import { Request, Response } from 'express';
import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  removeFriend,
  createParty,
  getPartyById,
  getUserParties,
  inviteToParty,
  removeFromParty,
  leaveParty,
  createCoopQuest,
  getPartyCoopQuests,
  contributeToCoopQuest,
  createChallenge,
  acceptChallenge,
  declineChallenge,
  getUserChallenges,
  recordChallengeProgress,
} from '../services/socialService';

/* ==========================================================================
   FRIEND CONTROLLERS
   ========================================================================== */

export const searchUsersHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const query = req.query.q as string;
    const users = await searchUsers(userId, query || '');
    res.json(users);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const sendFriendRequestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient identifier is required' });
    }
    const result = await sendFriendRequest(userId, recipientId);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const acceptFriendRequestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await acceptFriendRequest(userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const rejectFriendRequestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await rejectFriendRequest(userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const getFriendsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const friends = await getFriends(userId);
    res.json(friends);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getIncomingRequestsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const requests = await getIncomingRequests(userId);
    res.json(requests);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getOutgoingRequestsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const requests = await getOutgoingRequests(userId);
    res.json(requests);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const removeFriendHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await removeFriend(userId, req.params.friendId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

/* ==========================================================================
   PARTY CONTROLLERS
   ========================================================================== */

export const createPartyHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body;
    const party = await createParty(userId, name);
    res.status(201).json(party);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getPartyHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const party = await getPartyById(userId, req.params.id);
    res.json(party);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 404;
    res.status(status).json({ message: err.message });
  }
};

export const getUserPartiesHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const parties = await getUserParties(userId);
    res.json(parties);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const inviteToPartyHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).json({ message: 'Friend ID is required' });
    }
    const party = await inviteToParty(userId, req.params.id, friendId);
    res.json(party);
  } catch (err: any) {
    const status = err.message.includes('Only the party leader') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const removeFromPartyHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { memberId } = req.params;
    const party = await removeFromParty(userId, req.params.id, memberId);
    res.json(party);
  } catch (err: any) {
    const status = err.message.includes('Only the party leader') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const leavePartyHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const party = await leaveParty(userId, req.params.id);
    res.json(party);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

/* ==========================================================================
   CO-OP QUEST CONTROLLERS
   ========================================================================== */

export const createCoopQuestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const quest = await createCoopQuest(userId, req.body);
    res.status(201).json(quest);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const getPartyCoopQuestsHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const quests = await getPartyCoopQuests(userId, req.params.partyId);
    res.json(quests);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const contributeToCoopQuestHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await contributeToCoopQuest(userId, req.params.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('Only party members') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

/* ==========================================================================
   CHALLENGE CONTROLLERS
   ========================================================================== */

export const createChallengeHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const challenge = await createChallenge(userId, req.body);
    res.status(201).json(challenge);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const acceptChallengeHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const challenge = await acceptChallenge(userId, req.params.id);
    res.json(challenge);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const declineChallengeHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const challenge = await declineChallenge(userId, req.params.id);
    res.json(challenge);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};

export const getUserChallengesHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const challenges = await getUserChallenges(userId);
    res.json(challenges);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const recordChallengeProgressHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    // NOTE: no progressAmount/winner/result is read from the client.
    // Progress is always derived server-side from real gameplay data.
    const challenge = await recordChallengeProgress(userId, req.params.id);
    res.json(challenge);
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ message: err.message });
  }
};
