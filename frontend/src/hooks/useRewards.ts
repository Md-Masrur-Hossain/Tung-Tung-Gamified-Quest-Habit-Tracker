import { useState, useEffect } from 'react';
import {
  getShopItems,
  purchaseShopItem,
  getUserInventory,
  equipCosmeticItem,
  equipPlayerTitle,
  getUserAchievements,
  getPlayerRewardProfile,
} from '../lib/api';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: 'AVATAR' | 'FRAME' | 'AURA' | 'COMPANION' | 'COSMETIC';
  priceCoins: number;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  cosmeticMetadata: Record<string, any>;
  isAvailable: boolean;
}

export interface AchievementItem {
  key: string;
  name: string;
  description: string;
  icon: string;
  rewardCoins: number;
  rewardTitle?: string;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface RewardProfile {
  username: string;
  level: number;
  totalXP: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  equippedTitle: string;
  unlockedTitles: string[];
  equippedAvatar: string;
  equippedFrame: string;
  equippedAura: string;
  equippedCompanion: string;
  companionData?: any;
  inventoryCount: number;
  achievementsCount: {
    unlocked: number;
    total: number;
  };
  achievements: AchievementItem[];
}

export const useRewards = () => {
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<string[]>([]);
  const [profile, setProfile] = useState<RewardProfile | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [shopRes, invRes, achRes, profRes] = await Promise.all([
        getShopItems(),
        getUserInventory(),
        getUserAchievements(),
        getPlayerRewardProfile(),
      ]);

      setShopItems(shopRes.data);
      setInventory(invRes.data.inventory || []);
      setAchievements(achRes.data);
      setProfile(profRes.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load rewards data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const buyItem = async (itemId: string) => {
    try {
      const res = await purchaseShopItem(itemId);
      await fetchAll();
      return { success: true, data: res.data };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to purchase item';
      return { success: false, error: msg };
    }
  };

  const equipCosmetic = async (itemId: string) => {
    try {
      const res = await equipCosmeticItem(itemId);
      await fetchAll();
      return { success: true, data: res.data };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to equip item';
      return { success: false, error: msg };
    }
  };

  const equipTitle = async (title: string) => {
    try {
      const res = await equipPlayerTitle(title);
      await fetchAll();
      return { success: true, data: res.data };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to equip title';
      return { success: false, error: msg };
    }
  };

  return {
    shopItems,
    inventory,
    profile,
    achievements,
    loading,
    error,
    refresh: fetchAll,
    buyItem,
    equipCosmetic,
    equipTitle,
  };
};
