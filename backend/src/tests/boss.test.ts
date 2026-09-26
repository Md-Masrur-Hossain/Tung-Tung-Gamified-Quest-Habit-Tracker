import { Types } from 'mongoose';
import {
  createBoss,
  getBosses,
  getBossById,
  completeBossAction,
  maxBossActionXp,
  resolveBossActionXp,
  MAX_BOSS_ACTION_XP,
  BOSS_XP_PER_DAMAGE,
} from '../services/bossService';
import * as progressionService from '../services/progressionService';
import { Boss } from '../models/Boss';
import { BossAction } from '../models/BossAction';
import { User } from '../models/User';

// In-memory test state
let mockBosses: any[] = [];
let mockBossActions: any[] = [];
let mockUsers: any[] = [];

// Setup Mongoose model mocks
beforeEach(() => {
  mockBosses = [];
  mockBossActions = [];
  mockUsers = [];
  jest.clearAllMocks();

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

  jest.spyOn(Boss, 'find').mockImplementation(((filter: any) => {
    const results = mockBosses.filter((b) => {
      if (filter.owner && b.owner.toString() !== filter.owner.toString()) return false;
      if (filter.category && b.category !== filter.category) return false;
      return true;
    });
    return {
      populate: jest.fn().mockImplementation(() => {
        return Promise.resolve(
          results.map((b) => ({
            ...b,
            actions: mockBossActions.filter((a) => b.actions?.some((id: any) => id.toString() === a._id.toString())),
          }))
        );
      }),
    } as any;
  }) as any);

  jest.spyOn(Boss, 'findOne').mockImplementation(((filter: any) => {
    const result = mockBosses.find((b) => {
      if (filter._id && b._id.toString() !== filter._id.toString()) return false;
      if (filter.owner && b.owner.toString() !== filter.owner.toString()) return false;
      return true;
    });
    return {
      populate: jest.fn().mockImplementation(() => {
        if (!result) return Promise.resolve(null);
        return Promise.resolve({
          ...result,
          actions: mockBossActions.filter((a) => result.actions?.some((id: any) => id.toString() === a._id.toString())),
        });
      }),
    } as any;
  }) as any);

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

  jest.spyOn(User, 'findById').mockImplementation(((id: any) => {
    const user = mockUsers.find((u) => u._id.toString() === id.toString()) || {
      _id: id,
      username: 'testuser',
      totalXP: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      save: jest.fn().mockResolvedValue(true),
    };
    return Promise.resolve(user) as any;
  }) as any);
});

describe('Sprint 3: Boss Battles Requirements (Scenarios 1-13)', () => {
  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();

  test('1. Boss creation succeeds for authenticated user', async () => {
    const boss = await createBoss(userA, {
      title: 'Procrastination Dragon',
      description: 'Defeat laziness',
      category: 'WORK',
      maxHp: 100,
      actions: [
        { title: 'Write unit tests', damage: 30, xpReward: 50 },
        { title: 'Review pull request', damage: 40, xpReward: 60 },
      ],
    });

    expect(boss).toBeDefined();
    expect(boss.title).toBe('Procrastination Dragon');
    expect(boss.owner.toString()).toBe(userA);
    expect(boss.maxHp).toBe(100);
    expect(boss.currentHp).toBe(100);
    expect(boss.status).toBe('ACTIVE');
    expect(boss.actions).toHaveLength(2);
  });

  test('2. Boss data is owner-scoped', async () => {
    await createBoss(userA, {
      title: 'User A Boss',
      category: 'HEALTH',
      maxHp: 50,
      actions: [{ title: 'Workout', damage: 50 }],
    });
    await createBoss(userB, {
      title: 'User B Boss',
      category: 'STUDY',
      maxHp: 60,
      actions: [{ title: 'Study', damage: 60 }],
    });

    const userABosses = await getBosses(userA);
    expect(userABosses).toHaveLength(1);
    expect(userABosses[0].title).toBe('User A Boss');

    const userBBosses = await getBosses(userB);
    expect(userBBosses).toHaveLength(1);
    expect(userBBosses[0].title).toBe('User B Boss');
  });

  test("3. User A cannot access/modify User B's boss", async () => {
    const bossB = await createBoss(userB, {
      title: 'User B Private Boss',
      category: 'FITNESS',
      maxHp: 100,
      actions: [{ title: 'Run 5km', damage: 50 }],
    });

    // User A querying User B's boss returns null
    const result = await getBossById(userA, bossB._id.toString());
    expect(result).toBeNull();

    // User A trying to complete User B's boss action is rejected with 'Not authorized'
    const actionId = bossB.actions[0].toString();
    await expect(completeBossAction(userA, bossB._id.toString(), actionId)).rejects.toThrow('Not authorized');
  });

  test('4. Boss action creation works', async () => {
    await createBoss(userA, {
      title: 'Action Test Boss',
      category: 'HOBBY',
      maxHp: 80,
      actions: [
        { title: 'Paint landscape', damage: 30, xpReward: 25 },
        { title: 'Varnish canvas', damage: 50, xpReward: 50 },
      ],
    });

    expect(mockBossActions).toHaveLength(2);
    expect(mockBossActions[0].title).toBe('Paint landscape');
    expect(mockBossActions[0].damage).toBe(30);
    expect(mockBossActions[0].completed).toBe(false);
  });

  test('5. Completing an action marks it completed', async () => {
    const boss = await createBoss(userA, {
      title: 'Mark Completed Boss',
      category: 'PERSONAL',
      maxHp: 100,
      actions: [{ title: 'Clean desk', damage: 20, xpReward: 10 }],
    });

    const actionId = boss.actions[0].toString();
    const result = await completeBossAction(userA, boss._id.toString(), actionId);

    expect(result.action.completed).toBe(true);
    const storedAction = mockBossActions.find((a) => a._id.toString() === actionId);
    expect(storedAction.completed).toBe(true);
  });

  test('6. Completing an action decreases HP by exactly its damage amount', async () => {
    const boss = await createBoss(userA, {
      title: 'Damage Calculation Boss',
      category: 'HOME',
      maxHp: 100,
      actions: [{ title: 'Fix sink', damage: 35, xpReward: 20 }],
    });

    const actionId = boss.actions[0].toString();
    const result = await completeBossAction(userA, boss._id.toString(), actionId);

    expect(result.boss.currentHp).toBe(65); // 100 - 35
  });

  test('7. Completing the same action twice does NOT apply damage twice', async () => {
    const boss = await createBoss(userA, {
      title: 'Duplicate Protection Boss',
      category: 'OTHER',
      maxHp: 100,
      actions: [{ title: 'Single Strike', damage: 40 }],
    });

    const actionId = boss.actions[0].toString();
    await completeBossAction(userA, boss._id.toString(), actionId);
    expect(boss.currentHp).toBe(60);

    // Attempt second completion
    await expect(completeBossAction(userA, boss._id.toString(), actionId)).rejects.toThrow('Action already completed');
    expect(boss.currentHp).toBe(60); // damage not reapplied
  });

  test('8. HP never goes below 0', async () => {
    const boss = await createBoss(userA, {
      title: 'Overkill Boss',
      category: 'HEALTH',
      maxHp: 50,
      actions: [{ title: 'Massive Strike', damage: 999 }],
    });

    const actionId = boss.actions[0].toString();
    const result = await completeBossAction(userA, boss._id.toString(), actionId);

    expect(result.boss.currentHp).toBe(0);
    expect(result.boss.currentHp).not.toBeLessThan(0);
  });

  test('9. Boss becomes DEFEATED exactly when HP reaches 0', async () => {
    const boss = await createBoss(userA, {
      title: 'Defeat Threshold Boss',
      category: 'WORK',
      maxHp: 50,
      actions: [
        { title: 'Strike 1', damage: 30 },
        { title: 'Finishing Strike', damage: 20 },
      ],
    });

    // First strike: 50 - 30 = 20 (still ACTIVE)
    const res1 = await completeBossAction(userA, boss._id.toString(), boss.actions[0].toString());
    expect(res1.boss.currentHp).toBe(20);
    expect(res1.boss.status).toBe('ACTIVE');

    // Second strike: 20 - 20 = 0 (now DEFEATED)
    const res2 = await completeBossAction(userA, boss._id.toString(), boss.actions[1].toString());
    expect(res2.boss.currentHp).toBe(0);
    expect(res2.boss.status).toBe('DEFEATED');
  });

  test('10. A defeated Boss cannot receive further damage', async () => {
    const boss = await createBoss(userA, {
      title: 'Dead Boss',
      category: 'WORK',
      maxHp: 30,
      actions: [
        { title: 'Lethal Hit', damage: 30 },
        { title: 'Hit Dead Horse', damage: 10 },
      ],
    });

    await completeBossAction(userA, boss._id.toString(), boss.actions[0].toString());
    expect(boss.status).toBe('DEFEATED');

    // Attempt action on defeated boss
    await expect(completeBossAction(userA, boss._id.toString(), boss.actions[1].toString())).rejects.toThrow(
      'Boss already defeated'
    );
  });

  test('11. Negative/non-numeric/invalid damage is rejected', async () => {
    // Negative damage in action
    await expect(
      createBoss(userA, {
        title: 'Invalid Damage Boss',
        category: 'STUDY',
        maxHp: 100,
        actions: [{ title: 'Bad Action', damage: -10 }],
      })
    ).rejects.toThrow(/Invalid action damage/);

    // Non-numeric damage
    await expect(
      createBoss(userA, {
        title: 'Non-numeric Boss',
        category: 'STUDY',
        maxHp: 100,
        actions: [{ title: 'Bad Action', damage: 'NaN' as any }],
      })
    ).rejects.toThrow(/Invalid action damage/);

    // Zero damage
    await expect(
      createBoss(userA, {
        title: 'Zero Damage Boss',
        category: 'STUDY',
        maxHp: 100,
        actions: [{ title: 'Zero Action', damage: 0 }],
      })
    ).rejects.toThrow(/Invalid action damage/);

    // Negative maxHp
    await expect(
      createBoss(userA, {
        title: 'Negative HP Boss',
        category: 'STUDY',
        maxHp: -50,
        actions: [{ title: 'Action', damage: 10 }],
      })
    ).rejects.toThrow(/Invalid maxHp/);
  });

  test('12. An action from another Boss cannot be completed through a different boss ID', async () => {
    const boss1 = await createBoss(userA, {
      title: 'Boss One',
      category: 'WORK',
      maxHp: 50,
      actions: [{ title: 'Task 1', damage: 20 }],
    });

    const boss2 = await createBoss(userA, {
      title: 'Boss Two',
      category: 'WORK',
      maxHp: 50,
      actions: [{ title: 'Task 2', damage: 20 }],
    });

    // Attempt to complete boss2's action via boss1's endpoint
    const boss2ActionId = boss2.actions[0].toString();
    await expect(completeBossAction(userA, boss1._id.toString(), boss2ActionId)).rejects.toThrow(
      'Action does not belong to this boss'
    );
  });

  test('13. XP is awarded through the existing progression engine, not a duplicate XP implementation', async () => {
    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');

    const boss = await createBoss(userA, {
      title: 'XP Engine Boss',
      category: 'STUDY',
      maxHp: 100,
      actions: [{ title: 'Read Chapter', damage: 25, xpReward: 80 }],
    });

    const actionId = boss.actions[0].toString();
    await completeBossAction(userA, boss._id.toString(), actionId);

    // Verifies progressionService.awardXp was invoked directly with the correct amount
    expect(awardXpSpy).toHaveBeenCalledTimes(1);
    expect(awardXpSpy).toHaveBeenCalledWith(expect.any(Types.ObjectId), 80);
  });

  /* ------------------------------------------------------------------
     Sprint 8 Step 4 - server-authoritative boss XP.

     A client may still request an XP amount, but the stored value and the
     awarded value are always bounded server-side by
     min(MAX_BOSS_ACTION_XP, damage * BOSS_XP_PER_DAMAGE).
     ------------------------------------------------------------------ */
  test('14. a forged excessive xpReward is clamped to the server-side bound', async () => {
    const boss = await createBoss(userA, {
      title: 'Forged Reward Boss',
      category: 'STUDY',
      maxHp: 100,
      actions: [{ title: 'Forge Reward', damage: 10, xpReward: 999999 }],
    });

    const actionId = boss.actions[0].toString();
    const stored = mockBossActions.find((a) => a._id.toString() === actionId);

    expect(stored.xpReward).toBe(40); // min(100, 10 * 4) - never 999999
    expect(stored.xpReward).toBe(maxBossActionXp(10));
    expect(stored.xpReward).toBeLessThanOrEqual(MAX_BOSS_ACTION_XP);

    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');
    await completeBossAction(userA, boss._id.toString(), actionId);

    expect(awardXpSpy).toHaveBeenCalledTimes(1);
    expect(awardXpSpy).toHaveBeenCalledWith(expect.any(Types.ObjectId), 40);
  });

  test('15. a tampered stored xpReward is clamped again at completion time', async () => {
    const boss = await createBoss(userA, {
      title: 'Tampered Value Boss',
      category: 'WORK',
      maxHp: 50,
      actions: [{ title: 'Strike', damage: 10, xpReward: 10 }],
    });

    const actionId = boss.actions[0].toString();
    // Simulate a legacy document written before this hardening, or a direct DB edit.
    mockBossActions.find((a) => a._id.toString() === actionId).xpReward = 999999;

    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');
    await completeBossAction(userA, boss._id.toString(), actionId);

    expect(awardXpSpy).toHaveBeenCalledTimes(1);
    expect(awardXpSpy).toHaveBeenCalledWith(expect.any(Types.ObjectId), 40);
  });

  test('16. legitimate XP below the bound is preserved, and no request means no award', async () => {
    const boss = await createBoss(userA, {
      title: 'Legitimate Reward Boss',
      category: 'FITNESS',
      maxHp: 100,
      actions: [
        { title: 'Warm up', damage: 30, xpReward: 50 },
        { title: 'Cool down', damage: 50 },
      ],
    });

    expect(mockBossActions[0].xpReward).toBe(50); // unchanged behaviour
    expect(mockBossActions[1].xpReward).toBe(0); // omitted -> no XP

    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');
    await completeBossAction(userA, boss._id.toString(), boss.actions[0].toString());
    expect(awardXpSpy).toHaveBeenCalledWith(expect.any(Types.ObjectId), 50);

    await completeBossAction(userA, boss._id.toString(), boss.actions[1].toString());
    expect(awardXpSpy).toHaveBeenCalledTimes(1); // still only the first action awarded XP
  });

  test('17. the XP bound is damage-derived, globally capped and rejects junk input', () => {
    expect(BOSS_XP_PER_DAMAGE).toBe(4);
    expect(maxBossActionXp(10)).toBe(40);
    expect(maxBossActionXp(25)).toBe(100);
    expect(maxBossActionXp(1000)).toBe(MAX_BOSS_ACTION_XP);
    expect(resolveBossActionXp(10, 999999)).toBe(40);
    expect(resolveBossActionXp(30, 50)).toBe(50);
    expect(resolveBossActionXp(10, -5)).toBe(0);
    expect(resolveBossActionXp(10, Number.NaN)).toBe(0);
    expect(resolveBossActionXp(10, undefined)).toBe(0);
    expect(resolveBossActionXp(10, 'not-a-number' as any)).toBe(0);
  });
});
