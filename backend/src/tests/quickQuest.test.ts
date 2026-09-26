import { Types } from 'mongoose';
import { createQuickQuest, completeQuickQuest, getQuickQuests } from '../services/quickQuestService';
import * as progressionService from '../services/progressionService';
import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { WORLDS } from '../constants/worlds';

// In-memory test state
let mockQuests: any[] = [];
let mockUsers: any[] = [];

beforeEach(() => {
  mockQuests = [];
  mockUsers = [];
  jest.clearAllMocks();

  jest.spyOn(Quest, 'create').mockImplementation(async (data: any) => {
    const questObj: any = {
      _id: new Types.ObjectId(),
      ...data,
      status: data.status || 'pending',
      save: jest.fn().mockImplementation(async function (this: any) {
        return this;
      }),
    };
    mockQuests.push(questObj);
    return questObj as any;
  });

  jest.spyOn(Quest, 'find').mockImplementation(((filter: any) => {
    const results = mockQuests.filter((q) => {
      if (filter.owner && q.owner.toString() !== filter.owner.toString()) return false;
      if (filter.type && q.type !== filter.type) return false;
      if (filter.category && q.category !== filter.category) return false;
      return true;
    });
    return {
      sort: jest.fn().mockImplementation(() => {
        return Promise.resolve(results);
      }),
      populate: jest.fn().mockImplementation(() => {
        return Promise.resolve(results);
      }),
    } as any;
  }) as any);

  jest.spyOn(Quest, 'findOne').mockImplementation(((filter: any) => {
    const quest = mockQuests.find((q) => {
      if (filter._id && q._id.toString() !== filter._id.toString()) return false;
      if (filter.owner && q.owner.toString() !== filter.owner.toString()) return false;
      return true;
    });
    return Promise.resolve(quest || null) as any;
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

describe('Sprint 3: Quick Quests Requirements (Scenarios 14-22)', () => {
  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();

  test('14. Quick Quest creation succeeds', async () => {
    const quest = await createQuickQuest(userA, {
      title: 'Quick Stretch',
      category: 'FITNESS',
      difficulty: 'easy',
    });

    expect(quest).toBeDefined();
    expect(quest.title).toBe('Quick Stretch');
    expect(quest.owner.toString()).toBe(userA);
    expect(quest.type).toBe('quick');
    expect(quest.category).toBe('Fitness');
    expect(quest.status).toBe('pending');
    expect(quest.xpReward).toBe(40); // 50 * 0.8
  });

  test('15. Quick Quest is owner-scoped', async () => {
    await createQuickQuest(userA, {
      title: 'User A Quick Quest',
      category: 'HEALTH',
      difficulty: 'easy',
    });
    await createQuickQuest(userB, {
      title: 'User B Quick Quest',
      category: 'STUDY',
      difficulty: 'medium',
    });

    const userAQuests = await getQuickQuests(userA);
    expect(userAQuests).toHaveLength(1);
    expect(userAQuests[0].title).toBe('User A Quick Quest');

    const userBQuests = await getQuickQuests(userB);
    expect(userBQuests).toHaveLength(1);
    expect(userBQuests[0].title).toBe('User B Quick Quest');
  });

  test("16. User A cannot access/complete User B's Quick Quest", async () => {
    const questB = await createQuickQuest(userB, {
      title: 'Secret Task',
      category: 'WORK',
      difficulty: 'hard',
    });

    await expect(completeQuickQuest(userA, questB._id.toString())).rejects.toEqual(
      expect.objectContaining({ status: 404, message: expect.stringMatching(/not found or not owned/i) })
    );
  });

  test('17. Completing a Quick Quest marks it completed', async () => {
    const quest = await createQuickQuest(userA, {
      title: 'Drink Water',
      category: 'HEALTH',
      difficulty: 'easy',
    });

    const result = await completeQuickQuest(userA, quest._id.toString());
    expect(result.quest.status).toBe('completed');
    expect(result.quest.completedAt).toBeDefined();

    const stored = mockQuests.find((q) => q._id.toString() === quest._id.toString());
    expect(stored.status).toBe('completed');
  });

  test('18. Completing it twice does not award XP twice', async () => {
    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');

    const quest = await createQuickQuest(userA, {
      title: 'One-time Task',
      category: 'HOME',
      difficulty: 'easy',
    });

    // First completion
    await completeQuickQuest(userA, quest._id.toString());
    expect(awardXpSpy).toHaveBeenCalledTimes(1);

    // Second completion must fail and NOT call awardXp again
    await expect(completeQuickQuest(userA, quest._id.toString())).rejects.toEqual(
      expect.objectContaining({ status: 400, message: expect.stringMatching(/already completed/i) })
    );
    expect(awardXpSpy).toHaveBeenCalledTimes(1);
  });

  test('19. Quick Quest completion uses the existing calculateXpReward/progression flow', async () => {
    const calculateXpSpy = jest.spyOn(progressionService, 'calculateXpReward');
    const awardXpSpy = jest.spyOn(progressionService, 'awardXp');

    const quest = await createQuickQuest(userA, {
      title: 'Practice Guitar',
      category: 'HOBBY',
      difficulty: 'medium',
    });

    // Verify calculateXpReward('quick', 'medium') was called (100 * 0.8 = 80)
    expect(calculateXpSpy).toHaveBeenCalledWith('quick', 'medium');
    expect(quest.xpReward).toBe(80);

    await completeQuickQuest(userA, quest._id.toString());
    expect(awardXpSpy).toHaveBeenCalledWith(expect.any(Types.ObjectId), 80);
  });

  test('20. Invalid world/category is rejected', async () => {
    await expect(
      createQuickQuest(userA, {
        title: 'Fantasy Quest',
        category: 'DRAGON_WORLD',
        difficulty: 'easy',
      })
    ).rejects.toThrow(/Invalid world\/category/);
  });

  test('21. All eight valid worlds are accepted', async () => {
    for (const world of WORLDS) {
      const quest = await createQuickQuest(userA, {
        title: `Task for ${world}`,
        category: world,
        difficulty: 'easy',
      });
      expect(quest).toBeDefined();
      expect(quest.category.toUpperCase()).toBe(world);
    }
    expect(mockQuests).toHaveLength(8);
  });

  test('22. World filtering returns only the requested world', async () => {
    await createQuickQuest(userA, { title: 'Health Task', category: 'HEALTH', difficulty: 'easy' });
    await createQuickQuest(userA, { title: 'Fitness Task 1', category: 'FITNESS', difficulty: 'easy' });
    await createQuickQuest(userA, { title: 'Fitness Task 2', category: 'FITNESS', difficulty: 'easy' });
    await createQuickQuest(userA, { title: 'Work Task', category: 'WORK', difficulty: 'easy' });

    const fitnessQuests = await getQuickQuests(userA, 'FITNESS');
    expect(fitnessQuests).toHaveLength(2);
    expect(fitnessQuests.every((q) => q.category === 'Fitness')).toBe(true);

    const workQuests = await getQuickQuests(userA, 'WORK');
    expect(workQuests).toHaveLength(1);
    expect(workQuests[0].category === 'Work').toBe(true);
  });
});
