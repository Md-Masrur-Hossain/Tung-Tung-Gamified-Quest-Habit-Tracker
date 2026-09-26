import { Types } from 'mongoose';
import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { WORLDS, WORLD_TITLES } from '../constants/worlds';

/**
 * Sprint 7A — Player analytics foundation (read-only).
 *
 * Every number is derived from real persisted data owned by the caller:
 *  - User document: level, total XP, streaks (existing fields)
 *  - Quest documents: status/completedAt/category/xpReward
 * Nothing here writes to the database or changes gameplay/reward logic.
 *
 * Day bucketing uses the UTC calendar date (consistent with the Sprint 6C
 * daily-event derivation). Windows, relative to `now`:
 *  - today        : [startOfToday, ∞)
 *  - last7Days    : [startOfToday - 6d, ∞)   (7 days, includes today)
 *  - previous7Days: [startOfToday - 13d, startOfToday - 6d)
 * World grouping is all-time over completed quests (all 8 worlds always
 * present so an activity distribution can be shown even when sparse).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayActivity {
  date: string; // YYYY-MM-DD (UTC)
  questsCompleted: number;
  xpEarned: number;
}

export interface WindowActivity {
  questsCompleted: number;
  xpEarned: number;
}

export interface WorldActivity {
  world: string; // title case, e.g. "Health"
  completedQuests: number;
}

export interface AnalyticsSummary {
  overview: {
    level: number;
    totalXP: number;
    currentStreak: number;
    longestStreak: number;
    totalQuests: number;
    totalQuestsCompleted: number;
    /** completed / total quests, 4-decimal rounded; null when no quests exist. */
    completionRate: number | null;
  };
  recent: {
    today: WindowActivity;
    last7Days: WindowActivity & { activeDays: number };
    previous7Days: WindowActivity;
    /** 7 UTC day buckets ending today (zeros included). */
    byDay: DayActivity[];
  };
  worlds: {
    activity: WorldActivity[]; // all 8 worlds, all-time completions
    mostActiveWorld: string | null;
  };
}

const utcStartOfDay = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const utcDayKey = (t: number): string => {
  const d = new Date(t);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${day}`;
};

/**
 * Build the player analytics summary for ONE user.
 * Throws { status: 404 } when the user does not exist (same convention as
 * progressionService). `now` is injectable so tests are date-independent.
 */
export const getAnalyticsSummary = async (
  userId: string | Types.ObjectId,
  now: Date = new Date(),
): Promise<AnalyticsSummary> => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };

  // Single owner-scoped query; every aggregate below is derived from it.
  const quests = await Quest.find({ owner: new Types.ObjectId(String(userId)) });

  /* ---------- window boundaries (UTC) ---------- */
  const startOfToday = utcStartOfDay(now.getTime());
  const startLast7 = startOfToday - 6 * DAY_MS;
  const startPrev7 = startLast7 - 7 * DAY_MS;

  let totalQuestsCompleted = 0;
  let todayCount = 0;
  let todayXp = 0;
  let last7Count = 0;
  let last7Xp = 0;
  let prev7Count = 0;
  let prev7Xp = 0;

  // Ascending: oldest of the 7 days first, today last (chart-friendly).
  const dayStarts: number[] = [];
  for (let i = 0; i <= 6; i++) dayStarts.push(startLast7 + i * DAY_MS);
  const dayBuckets = dayStarts.map((start) => ({
    start,
    date: utcDayKey(start),
    questsCompleted: 0,
    xpEarned: 0,
  }));

  const worldCounts = new Map<string, number>();
  for (const title of Object.values(WORLD_TITLES)) worldCounts.set(title, 0);
  
  for (const q of quests as any[]) {
    const completed = q.status === 'completed';
    if (completed) {
      totalQuestsCompleted += 1;
      // Worlds: all-time over completed quests (legacy docs without
      // completedAt still have a category, so they count here).
      const title = String(q.category || '');
      if (worldCounts.has(title)) {
        worldCounts.set(title, (worldCounts.get(title) || 0) + 1);
      }
    }

    // Windowed / per-day metrics require a real completion timestamp.
    const raw = q.completedAt;
    const t = raw ? new Date(raw).getTime() : NaN;
    if (!completed || Number.isNaN(t)) continue;

    const xp = typeof q.xpReward === 'number' ? q.xpReward : 0;

    if (t >= startOfToday) {
      todayCount += 1;
      todayXp += xp;
    }
    if (t >= startLast7) {
      last7Count += 1;
      last7Xp += xp;
      const bucket = dayBuckets.find((b) => t >= b.start && t < b.start + DAY_MS);
      if (bucket) {
        bucket.questsCompleted += 1;
        bucket.xpEarned += xp;
      }
    } else if (t >= startPrev7) {
      prev7Count += 1;
      prev7Xp += xp;
    }
  }

  const totalQuests = quests.length;
  const completionRate =
    totalQuests > 0 ? Math.round((totalQuestsCompleted / totalQuests) * 10000) / 10000 : null;

  const activity: WorldActivity[] = WORLDS.map((w) => ({
    world: WORLD_TITLES[w],
    completedQuests: worldCounts.get(WORLD_TITLES[w]) || 0,
  }));
  let mostActiveWorld: string | null = null;
  for (const entry of activity) {
    if (entry.completedQuests > 0) {
      mostActiveWorld = entry.world; // first max in WORLDS order (ties -> earliest)
      break;
    }
  }

  return {
    overview: {
      level: user.level || 1,
      totalXP: user.totalXP || 0,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      totalQuests,
      totalQuestsCompleted,
      completionRate,
    },
    recent: {
      today: { questsCompleted: todayCount, xpEarned: todayXp },
      last7Days: {
        questsCompleted: last7Count,
        xpEarned: last7Xp,
        activeDays: dayBuckets.filter((b) => b.questsCompleted > 0).length,
      },
      previous7Days: { questsCompleted: prev7Count, xpEarned: prev7Xp },
      byDay: dayBuckets.map(({ date, questsCompleted, xpEarned }) => ({
        date,
        questsCompleted,
        xpEarned,
      })),
    },
    worlds: {
      activity,
      mostActiveWorld,
    },
  };
};

