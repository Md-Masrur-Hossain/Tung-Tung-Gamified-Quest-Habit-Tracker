import { IUser } from '../models/User';

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  rewardCoins: number;
  rewardTitle?: string;
  check: (user: IUser, context?: any) => boolean;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: 'FIRST_QUEST',
    name: 'First Step',
    description: 'Complete your first quest',
    icon: '🌱',
    rewardCoins: 10,
    rewardTitle: 'Quest Hunter',
    check: (user) => (user.stats?.questsCompleted ?? 0) >= 1,
  },
  {
    key: 'QUEST_HUNTER',
    name: 'Quest Hunter',
    description: 'Complete 10 quests',
    icon: '🎯',
    rewardCoins: 50,
    rewardTitle: 'XP Grinder',
    check: (user) => (user.stats?.questsCompleted ?? 0) >= 10,
  },
  {
    key: 'STREAK_STARTER',
    name: 'Streak Starter',
    description: 'Maintain a 3-day streak',
    icon: '🔥',
    rewardCoins: 20,
    rewardTitle: 'Streak Warrior',
    check: (user) => (user.currentStreak ?? 0) >= 3 || (user.longestStreak ?? 0) >= 3,
  },
  {
    key: 'STREAK_MASTER',
    name: 'Streak Master',
    description: 'Maintain a 7-day streak',
    icon: '⚡',
    rewardCoins: 50,
    rewardTitle: 'Legend',
    check: (user) => (user.currentStreak ?? 0) >= 7 || (user.longestStreak ?? 0) >= 7,
  },
  {
    key: 'BOSS_SLAYER',
    name: 'Boss Slayer',
    description: 'Defeat your first Boss',
    icon: '⚔️',
    rewardCoins: 50,
    rewardTitle: 'Boss Slayer',
    check: (user) => (user.stats?.bossesDefeated ?? 0) >= 1,
  },
  {
    key: 'BOSS_BREAKER',
    name: 'Boss Breaker',
    description: 'Defeat 5 Bosses',
    icon: '👑',
    rewardCoins: 100,
    check: (user) => (user.stats?.bossesDefeated ?? 0) >= 5,
  },
  {
    key: 'LEVEL_5',
    name: 'Rising Hero',
    description: 'Reach Level 5',
    icon: '⭐',
    rewardCoins: 30,
    check: (user) => (user.level ?? 1) >= 5,
  },
  {
    key: 'LEVEL_10',
    name: 'Veteran Adventurer',
    description: 'Reach Level 10',
    icon: '🌟',
    rewardCoins: 75,
    check: (user) => (user.level ?? 1) >= 10,
  },
  {
    key: 'COIN_COLLECTOR',
    name: 'Coin Collector',
    description: 'Earn 100 coins',
    icon: '🪙',
    rewardCoins: 25,
    check: (user) => (user.coins ?? 0) >= 100,
  },
];
