import { Types } from 'mongoose';
import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { WORLDS, WORLD_TITLES } from '../constants/worlds';

/**
 * Sprint 7B — "What should I do now?" recommendation engine (NOT AI/LLM).
 *
 * Purely deterministic: ONE recommendation derived from persisted player
 * data only. Never writes anything, never invents quest IDs, never reads
 * client input, never exposes another user's quests. Same database state
 * => same output (every tie is broken by a stable key, ending in _id).
 *
 * Signals used (all existing data):
 *  - pending quests owned by the player (actionable candidates)
 *  - deadlines (overdue detection)
 *  - currentStreak + lastCompletionDate (streak context; local-date math
 *    mirrors progressionService.updateStreak so we never contradict it)
 *  - completions in the last 7 UTC days by world (variety: prefer a world
 *    the player hasn't been active in recently when a reasonable option
 *    exists; windows match the Sprint 7A analytics service)
 *
 * DOCUMENTED PRIORITY ORDER (first rule whose condition holds wins):
 *  1. OVERDUE    – an existing pending quest whose deadline has passed
 *  2. STREAK     – streak > 0 and nothing completed today (streak at risk)
 *  3. MOMENTUM   – no completions at all in the last 7 days (restart
 *                  nudge; checked before variety because with zero recent
 *                  completions every world would look "fresh")
 *  4. variety    – among pending quests the sort prefers worlds NOT active
 *                  in the last 7 days, then the least-active recent world;
 *                  label FRESH_WORLD when the chosen world is "fresh",
 *                  NEXT_QUEST when it is already active recently
 *  5. fallback   – no pending quest exists: GET_STARTED (no quests yet) or
 *                  QUICK_START (all quests cleared) -> advisory
 *                  CREATE_QUICK_QUEST; nothing is ever created automatically.
 *
 * Candidate sort key (ascending): overdue-first flag, fresh-world flag,
 * recent-7d completion count of the world, deadline (nulls last),
 * createdAt, _id string.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type NextActionType = 'COMPLETE_QUEST' | 'CREATE_QUICK_QUEST';
export type NextActionPriority =
  | 'OVERDUE'
  | 'STREAK'
  | 'FRESH_WORLD'
  | 'NEXT_QUEST'
  | 'MOMENTUM'
  | 'GET_STARTED'
  | 'QUICK_START';

export interface NextActionResponse {
  recommendation: {
    actionType: NextActionType;
    title: string;
    reason: string;
    questId: string | null; // real pending quest _id, or null for fallback
    world: string | null; // title case, e.g. "Health"
    priority: NextActionPriority;
    metadata: {
      currentStreak: number;
      streakAtRisk: boolean;
      pendingQuests: number;
      recentWorlds: string[]; // worlds with completions in the last 7 days
    };
  };
  context: {
    hasQuests: boolean;
    totalQuests: number;
    pendingQuests: number;
    completedToday: boolean;
    activeLast7Days: boolean;
  };
}

const utcStartOfDay = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Same local-date normalization as progressionService.updateStreak. */
const localDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const ms = (v: unknown, fallback = 0): number => {
  if (!v) return fallback;
  const t = new Date(v as string | Date).getTime();
  return Number.isNaN(t) ? fallback : t;
};

const isoDate = (t: number): string => {
  const d = new Date(t);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
};

/**
 * Determine the player's single next recommended action.
 * Read-only; throws { status: 404 } for a missing user (project convention).
 * `now` is injectable so tests are date-independent.
 */
export const getNextAction = async (
  userId: string | Types.ObjectId,
  now: Date = new Date(),
): Promise<NextActionResponse> => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };

  const quests = await Quest.find({ owner: new Types.ObjectId(String(userId)) });

  const nowMs = now.getTime();
  const startLast7 = utcStartOfDay(nowMs) - 6 * DAY_MS;

  const pending: any[] = [];
  let totalQuests = 0;
  const recentCounts = new Map<string, number>(); // world -> completions (last 7d, UTC)
  let activeLast7Days = false;

  for (const q of quests as any[]) {
    totalQuests += 1;
    if (q.status === 'pending') {
      pending.push(q);
      continue;
    }
    const t = ms(q.completedAt, NaN);
    if (!Number.isNaN(t) && t >= startLast7) {
      activeLast7Days = true;
      const cat = String(q.category || '');
      recentCounts.set(cat, (recentCounts.get(cat) || 0) + 1);
    }
  }

  /* ---------- streak context (mirrors updateStreak's local-day math) ---------- */
  const last = user.lastCompletionDate ? new Date(user.lastCompletionDate) : null;
  const completedToday = !!last && localDay(last) === localDay(now);
  const currentStreak = user.currentStreak || 0;
  const streakAtRisk = currentStreak > 0 && !completedToday;

  const recentWorlds: string[] = WORLDS.map((w) => WORLD_TITLES[w]).filter((t) =>
    recentCounts.has(t),
  );

  const buildContext = (): NextActionResponse['context'] => ({
    hasQuests: totalQuests > 0,
    totalQuests,
    pendingQuests: pending.length,
    completedToday,
    activeLast7Days,
  });

  /* ---------- Fallback: no actionable (pending) quest ---------- */
  if (pending.length === 0) {
    const clearedLog = totalQuests > 0;
    return {
      recommendation: {
        actionType: 'CREATE_QUICK_QUEST',
        title: 'Start a quick quest',
        reason: clearedLog
          ? `All ${totalQuests} of your quests are cleared — start a quick quest to keep your momentum.`
          : 'Your adventure log is empty — create your first quick quest and your stats will start tracking.',
        questId: null,
        world: null,
        priority: clearedLog ? 'QUICK_START' : 'GET_STARTED',
        metadata: {
          currentStreak,
          streakAtRisk,
          pendingQuests: 0,
          recentWorlds,
        },
      },
      context: buildContext(),
    };
  }

  /* ---------- Deterministic candidate selection (documented sort key) ---------- */
  const sorted = [...pending].sort((a, b) => {
    const aOver = a.deadline && ms(a.deadline) < nowMs ? 0 : 1;
    const bOver = b.deadline && ms(b.deadline) < nowMs ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver; // 1. overdue first
    const aFresh = recentCounts.has(String(a.category)) ? 1 : 0;
    const bFresh = recentCounts.has(String(b.category)) ? 1 : 0;
    if (aFresh !== bFresh) return aFresh - bFresh; // 2. fresh world first
    const aRec = recentCounts.get(String(a.category)) || 0;
    const bRec = recentCounts.get(String(b.category)) || 0;
    if (aRec !== bRec) return aRec - bRec; // 3. least-active recent world
    const aDl = a.deadline ? ms(a.deadline) : Infinity;
    const bDl = b.deadline ? ms(b.deadline) : Infinity;
    if (aDl !== bDl) return aDl - bDl; // 4. earliest deadline (nulls last)
    const aCreated = ms(a.createdAt);
    const bCreated = ms(b.createdAt);
    if (aCreated !== bCreated) return aCreated - bCreated; // 5. oldest first
    return String(a._id).localeCompare(String(b._id)); // 6. stable _id tie-break
  });

  const chosen = sorted[0];
  const chosenWorld = String(chosen.category || '');
  const isOverdue = !!chosen.deadline && ms(chosen.deadline) < nowMs;
  const chosenIsFresh = !recentCounts.has(chosenWorld);

  let priority: NextActionPriority;
  let reason: string;
  if (isOverdue) {
    priority = 'OVERDUE';
    reason = `Past its deadline (${isoDate(ms(chosen.deadline))}) — the oldest fire to put out first.`;
  } else if (streakAtRisk) {
    priority = 'STREAK';
    reason = `You're on a ${currentStreak}-day streak with nothing completed today — one quest keeps it alive.`;
  } else if (!activeLast7Days) {
    priority = 'MOMENTUM';
    reason = 'No quest cleared in the last 7 days — one small quest is the fastest way to restart your rhythm.';
  } else if (chosenIsFresh) {
    priority = 'FRESH_WORLD';
    reason = `You've been busy in ${recentWorlds.join(', ')} lately — a turn in ${chosenWorld} keeps your worlds balanced.`;
  } else {
    priority = 'NEXT_QUEST';
    reason = `Your next quest in ${chosenWorld} is ready when you are.`;
  }

  return {
    recommendation: {
      actionType: 'COMPLETE_QUEST',
      title: String(chosen.title || 'Your next quest'),
      reason,
      questId: String(chosen._id),
      world: chosenWorld || null,
      priority,
      metadata: {
        currentStreak,
        streakAtRisk,
        pendingQuests: pending.length,
        recentWorlds,
      },
    },
    context: buildContext(),
  };
};

