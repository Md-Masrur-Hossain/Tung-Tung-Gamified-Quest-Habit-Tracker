import { Types } from 'mongoose';
import { User } from '../models/User';
import { Quest } from '../models/Quest';
import {
  calculateCoinReward,
  awardCoins,
  getAvailableShopItems,
  purchaseItem,
  getUserInventory,
  equipCosmetic,
  equipTitle,
  checkAndUnlockAchievements,
  getUserAchievements,
} from '../services/rewardService';
import { completeQuest } from '../services/questService';
import { completeBossAction, createBoss } from '../services/bossService';
import { Boss } from '../models/Boss';
import { BossAction } from '../models/BossAction';

// In-memory mock storage
let mockUsers: any[] = [];
let mockQuests: any[] = [];
let mockBosses: any[] = [];
let mockBossActions: any[] = [];

beforeEach(() => {
  mockUsers = [];
  mockQuests = [];
  mockBosses = [];
  mockBossActions = [];
  jest.clearAllMocks();

  jest.spyOn(User, 'findById').mockImplementation(((id: any) => {
    const user = mockUsers.find((u) => u._id.toString() === id.toString());
    if (!user) return Promise.resolve(null) as any;
    return Promise.resolve(user) as any;
  }) as any);

  jest.spyOn(Quest, 'findOne').mockImplementation(((filter: any) => {
    const quest = mockQuests.find((q) => {
      if (filter._id && q._id.toString() !== filter._id.toString()) return false;
      if (filter.owner && q.owner.toString() !== filter.owner.toString()) return false;
      return true;
    });
    return Promise.resolve(quest || null) as any;
  }) as any);

  jest.spyOn(Boss, 'create').mockImplementation(async (data: any) => {
    const bossObj: any = {
      _id: new Types.ObjectId(),
      ...data,
      actions: [],
      save: jest.fn().mockImplementation(async function (this: any) {
        return this;
      }),
    };
    mockBosses.push(bossObj);
    return bossObj as any;
  });

  (jest.spyOn(BossAction, 'insertMany') as any).mockImplementation(async (actions: any[]) => {
    const created = actions.map((a) => {
      const actionObj: any = {
        _id: new Types.ObjectId(),
        ...a,
        save: jest.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };
      mockBossActions.push(actionObj);
      return actionObj;
    });
    return created;
  });

  jest.spyOn(BossAction, 'findById').mockImplementation(((id: any) => {
    const action = mockBossActions.find((a) => a._id.toString() === id.toString());
    return {
      populate: jest.fn().mockImplementation(async (field: string) => {
        if (!action) return null;
        if (field === 'boss') {
          const bossId = action.boss?._id ? action.boss._id.toString() : action.boss?.toString();
          const boss = mockBosses.find((b) => b._id.toString() === bossId);
          action.boss = boss;
          return action;
        }
        return action;
      }),
    } as any;
  }) as any);
});

function createTestUser(id: string, initialCoins = 0, initialLevel = 1): any {
  const user: any = {
    _id: new Types.ObjectId(id),
    username: `user_${id}`,
    email: `user_${id}@example.com`,
    totalXP: 0,
    level: initialLevel,
    coins: initialCoins,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletionDate: null,
    inventory: [],
    achievements: [],
    unlockedTitles: ['Rookie'],
    equippedTitle: 'Rookie',
    equippedAvatar: 'avatar_default',
    equippedFrame: 'frame_default',
    equippedAura: 'none',
    equippedCompanion: 'none',
    stats: { questsCompleted: 0, bossesDefeated: 0 },
    save: jest.fn().mockImplementation(async function (this: any) {
      return this;
    }),
  };
  mockUsers.push(user);
  return user;
}

describe('Sprint 4: Coins & Economy (Scenarios 1-5)', () => {
  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();

  test('1. Valid gameplay reward increases Coins', async () => {
    const user = createTestUser(userAId, 0);

    const quest: any = {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(userAId),
      title: 'Workout session',
      type: 'daily',
      category: 'Fitness',
      difficulty: 'medium',
      xpReward: 100,
      status: 'pending',
      save: jest.fn().mockImplementation(async function (this: any) {
        return this;
      }),
    };
    mockQuests.push(quest);

    const result = await completeQuest(new Types.ObjectId(userAId), quest._id.toString());
    expect(result.quest.status).toBe('completed');
    // daily + medium = 20 coins + 10 coins from FIRST_QUEST achievement = 30
    expect(user.coins).toBe(30);
  });

  test('2. Duplicate completion does not award Coins twice', async () => {
    const user = createTestUser(userAId, 0);
    const quest: any = {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(userAId),
      title: 'Solo Quest',
      type: 'daily',
      category: 'Work',
      difficulty: 'easy',
      xpReward: 50,
      status: 'pending',
      save: jest.fn().mockImplementation(async function (this: any) {
        return this;
      }),
    };
    mockQuests.push(quest);

    await completeQuest(new Types.ObjectId(userAId), quest._id.toString());
    // easy daily = 10 coins + 10 from FIRST_QUEST = 20
    expect(user.coins).toBe(20);

    // Duplicate call rejected
    await expect(completeQuest(new Types.ObjectId(userAId), quest._id.toString())).rejects.toEqual(
      expect.objectContaining({ status: 400, message: 'Quest already completed' })
    );
    expect(user.coins).toBe(20); // Coins remain unchanged
  });

  test('3. Client cannot directly set Coins (invalid amounts rejected)', async () => {
    const user = createTestUser(userAId, 50);

    // Negative amounts rejected
    await expect(awardCoins(userAId, -20)).rejects.toThrow(/Invalid coin amount/);
    // Non-integers rejected
    await expect(awardCoins(userAId, 15.5)).rejects.toThrow(/Invalid coin amount/);
    // Strings rejected
    await expect(awardCoins(userAId, '100' as any)).rejects.toThrow(/Invalid coin amount/);

    expect(user.coins).toBe(50);
  });

  test('4. Coin balance cannot become negative', async () => {
    const user = createTestUser(userAId, 10);
    // Item costs 50, user has 10
    await expect(purchaseItem(userAId, 'avatar_warrior')).rejects.toThrow('Insufficient coins');
    expect(user.coins).toBe(10);
    expect(user.coins).not.toBeLessThan(0);
  });

  test("5. User A cannot modify User B's Coins", async () => {
    createTestUser(userAId, 100);
    const userB = createTestUser(userBId, 50);

    const questB: any = {
      _id: new Types.ObjectId(),
      owner: new Types.ObjectId(userBId),
      title: "User B's task",
      type: 'daily',
      category: 'Study',
      difficulty: 'easy',
      xpReward: 50,
      status: 'pending',
      save: jest.fn(),
    };
    mockQuests.push(questB);

    // User A attempting to complete User B's quest
    await expect(completeQuest(new Types.ObjectId(userAId), questB._id.toString())).rejects.toEqual(
      expect.objectContaining({ status: 404 })
    );
    expect(userB.coins).toBe(50);
  });
});

describe('Sprint 4: Reward / Shop System (Scenarios 6-12)', () => {
  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();

  test('6. Available items can be listed', () => {
    const items = getAvailableShopItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.isAvailable)).toBe(true);
    // Check key categories exist
    const categories = items.map((i) => i.category);
    expect(categories).toContain('AVATAR');
    expect(categories).toContain('FRAME');
    expect(categories).toContain('AURA');
    expect(categories).toContain('COMPANION');
  });

  test('7. Purchase succeeds with sufficient Coins', async () => {
    const user = createTestUser(userAId, 100);
    const result = await purchaseItem(userAId, 'avatar_warrior'); // costs 50

    expect(result.item.id).toBe('avatar_warrior');
    expect(user.inventory).toContain('avatar_warrior');
  });

  test('8. Purchase deducts the correct backend-defined price', async () => {
    const user = createTestUser(userAId, 100);
    const result = await purchaseItem(userAId, 'avatar_warrior'); // costs 50

    expect(result.remainingCoins).toBe(50);
    expect(user.coins).toBe(50);
  });

  test('9. Insufficient Coins prevents purchase', async () => {
    const user = createTestUser(userAId, 20); // warrior costs 50
    await expect(purchaseItem(userAId, 'avatar_warrior')).rejects.toThrow('Insufficient coins');
    expect(user.inventory).not.toContain('avatar_warrior');
    expect(user.coins).toBe(20);
  });

  test('10. Unavailable item cannot be purchased', async () => {
    createTestUser(userAId, 9999);
    await expect(purchaseItem(userAId, 'cosmetic_vaulted')).rejects.toThrow('Item unavailable for purchase');
  });

  test('11. Duplicate ownership/purchase is handled correctly', async () => {
    const user = createTestUser(userAId, 200);
    await purchaseItem(userAId, 'frame_bronze'); // costs 25

    await expect(purchaseItem(userAId, 'frame_bronze')).rejects.toThrow('Item already owned');
    expect(user.inventory.filter((id: string) => id === 'frame_bronze')).toHaveLength(1);
    expect(user.coins).toBe(175);
  });

  test("12. User A cannot access/modify User B's inventory", async () => {
    createTestUser(userAId, 100);
    const userB = createTestUser(userBId, 100);

    await purchaseItem(userBId, 'avatar_warrior');
    expect(userB.inventory).toContain('avatar_warrior');

    const invA = await getUserInventory(userAId);
    expect(invA.inventory).not.toContain('avatar_warrior');

    // User A cannot equip item owned only by User B
    await expect(equipCosmetic(userAId, 'avatar_warrior')).rejects.toThrow('Item not owned');
  });
});

describe('Sprint 4: Achievements (Scenarios 13-19)', () => {
  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();

  test('13. First quest unlocks FIRST_QUEST', async () => {
    const user = createTestUser(userAId, 0);
    user.stats.questsCompleted = 1;

    const unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'FIRST_QUEST')).toBe(true);
    expect(user.achievements.some((a: any) => a.key === 'FIRST_QUEST')).toBe(true);
    expect(user.unlockedTitles).toContain('Quest Hunter');
  });

  test('14. Quest count achievement unlocks at the correct threshold (10 quests)', async () => {
    const user = createTestUser(userAId, 0);
    user.stats.questsCompleted = 9;

    let unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'QUEST_HUNTER')).toBe(false);

    user.stats.questsCompleted = 10;
    unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'QUEST_HUNTER')).toBe(true);
    expect(user.unlockedTitles).toContain('XP Grinder');
  });

  test('15. Streak achievement unlocks at the correct threshold', async () => {
    const user = createTestUser(userAId, 0);
    user.currentStreak = 2;
    let unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'STREAK_STARTER')).toBe(false);

    // 3 days
    user.currentStreak = 3;
    unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'STREAK_STARTER')).toBe(true);
    expect(user.unlockedTitles).toContain('Streak Warrior');

    // 7 days
    user.currentStreak = 7;
    unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'STREAK_MASTER')).toBe(true);
    expect(user.unlockedTitles).toContain('Legend');
  });

  test('16. Boss defeat achievement unlocks after real Boss defeat', async () => {
    const user = createTestUser(userAId, 0);

    const boss = await createBoss(userAId, {
      title: 'Achievement Test Boss',
      category: 'WORK',
      maxHp: 20,
      actions: [{ title: 'Final Blow', damage: 20 }],
    });

    await completeBossAction(userAId, boss._id.toString(), boss.actions[0].toString());

    expect(user.stats.bossesDefeated).toBe(1);
    expect(user.achievements.some((a: any) => a.key === 'BOSS_SLAYER')).toBe(true);
    expect(user.unlockedTitles).toContain('Boss Slayer');
  });

  test('17. Level achievement unlocks at the correct level', async () => {
    const user = createTestUser(userAId, 0, 4);
    let unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'LEVEL_5')).toBe(false);

    user.level = 5;
    unlocked = await checkAndUnlockAchievements(user);
    expect(unlocked.some((a) => a.key === 'LEVEL_5')).toBe(true);
  });

  test('18. Achievement cannot be rewarded twice', async () => {
    const user = createTestUser(userAId, 0);
    user.stats.questsCompleted = 1;

    await checkAndUnlockAchievements(user);
    const initialCoins = user.coins; // earned rewardCoins from FIRST_QUEST (10)
    expect(initialCoins).toBe(10);

    // Run check again
    const secondPass = await checkAndUnlockAchievements(user);
    expect(secondPass).toHaveLength(0);
    expect(user.coins).toBe(10); // Coins not awarded again
  });

  test("19. User A cannot modify User B's achievements", async () => {
    createTestUser(userAId, 0);
    const userB = createTestUser(userBId, 0);

    // Fetch user B achievements as user A is not permitted in API
    const userBAchievements = await getUserAchievements(userBId);
    expect(userBAchievements.every((a) => !a.unlocked)).toBe(true);
    expect(userB.achievements).toHaveLength(0);
  });
});

describe('Sprint 4: Titles (Scenarios 20-22)', () => {
  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();

  test('20. Valid unlocked title can be equipped', async () => {
    const user = createTestUser(userAId);
    user.unlockedTitles.push('Legend');

    const result = await equipTitle(userAId, 'Legend');
    expect(result.equippedTitle).toBe('Legend');
    expect(user.equippedTitle).toBe('Legend');
  });

  test('21. Locked/unowned title cannot be equipped', async () => {
    createTestUser(userAId); // only has ['Rookie']
    await expect(equipTitle(userAId, 'Legend')).rejects.toThrow('Title not unlocked');
    await expect(equipTitle(userAId, 'Arbitrary Hack Title')).rejects.toThrow('Title not unlocked');
  });

  test("22. User A cannot equip User B's title", async () => {
    createTestUser(userAId); // 'Rookie' only
    const userB = createTestUser(userBId);
    userB.unlockedTitles.push('Boss Slayer');

    // User A cannot equip 'Boss Slayer'
    await expect(equipTitle(userAId, 'Boss Slayer')).rejects.toThrow('Title not unlocked');
  });
});

describe('Sprint 4: Avatar / Cosmetics (Scenarios 23-25)', () => {
  const userAId = new Types.ObjectId().toString();
  const userBId = new Types.ObjectId().toString();

  test('23. Owned cosmetic can be equipped', async () => {
    const user = createTestUser(userAId);
    user.inventory.push('frame_gold');

    const result = await equipCosmetic(userAId, 'frame_gold');
    expect(result.equippedFrame).toBe('frame_gold');
    expect(user.equippedFrame).toBe('frame_gold');
  });

  test('24. Unowned cosmetic cannot be equipped', async () => {
    createTestUser(userAId);
    await expect(equipCosmetic(userAId, 'frame_gold')).rejects.toThrow('Item not owned');
  });

  test("25. User A cannot equip User B's cosmetic", async () => {
    createTestUser(userAId);
    const userB = createTestUser(userBId);
    userB.inventory.push('aura_spark');

    await expect(equipCosmetic(userAId, 'aura_spark')).rejects.toThrow('Item not owned');
  });
});

describe('Sprint 4: Companion (Scenarios 26-27)', () => {
  const userAId = new Types.ObjectId().toString();

  test('26. Valid owned companion can be equipped', async () => {
    const user = createTestUser(userAId);
    user.inventory.push('companion_cat');

    const result = await equipCosmetic(userAId, 'companion_cat');
    expect(result.equippedCompanion).toBe('companion_cat');
    expect(user.equippedCompanion).toBe('companion_cat');
  });

  test('27. Unowned companion cannot be equipped', async () => {
    createTestUser(userAId);
    await expect(equipCosmetic(userAId, 'companion_dragon')).rejects.toThrow('Item not owned');
  });
});
