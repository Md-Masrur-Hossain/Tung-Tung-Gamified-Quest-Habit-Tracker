import { User, IUser } from '../models/User';
import { Types } from 'mongoose';
import { markLeaderboardDirty } from './leaderboardService';
import { applyDailyXpBonus } from '../realtime/dailyEvent';

/**
 * XP calculation based on quest type and difficulty.
 * Simple deterministic mapping.
 */
export const calculateXpReward = (type: string, difficulty: string): number => {
  const base = {
    easy: 50,
    medium: 100,
    hard: 150,
    epic: 300,
  }[difficulty] || 50;
  const multiplier = {
    daily: 1,
    weekly: 1.5,
    quick: 0.8,
    epic: 2,
    boss: 2.5,
  }[type] || 1;
  return Math.round(base * multiplier);
};

/** Simple level formula: each level requires 100 * level XP */
export const calculateLevel = (totalXP: number): { level: number; xpForNext: number; progressPercent: number } => {
  let level = 1;
  let xpNeeded = 100; // XP required for current level to next
  let remaining = totalXP;
  while (remaining >= xpNeeded) {
    remaining -= xpNeeded;
    level += 1;
    xpNeeded = level * 100; // linear growth
  }
  const xpForNext = xpNeeded;
  const progressPercent = (remaining / xpForNext) * 100;
  return { level, xpForNext, progressPercent };
};

/** Update user's streak based on a new completion date */
export const updateStreak = async (user: IUser, completionDate: Date): Promise<IUser> => {
  const lastDate = user.lastCompletionDate ? new Date(user.lastCompletionDate) : null;
  const today = new Date(completionDate);
  // normalize to date only (ignore time)
  const normalize = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayNorm = normalize(today);
  const lastNorm = lastDate ? normalize(lastDate) : null;

  if (!lastNorm) {
    // first completion ever
    user.currentStreak = 1;
    user.longestStreak = Math.max(user.longestStreak, 1);
    user.lastCompletionDate = today;
    await user.save();
    markLeaderboardDirty(); // Sprint 6A: ranking field may have changed -> debounced refresh
    return user;
  }

  const diffDays = (todayNorm - lastNorm) / (1000 * 60 * 60 * 24);
  if (diffDays === 1) {
    // consecutive day
    user.currentStreak += 1;
  } else if (diffDays > 1) {
    // break in streak
    user.currentStreak = 1;
  } else {
    // same day or earlier (should not happen) – no streak change
    user.currentStreak = user.currentStreak; // unchanged
  }
  if (user.currentStreak > user.longestStreak) user.longestStreak = user.currentStreak;
  user.lastCompletionDate = today;
  await user.save();
  markLeaderboardDirty(); // Sprint 6A: ranking field may have changed -> debounced refresh
  return user;
};

/** Award XP and recalculate level (server-authoritative). */
export const awardXp = async (userId: Types.ObjectId, amount: number): Promise<IUser> => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };
  // Sprint 6C: DOUBLE_XP_WORLD days double XP outside the test environment
  // (frozen regression tests keep exact, date-independent values).
  user.totalXP += applyDailyXpBonus(amount);
  const { level } = calculateLevel(user.totalXP);
  user.level = level;
  await user.save();
  markLeaderboardDirty(); // Sprint 6A: XP/level changed -> debounced leaderboard refresh
  return user;
};

/** Get progression snapshot for response */
export const getProgression = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };
  const levelInfo = calculateLevel(user.totalXP);
  return {
    totalXP: user.totalXP,
    level: user.level,
    coins: user.coins || 0,
    xpForNext: levelInfo.xpForNext,
    progressPercent: levelInfo.progressPercent,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    equippedTitle: user.equippedTitle || 'Rookie',
    equippedAvatar: user.equippedAvatar || 'avatar_default',
    equippedFrame: user.equippedFrame || 'frame_default',
    equippedAura: user.equippedAura || 'none',
    equippedCompanion: user.equippedCompanion || 'none',
    unlockedTitles: user.unlockedTitles || ['Rookie'],
  };
};
