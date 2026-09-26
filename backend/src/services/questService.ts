import { Types } from 'mongoose';
import { Quest, IQuest } from '../models/Quest';
import { User } from '../models/User';
import { calculateXpReward, awardXp, getProgression, updateStreak } from './progressionService';
import { calculateCoinReward, checkAndUnlockAchievements } from './rewardService';

/** Create a new quest for a user */
export const createQuest = async (
  userId: Types.ObjectId,
  data: {
    title: string;
    description?: string;
    type: string;
    category: string;
    difficulty: string;
    deadline?: Date;
  }
): Promise<IQuest> => {
  const xpReward = calculateXpReward(data.type, data.difficulty);
  const quest = new Quest({
    owner: userId,
    title: data.title,
    description: data.description,
    type: data.type,
    category: data.category,
    difficulty: data.difficulty,
    xpReward,
    deadline: data.deadline,
  });
  await quest.save();
  return quest;
};

/** Complete a quest safely */
export const completeQuest = async (userId: Types.ObjectId, questId: string) => {
  const quest = await Quest.findOne({ _id: questId, owner: userId });
  if (!quest) {
    throw { status: 404, message: 'Quest not found or not owned by user' };
  }
  if (quest.status === 'completed') {
    throw { status: 400, message: 'Quest already completed' };
  }
  // Mark completed
  quest.status = 'completed';
  quest.completedAt = new Date();
  await quest.save();

  // Award XP
  await awardXp(userId, quest.xpReward);

  // Update streak, coins, and stats on user
  const user = await User.findById(userId);
  if (user) {
    await updateStreak(user, quest.completedAt);

    // Award coins based on quest difficulty & type
    const coinsAwarded = calculateCoinReward(quest.type, quest.difficulty);
    user.coins = (user.coins || 0) + coinsAwarded;

    // Track quest count stats
    user.stats = user.stats || { questsCompleted: 0, bossesDefeated: 0 };
    user.stats.questsCompleted = (user.stats.questsCompleted || 0) + 1;
    await user.save();

    // Check and trigger achievements (FIRST_QUEST, QUEST_HUNTER, STREAK, etc.)
    await checkAndUnlockAchievements(user);
  }

  // Return updated progression snapshot
  const progression = await getProgression(userId);

  return { quest, progression };
};

/** Fetch quests for a user, optionally filter */
export const getQuests = async (userId: Types.ObjectId, filter?: { status?: string }) => {
  const query: any = { owner: userId };
  if (filter?.status) query.status = filter.status;
  const quests = await Quest.find(query).sort({ createdAt: -1 });
  return quests;
};
