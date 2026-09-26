import { Types } from 'mongoose';
import { Boss, IBoss, BossStatus } from '../models/Boss';
import { BossAction, IBossAction } from '../models/BossAction';
import { User } from '../models/User';
import { awardXp, getProgression } from './progressionService';
import { checkAndUnlockAchievements } from './rewardService';
import { applyDailyBossCoinBonus } from '../realtime/dailyEvent';
import { normalizeWorld } from '../constants/worlds';

/* ------------------------------------------------------------------
   Server-authoritative boss XP (Sprint 8 Step 4)
   ------------------------------------------------------------------
   Boss action XP is bounded by server-side constants. A client may still
   request an amount, but the value that is stored - and the value that is
   awarded on completion - can never exceed the bound derived from the
   action's damage, nor the global per-action ceiling.

   The bounds are generous enough to keep every value the existing gameplay
   (and the existing tests) already uses: 4 XP per point of damage, at most
   100 XP per action. A forged xpReward (e.g. 999999) is therefore clamped
   instead of being minted.
   ------------------------------------------------------------------ */
export const BOSS_XP_PER_DAMAGE = 4;
export const MAX_BOSS_ACTION_XP = 100;

/** Highest XP the server will ever award for an action dealing `damage`. */
export const maxBossActionXp = (damage: number): number => {
  const safeDamage = Number.isFinite(damage) && damage > 0 ? damage : 0;
  return Math.min(MAX_BOSS_ACTION_XP, Math.floor(safeDamage * BOSS_XP_PER_DAMAGE));
};

/**
 * Resolve a (possibly client-supplied) XP request to the server-bounded value.
 * Never returns more than `maxBossActionXp(damage)`, and never a negative or
 * non-numeric amount.
 */
export const resolveBossActionXp = (damage: number, requestedXp?: number): number => {
  const requested = Number(requestedXp);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), maxBossActionXp(damage));
};

/**
 * Create a boss with associated actions.
 */
export const createBoss = async (
  userId: string,
  data: {
    title: string;
    description?: string;
    category: string;
    maxHp: number;
    actions: { title: string; damage: number; xpReward?: number }[];
  }
) => {
  if (!userId) {
    throw new Error('User ID is required');
  }
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Boss title is required');
  }
  const category = normalizeWorld(data.category);

  if (typeof data.maxHp !== 'number' || isNaN(data.maxHp) || data.maxHp <= 0) {
    throw new Error('Invalid maxHp: must be a positive number');
  }
  if (!Array.isArray(data.actions) || data.actions.length === 0) {
    throw new Error('Boss must have at least one action');
  }

  for (const a of data.actions) {
    if (!a.title || typeof a.title !== 'string' || !a.title.trim()) {
      throw new Error('Action title is required');
    }
    if (typeof a.damage !== 'number' || isNaN(a.damage) || a.damage <= 0) {
      throw new Error('Invalid action damage: must be a positive number');
    }
  }

  const boss = await Boss.create({
    owner: new Types.ObjectId(userId),
    title: data.title.trim(),
    description: data.description,
    category,
    maxHp: data.maxHp,
    currentHp: data.maxHp,
    status: 'ACTIVE' as BossStatus,
  });

  // create actions linked to boss
  const actionDocs = await BossAction.insertMany(
    data.actions.map((a) => ({
      boss: boss._id,
      title: a.title.trim(),
      damage: a.damage,
      xpReward: resolveBossActionXp(a.damage, a.xpReward),
      completed: false,
    }))
  );

  // reference actions in boss
  boss.actions = actionDocs.map((doc) => doc._id);
  await boss.save();
  return boss;
};

export const getBosses = async (userId: string, category?: string) => {
  const filter: any = { owner: new Types.ObjectId(userId) };
  if (category) {
    filter.category = normalizeWorld(category);
  }
  return Boss.find(filter).populate('actions');
};

export const getBossById = async (userId: string, bossId: string) => {
  return Boss.findOne({ _id: new Types.ObjectId(bossId), owner: new Types.ObjectId(userId) }).populate('actions');
};

/**
 * Complete a boss action.
 * - Verify action belongs to boss.
 * - Prevent duplicate completion.
 * - Reduce boss HP by damage (once).
 * - Award XP if defined.
 * - Set boss status to DEFEATED when HP reaches 0.
 * - Trigger boss defeat rewards and achievements.
 */
export const completeBossAction = async (userId: string, bossId: string, actionId: string) => {
  const action = await BossAction.findById(new Types.ObjectId(actionId)).populate('boss');
  if (!action) throw new Error('Action not found');
  const boss = action.boss as unknown as IBoss;
  if (!boss) throw new Error('Boss not found');

  // Verify action belongs to this boss
  if (bossId && boss._id.toString() !== bossId.toString()) {
    throw new Error('Action does not belong to this boss');
  }

  // Ownership check
  if (boss.owner.toString() !== userId) {
    throw new Error('Not authorized');
  }
  if (action.completed) {
    throw new Error('Action already completed');
  }
  if (boss.status === 'DEFEATED' || boss.currentHp <= 0) {
    throw new Error('Boss already defeated');
  }

  // Apply damage safely (HP never below 0)
  const newHp = Math.max(0, boss.currentHp - action.damage);
  boss.currentHp = newHp;
  const isDefeated = newHp === 0;
  if (isDefeated) {
    boss.status = 'DEFEATED' as BossStatus;
  }
  await boss.save();

  // Mark action completed
  action.completed = true;
  await action.save();

  // Award XP via the existing progression engine. The amount is re-derived from
  // the stored action and the server-side bound, so neither a forged create
  // payload nor a tampered/legacy stored value can mint extra XP.
  const xpToAward = resolveBossActionXp(action.damage, action.xpReward);
  if (xpToAward > 0) {
    await awardXp(new Types.ObjectId(userId), xpToAward);
  }

  // Handle boss defeat stats & rewards
  const user = await User.findById(new Types.ObjectId(userId));
  if (user) {
    if (isDefeated) {
      user.stats = user.stats || { questsCompleted: 0, bossesDefeated: 0 };
      user.stats.bossesDefeated = (user.stats.bossesDefeated || 0) + 1;
      // Award boss defeat bonus coins (Sprint 6C: BOSS_BONUS days grant +50
      // extra outside the test environment - frozen tests stay date-stable).
      user.coins = (user.coins || 0) + applyDailyBossCoinBonus(50);
      await user.save();

      // Check achievements for BOSS_SLAYER and BOSS_BREAKER
      await checkAndUnlockAchievements(user);
    }
  }

  const progression = await getProgression(new Types.ObjectId(userId));

  return { boss, action, progression };
};
