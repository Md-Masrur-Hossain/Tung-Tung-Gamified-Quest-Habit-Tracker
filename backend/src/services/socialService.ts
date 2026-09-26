import { Types } from 'mongoose';
import { User, IUser } from '../models/User';
import { Friendship, IFriendship } from '../models/Friendship';
import { Party, IParty } from '../models/Party';
import { CoopQuest, ICoopQuest } from '../models/CoopQuest';
import { Challenge, IChallenge, ChallengeGoalType } from '../models/Challenge';
import { awardXp } from './progressionService';
import { awardCoins, calculateCoinReward } from './rewardService';
import { calculateXpReward } from './progressionService';
import { normalizeWorld } from '../constants/worlds';

// Safe user projection for social search & member lists
export const SAFE_USER_FIELDS = 'username level equippedAvatar equippedFrame equippedTitle';

const VALID_COOP_DIFFICULTIES = ['easy', 'medium', 'hard', 'epic'] as const;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectIdString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return (value as { toString: () => string }).toString();
  } catch {
    return '';
  }
};

/**
 * Derive real gameplay metrics for challenge progress from backend user data.
 * This is the ONLY source of truth for challenge progress; the client can
 * never set progress/result directly.
 */
export const getGameplayMetric = (user: IUser, goalType: ChallengeGoalType): number => {
  if (!user) return 0;
  if (goalType === 'QUEST_COUNT') return user.stats?.questsCompleted || 0;
  if (goalType === 'XP_EARNED') return user.totalXP || 0;
  if (goalType === 'STREAK') return user.longestStreak || 0;
  return 0;
};

/* ==========================================================================
   1. FRIEND SYSTEM
   ========================================================================== */

/**
 * Search users by username safely (excludes requesting user, returns safe public fields only).
 */
export const searchUsers = async (currentUserId: string, query: string) => {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }
  const safeQuery = escapeRegExp(query.trim()).slice(0, 64);
  return User.find({
    _id: { $ne: new Types.ObjectId(currentUserId) },
    username: { $regex: safeQuery, $options: 'i' },
  })
    .select(SAFE_USER_FIELDS)
    .limit(10);
};

/**
 * Send a friend request.
 */
export const sendFriendRequest = async (requesterId: string, recipientIdOrUsername: string) => {
  if (!Types.ObjectId.isValid(requesterId)) {
    throw new Error('Invalid requester');
  }
  let recipient: IUser | null = null;
  if (Types.ObjectId.isValid(recipientIdOrUsername)) {
    recipient = await User.findById(recipientIdOrUsername);
  }
  if (!recipient) {
    recipient = await User.findOne({ username: recipientIdOrUsername });
  }
  if (!recipient) {
    throw new Error('Recipient user not found');
  }

  const recipientId = recipient._id.toString();

  // Self friend request validation
  if (requesterId === recipientId) {
    throw new Error('Cannot send a friend request to yourself');
  }

  // Check for existing relationship in either direction
  const existing = await Friendship.findOne({
    $or: [
      { requester: new Types.ObjectId(requesterId), recipient: new Types.ObjectId(recipientId) },
      { requester: new Types.ObjectId(recipientId), recipient: new Types.ObjectId(requesterId) },
    ],
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      throw new Error('Already friends');
    }
    if (existing.status === 'PENDING') {
      throw new Error('Friend request already pending');
    }
    if (existing.status === 'REJECTED') {
      // Re-activate request
      existing.requester = new Types.ObjectId(requesterId);
      existing.recipient = new Types.ObjectId(recipientId);
      existing.status = 'PENDING';
      await existing.save();
      return existing;
    }
  }

  const friendship = await Friendship.create({
    requester: new Types.ObjectId(requesterId),
    recipient: new Types.ObjectId(recipientId),
    status: 'PENDING',
  });

  return friendship;
};

/**
 * Accept a friend request. Only the intended recipient can accept.
 */
export const acceptFriendRequest = async (userId: string, requestId: string) => {
  if (!Types.ObjectId.isValid(requestId)) {
    throw new Error('Friend request not found');
  }
  const friendship = await Friendship.findById(new Types.ObjectId(requestId));
  if (!friendship) {
    throw new Error('Friend request not found');
  }

  if (friendship.recipient.toString() !== userId) {
    throw new Error('Not authorized to accept this friend request');
  }

  if (friendship.status === 'ACCEPTED') {
    throw new Error('Friend request already accepted');
  }

  friendship.status = 'ACCEPTED';
  await friendship.save();

  return friendship;
};

/**
 * Reject a friend request. Only the recipient can reject.
 */
export const rejectFriendRequest = async (userId: string, requestId: string) => {
  if (!Types.ObjectId.isValid(requestId)) {
    throw new Error('Friend request not found');
  }
  const friendship = await Friendship.findById(new Types.ObjectId(requestId));
  if (!friendship) {
    throw new Error('Friend request not found');
  }

  if (friendship.recipient.toString() !== userId) {
    throw new Error('Not authorized to reject this friend request');
  }

  friendship.status = 'REJECTED';
  await friendship.save();
  return friendship;
};

/**
 * Get all accepted friends for a user.
 */
export const getFriends = async (userId: string) => {
  const friendships = await Friendship.find({
    $or: [{ requester: new Types.ObjectId(userId) }, { recipient: new Types.ObjectId(userId) }],
    status: 'ACCEPTED',
  })
    .populate('requester', SAFE_USER_FIELDS)
    .populate('recipient', SAFE_USER_FIELDS);

  return friendships.map((f) => {
    const isRequester = (f.requester as any)._id?.toString() === userId;
    const friendData = isRequester ? f.recipient : f.requester;
    return {
      friendshipId: f._id,
      friend: friendData,
      createdAt: f.createdAt,
    };
  });
};

/**
 * Get incoming pending friend requests.
 */
export const getIncomingRequests = async (userId: string) => {
  return Friendship.find({
    recipient: new Types.ObjectId(userId),
    status: 'PENDING',
  }).populate('requester', SAFE_USER_FIELDS);
};

/**
 * Get outgoing pending friend requests.
 */
export const getOutgoingRequests = async (userId: string) => {
  return Friendship.find({
    requester: new Types.ObjectId(userId),
    status: 'PENDING',
  }).populate('recipient', SAFE_USER_FIELDS);
};

/**
 * Remove an existing friendship.
 */
export const removeFriend = async (userId: string, friendId: string) => {
  if (!Types.ObjectId.isValid(friendId)) {
    throw new Error('Friendship not found');
  }
  const friendship = await Friendship.findOne({
    $or: [
      { requester: new Types.ObjectId(userId), recipient: new Types.ObjectId(friendId) },
      { requester: new Types.ObjectId(friendId), recipient: new Types.ObjectId(userId) },
    ],
    status: 'ACCEPTED',
  });

  if (!friendship) {
    throw new Error('Friendship not found');
  }

  await Friendship.findByIdAndDelete(friendship._id);
  return { message: 'Friend removed successfully' };
};

/**
 * Helper to verify two users are accepted friends.
 */
export const areFriends = async (userAId: string, userBId: string): Promise<boolean> => {
  const friendship = await Friendship.findOne({
    $or: [
      { requester: new Types.ObjectId(userAId), recipient: new Types.ObjectId(userBId) },
      { requester: new Types.ObjectId(userBId), recipient: new Types.ObjectId(userAId) },
    ],
    status: 'ACCEPTED',
  });
  return !!friendship;
};

/* ==========================================================================
   2. PARTY SYSTEM
   ========================================================================== */

/**
 * Create a new party. Creator becomes the initial leader and member.
 */
export const createParty = async (userId: string, name: string) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user');
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Party name is required');
  }
  if (name.trim().length > 60) {
    throw new Error('Party name is too long');
  }

  const party = await Party.create({
    name: name.trim(),
    leader: new Types.ObjectId(userId),
    members: [new Types.ObjectId(userId)],
    status: 'ACTIVE',
  });

  return party;
};

/**
 * Get party details by ID if the requesting user is a member.
 */
export const getPartyById = async (userId: string, partyId: string) => {
  if (!Types.ObjectId.isValid(partyId)) {
    throw new Error('Party not found');
  }
  const party = await Party.findOne({
    _id: new Types.ObjectId(partyId),
    status: 'ACTIVE',
  })
    .populate('leader', SAFE_USER_FIELDS)
    .populate('members', SAFE_USER_FIELDS);

  if (!party) {
    throw new Error('Party not found');
  }

  const isMember = party.members.some((m: any) => toObjectIdString(m._id || m) === userId);
  if (!isMember) {
    throw new Error('Not authorized to access this party');
  }

  return party;
};

/**
 * Get all active parties the user belongs to.
 */
export const getUserParties = async (userId: string) => {
  return Party.find({
    members: new Types.ObjectId(userId),
    status: 'ACTIVE',
  })
    .populate('leader', SAFE_USER_FIELDS)
    .populate('members', SAFE_USER_FIELDS);
};

/**
 * Invite a friend to a party. Only the party leader can invite, and max size is 4.
 */
export const inviteToParty = async (leaderId: string, partyId: string, friendId: string) => {
  if (!Types.ObjectId.isValid(partyId) || !Types.ObjectId.isValid(friendId)) {
    throw new Error('Party not found or inactive');
  }
  const party = await Party.findById(new Types.ObjectId(partyId));
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  if (party.leader.toString() !== leaderId) {
    throw new Error('Only the party leader can invite members');
  }

  if (party.members.length >= 4) {
    throw new Error('Party is full (maximum 4 members)');
  }

  const isAlreadyMember = party.members.some((m) => m.toString() === friendId);
  if (isAlreadyMember) {
    throw new Error('User is already a member of this party');
  }

  const invitedUser = await User.findById(friendId);
  if (!invitedUser) {
    throw new Error('Invited user not found');
  }

  // Must be friends with the leader
  const isFriend = await areFriends(leaderId, friendId);
  if (!isFriend) {
    throw new Error('Can only invite confirmed friends to your party');
  }

  party.members.push(new Types.ObjectId(friendId));
  await party.save();

  return party;
};

/**
 * Remove a member from the party. Only the leader can remove.
 */
export const removeFromParty = async (leaderId: string, partyId: string, memberIdToRemove: string) => {
  if (!Types.ObjectId.isValid(partyId) || !Types.ObjectId.isValid(memberIdToRemove)) {
    throw new Error('Party not found or inactive');
  }
  const party = await Party.findById(new Types.ObjectId(partyId));
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  if (party.leader.toString() !== leaderId) {
    throw new Error('Only the party leader can remove members');
  }

  if (memberIdToRemove === leaderId) {
    throw new Error('Party leader cannot remove themselves with this action; use leaveParty instead');
  }

  party.members = party.members.filter((m) => m.toString() !== memberIdToRemove);
  await party.save();

  return party;
};

/**
 * Member leaves party safely. If leader leaves, leadership transfers or party disbands.
 */
export const leaveParty = async (userId: string, partyId: string) => {
  if (!Types.ObjectId.isValid(partyId)) {
    throw new Error('Party not found or inactive');
  }
  const party = await Party.findById(new Types.ObjectId(partyId));
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  const isMember = party.members.some((m) => m.toString() === userId);
  if (!isMember) {
    throw new Error('Not a member of this party');
  }

  party.members = party.members.filter((m) => m.toString() !== userId);

  if (party.leader.toString() === userId) {
    if (party.members.length > 0) {
      // Transfer leadership to next available member
      party.leader = party.members[0];
    } else {
      // Disband party if no members remain
      party.status = 'DISBANDED';
    }
  }

  await party.save();

  return party;
};

/* ==========================================================================
   3. CO-OP QUESTS
   ========================================================================== */

/* ==========================================================================
   3. CO-OP QUESTS
   ========================================================================== */

/**
 * Create a cooperative quest for a party.
 */
export const createCoopQuest = async (
  userId: string,
  data: {
    partyId: string;
    title: string;
    description?: string;
    category: string;
    targetCount?: number;
    difficulty?: string;
  }
) => {
  if (!Types.ObjectId.isValid(data.partyId)) {
    throw new Error('Party not found or inactive');
  }
  const party = await Party.findById(new Types.ObjectId(data.partyId));
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  const isMember = party.members.some((m) => m.toString() === userId);
  if (!isMember) {
    throw new Error('Only party members can create co-op quests');
  }

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Co-op quest title is required');
  }
  if (data.title.trim().length > 120) {
    throw new Error('Co-op quest title is too long');
  }
  if (data.description && data.description.length > 500) {
    throw new Error('Co-op quest description is too long');
  }

  const category = normalizeWorld(data.category);
  const rawTarget = Number(data.targetCount);
  const targetCount =
    data.targetCount === undefined || data.targetCount === null
      ? party.members.length
      : rawTarget;
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 4) {
    throw new Error('targetCount must be an integer between 1 and 4');
  }
  const rawDifficulty = typeof data.difficulty === 'string' ? data.difficulty.toLowerCase() : 'medium';
  const difficulty = (VALID_COOP_DIFFICULTIES as readonly string[]).includes(rawDifficulty)
    ? rawDifficulty
    : 'medium';

  const xpReward = calculateXpReward('epic', difficulty);
  const coinReward = calculateCoinReward('epic', difficulty);

  const coopQuest = await CoopQuest.create({
    party: new Types.ObjectId(data.partyId),
    creator: new Types.ObjectId(userId),
    title: data.title.trim(),
    description: data.description,
    category,
    targetCount,
    contributions: [],
    xpReward,
    coinReward,
    status: 'pending',
  });

  return coopQuest;
};

/**
 * Get all co-op quests for a party.
 */
export const getPartyCoopQuests = async (userId: string, partyId: string) => {
  if (!Types.ObjectId.isValid(partyId)) {
    throw new Error('Party not found or inactive');
  }
  const party = await Party.findById(new Types.ObjectId(partyId));
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  const isMember = party.members.some((m) => m.toString() === userId);
  if (!isMember) {
    throw new Error('Not authorized to view co-op quests for this party');
  }

  return CoopQuest.find({ party: new Types.ObjectId(partyId) })
    .populate('creator', SAFE_USER_FIELDS)
    .populate('contributions.userId', SAFE_USER_FIELDS)
    .sort({ createdAt: -1 });
};

/**
 * Contribute to a co-op quest.
 * - Validates party membership.
 * - Prevents duplicate contribution.
 * - When target contribution count is met, quest completes and awards XP/Coins to all contributors.
 */
export const contributeToCoopQuest = async (userId: string, coopQuestId: string) => {
  if (!Types.ObjectId.isValid(coopQuestId)) {
    throw new Error('Co-op quest not found');
  }
  const coopQuest = await CoopQuest.findById(new Types.ObjectId(coopQuestId));
  if (!coopQuest) {
    throw new Error('Co-op quest not found');
  }

  if (coopQuest.status === 'completed') {
    throw new Error('Co-op quest already completed');
  }

  const contributingUser = await User.findById(userId);
  if (!contributingUser) {
    throw new Error('User not found');
  }

  const party = await Party.findById(coopQuest.party);
  if (!party || party.status !== 'ACTIVE') {
    throw new Error('Party not found or inactive');
  }

  // The contribution is always attributed to the authenticated caller.
  // No userId override is accepted from the client.
  const isMember = party.members.some((m) => toObjectIdString(m) === userId);
  if (!isMember) {
    throw new Error('Only party members can contribute to this co-op quest');
  }

  const alreadyContributed = coopQuest.contributions.some((c) => toObjectIdString(c.userId) === userId);
  if (alreadyContributed) {
    throw new Error('You have already contributed to this co-op quest');
  }

  // Record individual contribution
  coopQuest.contributions.push({
    userId: new Types.ObjectId(userId),
    completedAt: new Date(),
  });

  const isCompleted = coopQuest.contributions.length >= coopQuest.targetCount;
  if (isCompleted) {
    coopQuest.status = 'completed';
    coopQuest.completedAt = new Date();

    // Deterministically award XP and Coins to all contributing participants exactly once
    for (const cont of coopQuest.contributions) {
      await awardXp(cont.userId, coopQuest.xpReward);
      await awardCoins(cont.userId, coopQuest.coinReward);
    }
  }

  await coopQuest.save();

  return {
    coopQuest,
    completed: isCompleted,
    contributionsCount: coopQuest.contributions.length,
    targetCount: coopQuest.targetCount,
  };
};

/* ==========================================================================
   4. FRIENDLY CHALLENGES / DUELS
   ========================================================================== */

/**
 * Create a friendly challenge against a confirmed friend.
 */
export const createChallenge = async (
  challengerId: string,
  data: {
    challengedId: string;
    title: string;
    goalType: ChallengeGoalType;
    target: number;
    xpReward?: number;
    coinReward?: number;
  }
) => {
  if (!Types.ObjectId.isValid(challengerId) || !Types.ObjectId.isValid(data.challengedId)) {
    throw new Error('Challenged user not found');
  }
  if (challengerId === data.challengedId) {
    throw new Error('Cannot challenge yourself');
  }

  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Challenge title is required');
  }
  if (data.title.trim().length > 120) {
    throw new Error('Challenge title is too long');
  }

  if (!['QUEST_COUNT', 'XP_EARNED', 'STREAK'].includes(data.goalType)) {
    throw new Error('Invalid goal type: must be QUEST_COUNT, XP_EARNED, or STREAK');
  }

  const target = Number(data.target);
  if (!Number.isInteger(target) || target <= 0 || target > 10000) {
    throw new Error('Target must be a positive integer');
  }

  const challengedUser = await User.findById(data.challengedId);
  if (!challengedUser) {
    throw new Error('Challenged user not found');
  }

  // Must be friends
  const isFriend = await areFriends(challengerId, data.challengedId);
  if (!isFriend) {
    throw new Error('Can only create challenges against confirmed friends');
  }

  // Rewards are fixed server-side so the client cannot mint arbitrary rewards.
  const challenge = await Challenge.create({
    challenger: new Types.ObjectId(challengerId),
    challenged: new Types.ObjectId(data.challengedId),
    title: data.title.trim(),
    goalType: data.goalType,
    target,
    challengerProgress: 0,
    challengedProgress: 0,
    challengerBaseline: 0,
    challengedBaseline: 0,
    baselinesSet: false,
    status: 'PENDING',
    xpReward: 50,
    coinReward: 25,
    rewardGranted: false,
  });

  return challenge;
};

/**
 * Accept a challenge. Only the challenged friend can accept.
 */
export const acceptChallenge = async (userId: string, challengeId: string) => {
  if (!Types.ObjectId.isValid(challengeId)) {
    throw new Error('Challenge not found');
  }
  const challenge = await Challenge.findById(new Types.ObjectId(challengeId));
  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.challenged.toString() !== userId) {
    throw new Error('Not authorized to accept this challenge');
  }

  if (challenge.status !== 'PENDING') {
    throw new Error(`Cannot accept challenge in status ${challenge.status}`);
  }

  // Capture real gameplay baselines at accept time so subsequent progress is
  // derived from backend gameplay data, not client input.
  const challenger = await User.findById(challenge.challenger);
  const challenged = await User.findById(challenge.challenged);
  if (!challenger || !challenged) {
    throw new Error('Challenge participants not found');
  }
  challenge.challengerBaseline = getGameplayMetric(challenger, challenge.goalType);
  challenge.challengedBaseline = getGameplayMetric(challenged, challenge.goalType);
  challenge.baselinesSet = true;
  challenge.challengerProgress = 0;
  challenge.challengedProgress = 0;

  challenge.status = 'ACCEPTED';
  await challenge.save();

  return challenge;
};

/**
 * Decline a challenge.
 */
export const declineChallenge = async (userId: string, challengeId: string) => {
  if (!Types.ObjectId.isValid(challengeId)) {
    throw new Error('Challenge not found');
  }
  const challenge = await Challenge.findById(new Types.ObjectId(challengeId));
  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.challenged.toString() !== userId) {
    throw new Error('Not authorized to decline this challenge');
  }

  if (challenge.status !== 'PENDING') {
    throw new Error(`Cannot decline challenge in status ${challenge.status}`);
  }

  challenge.status = 'DECLINED';
  await challenge.save();
  return challenge;
};

/**
 * Get all challenges involving a user.
 */
export const getUserChallenges = async (userId: string) => {
  return Challenge.find({
    $or: [{ challenger: new Types.ObjectId(userId) }, { challenged: new Types.ObjectId(userId) }],
  })
    .populate('challenger', SAFE_USER_FIELDS)
    .populate('challenged', SAFE_USER_FIELDS)
    .populate('winner', SAFE_USER_FIELDS)
    .sort({ createdAt: -1 });
};

/**
 * Sync challenge progress from real backend gameplay data.
 * The client can only request a sync; it cannot submit progressAmount,
 * progress values, winners, results, or rewards. Everything is derived
 * server-side from User gameplay fields and rewards are granted once.
 */
export const syncChallengeProgress = async (userId: string, challengeId: string) => {
  if (!Types.ObjectId.isValid(challengeId)) {
    throw new Error('Challenge not found');
  }
  const challenge = await Challenge.findById(new Types.ObjectId(challengeId));
  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.status !== 'ACCEPTED') {
    throw new Error('Cannot update progress on an inactive challenge');
  }

  const isChallenger = challenge.challenger.toString() === userId;
  const isChallenged = challenge.challenged.toString() === userId;

  if (!isChallenger && !isChallenged) {
    throw new Error('Not authorized to update this challenge');
  }

  const challenger = await User.findById(challenge.challenger);
  const challenged = await User.findById(challenge.challenged);
  if (!challenger || !challenged) {
    throw new Error('Challenge participants not found');
  }

  // Backfill baselines for challenges accepted before baselines existed.
  if (!challenge.baselinesSet) {
    challenge.challengerBaseline = getGameplayMetric(challenger, challenge.goalType);
    challenge.challengedBaseline = getGameplayMetric(challenged, challenge.goalType);
    challenge.baselinesSet = true;
  }

  const challengerCurrent = getGameplayMetric(challenger, challenge.goalType);
  const challengedCurrent = getGameplayMetric(challenged, challenge.goalType);
  challenge.challengerProgress = Math.max(0, challengerCurrent - (challenge.challengerBaseline || 0));
  challenge.challengedProgress = Math.max(0, challengedCurrent - (challenge.challengedBaseline || 0));

  // Check victory condition from real gameplay data only.
  const challengerWon = challenge.challengerProgress >= challenge.target;
  const challengedWon = challenge.challengedProgress >= challenge.target;

  if (challengerWon || challengedWon) {
    challenge.status = 'COMPLETED';
    challenge.completedAt = new Date();

    // Deterministic winner: whoever reached target first by progress delta;
    // challenger wins ties to keep behavior deterministic.
    let winnerId = challenge.challenger;
    if (challengedWon && !challengerWon) {
      winnerId = challenge.challenged;
    } else if (challengerWon && challengedWon) {
      winnerId =
        challenge.challengerProgress >= challenge.challengedProgress
          ? challenge.challenger
          : challenge.challenged;
    }
    challenge.winner = winnerId;

    // Reward exactly once.
    if (!challenge.rewardGranted) {
      challenge.rewardGranted = true;
      if (challenge.xpReward > 0) {
        await awardXp(winnerId, challenge.xpReward);
      }
      if (challenge.coinReward > 0) {
        await awardCoins(winnerId, challenge.coinReward);
      }
    }
  }

  await challenge.save();
  return challenge;
};

/**
 * Legacy alias kept for route compatibility. Client-supplied amounts are
 * intentionally ignored: progress always comes from server gameplay data.
 */
export const recordChallengeProgress = async (
  userId: string,
  challengeId: string,
  _progressAmount?: number
) => syncChallengeProgress(userId, challengeId);
