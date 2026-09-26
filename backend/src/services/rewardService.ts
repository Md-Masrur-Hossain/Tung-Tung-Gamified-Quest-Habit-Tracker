import { Types } from 'mongoose';
import { User, IUser } from '../models/User';
import { SHOP_CATALOG, ShopItem } from '../constants/shopItems';
import { ACHIEVEMENTS, AchievementDefinition } from '../constants/achievements';

/**
 * Deterministic Coin rewards based on quest type & difficulty.
 */
export const calculateCoinReward = (type: string, difficulty: string): number => {
  const base = {
    easy: 10,
    medium: 20,
    hard: 35,
    epic: 70,
  }[difficulty] || 10;

  const multiplier = {
    daily: 1,
    weekly: 1.5,
    quick: 0.8,
    epic: 2,
    boss: 2.5,
  }[type] || 1;

  return Math.round(base * multiplier);
};

/**
 * Award coins securely to a user on the backend.
 */
export const awardCoins = async (userId: Types.ObjectId | string, amount: number): Promise<IUser> => {
  if (typeof amount !== 'number' || isNaN(amount) || amount < 0 || !Number.isInteger(amount)) {
    throw new Error('Invalid coin amount: must be a positive integer');
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.coins = (user.coins || 0) + amount;
  await user.save();

  // Check achievements triggered by coin thresholds
  await checkAndUnlockAchievements(user);

  return user;
};

/**
 * Get available shop items.
 */
export const getAvailableShopItems = (): ShopItem[] => {
  return SHOP_CATALOG.filter((item) => item.isAvailable);
};

/**
 * Purchase an item with coins.
 */
export const purchaseItem = async (userId: string, itemId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item || !item.isAvailable) {
    throw new Error('Item unavailable for purchase');
  }

  if (user.inventory && user.inventory.includes(itemId)) {
    throw new Error('Item already owned');
  }

  if ((user.coins || 0) < item.priceCoins) {
    throw new Error('Insufficient coins');
  }

  // Atomically deduct coins and add to inventory
  user.coins -= item.priceCoins;
  user.inventory = user.inventory || [];
  user.inventory.push(itemId);
  await user.save();

  return { item, remainingCoins: user.coins };
};

/**
 * Get user inventory and equipped cosmetics.
 */
export const getUserInventory = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const ownedItems = SHOP_CATALOG.filter((i) => user.inventory?.includes(i.id));

  return {
    coins: user.coins || 0,
    inventory: user.inventory || [],
    ownedItems,
    equipped: {
      title: user.equippedTitle || 'Rookie',
      avatar: user.equippedAvatar || 'avatar_default',
      frame: user.equippedFrame || 'frame_default',
      aura: user.equippedAura || 'none',
      companion: user.equippedCompanion || 'none',
    },
    unlockedTitles: user.unlockedTitles || ['Rookie'],
  };
};

/**
 * Equip a cosmetic item. Backend validates ownership.
 */
export const equipCosmetic = async (userId: string, itemId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) throw new Error('Item not found');

  if (!user.inventory || !user.inventory.includes(itemId)) {
    throw new Error('Item not owned');
  }

  switch (item.category) {
    case 'AVATAR':
      user.equippedAvatar = itemId;
      break;
    case 'FRAME':
      user.equippedFrame = itemId;
      break;
    case 'AURA':
      user.equippedAura = itemId;
      break;
    case 'COMPANION':
      user.equippedCompanion = itemId;
      break;
    case 'COSMETIC':
      user.equippedAvatar = itemId;
      break;
    default:
      throw new Error('Invalid item category');
  }

  await user.save();

  return {
    equippedAvatar: user.equippedAvatar,
    equippedFrame: user.equippedFrame,
    equippedAura: user.equippedAura,
    equippedCompanion: user.equippedCompanion,
  };
};

/**
 * Equip an unlocked title. Backend validates unlock status.
 */
export const equipTitle = async (userId: string, title: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (!user.unlockedTitles || !user.unlockedTitles.includes(title)) {
    throw new Error('Title not unlocked');
  }

  user.equippedTitle = title;
  await user.save();

  return { equippedTitle: user.equippedTitle };
};

/**
 * Check and unlock achievements. Prevents duplicate unlocks & rewards.
 */
export const checkAndUnlockAchievements = async (
  userOrId: IUser | Types.ObjectId | string,
  context?: any
): Promise<AchievementDefinition[]> => {
  let user: IUser | null;
  if (typeof userOrId === 'string' || userOrId instanceof Types.ObjectId) {
    user = await User.findById(userOrId);
  } else {
    user = userOrId;
  }
  if (!user) return [];

  user.achievements = user.achievements || [];
  user.unlockedTitles = user.unlockedTitles || ['Rookie'];
  user.coins = user.coins || 0;
  user.stats = user.stats || { questsCompleted: 0, bossesDefeated: 0 };

  const newlyUnlocked: AchievementDefinition[] = [];

  for (const ach of ACHIEVEMENTS) {
    // Prevent duplicate unlock
    const alreadyUnlocked = user.achievements.some((a) => a.key === ach.key);
    if (alreadyUnlocked) continue;

    if (ach.check(user, context)) {
      user.achievements.push({
        key: ach.key,
        unlockedAt: new Date(),
      });

      // Grant rewards once
      if (ach.rewardCoins && ach.rewardCoins > 0) {
        user.coins += ach.rewardCoins;
      }
      if (ach.rewardTitle && !user.unlockedTitles.includes(ach.rewardTitle)) {
        user.unlockedTitles.push(ach.rewardTitle);
      }

      newlyUnlocked.push(ach);
    }
  }

  if (newlyUnlocked.length > 0) {
    await user.save();
  }

  return newlyUnlocked;
};

/**
 * Get all achievements mapped with user unlock state.
 */
export const getUserAchievements = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const unlockedMap = new Map((user.achievements || []).map((a) => [a.key, a.unlockedAt]));

  return ACHIEVEMENTS.map((ach) => ({
    key: ach.key,
    name: ach.name,
    description: ach.description,
    icon: ach.icon,
    rewardCoins: ach.rewardCoins,
    rewardTitle: ach.rewardTitle,
    unlocked: unlockedMap.has(ach.key),
    unlockedAt: unlockedMap.get(ach.key) || null,
  }));
};

/**
 * Get complete RPG profile for reward / cosmetic dashboard view.
 */
export const getPlayerProfile = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const achievements = await getUserAchievements(userId);
  const companionItem = SHOP_CATALOG.find((i) => i.id === user.equippedCompanion);

  return {
    username: user.username,
    level: user.level,
    totalXP: user.totalXP,
    coins: user.coins || 0,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    equippedTitle: user.equippedTitle || 'Rookie',
    unlockedTitles: user.unlockedTitles || ['Rookie'],
    equippedAvatar: user.equippedAvatar || 'avatar_default',
    equippedFrame: user.equippedFrame || 'frame_default',
    equippedAura: user.equippedAura || 'none',
    equippedCompanion: user.equippedCompanion || 'none',
    companionData: companionItem ? companionItem.cosmeticMetadata : null,
    inventoryCount: (user.inventory || []).length,
    achievementsCount: {
      unlocked: (user.achievements || []).length,
      total: ACHIEVEMENTS.length,
    },
    achievements,
    stats: user.stats || { questsCompleted: 0, bossesDefeated: 0 },
  };
};
