/**
 * Sprint 6A — Live Leaderboard (server-authoritative).
 *
 * Ranking is computed exclusively from persisted user progression
 * (totalXP / level / longestStreak / username). No client-supplied value ever
 * influences rank, XP, level, ordering, or membership.
 *
 * Realtime refresh: server-authoritative progression paths (awardXp,
 * updateStreak) call markLeaderboardDirty(); a single in-process ~5s trailing
 * debounce then recomputes the global top-50 and emits `leaderboard:updated`
 * to the existing `global` room through the realtime emitter. No Redis,
 * queues, or cron - plain setTimeout, matching the Sprint 6 single-process
 * foundation.
 */
import { User } from '../models/User';
import { getFriends } from './socialService';
import { emitGlobal, getIo } from '../realtime/emitter';

export type LeaderboardScope = 'global' | 'friends';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  level: number;
  totalXP: number;
  longestStreak: number;
}

export interface LeaderboardSnapshot {
  scope: LeaderboardScope;
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export const GLOBAL_LEADERBOARD_SIZE = 50;
export const FRIENDS_LEADERBOARD_MAX = 20;
export const LEADERBOARD_REFRESH_MS = 5000;

/**
 * Server-side ranking order: totalXP desc -> level desc -> longestStreak desc
 * -> username asc (final deterministic tie-breaker).
 */
export const LEADERBOARD_SORT_SPEC: Record<string, 1 | -1> = {
  totalXP: -1,
  level: -1,
  longestStreak: -1,
  username: 1,
};

/** Explicit projection - leaderboard payloads never include passwordHash/email/coins/... */
const LEADERBOARD_FIELDS = 'username level totalXP longestStreak';

const toEntry = (doc: any, rank: number): LeaderboardEntry => ({
  rank,
  userId: String(doc._id),
  username: doc.username,
  level: doc.level,
  totalXP: doc.totalXP,
  longestStreak: doc.longestStreak,
});

/**
 * Compute a leaderboard snapshot.
 * - global  : server-derived top 50 (size/order never client-influenceable).
 * - friends : authenticated self + accepted friends only, capped at 20.
 * `userId` must be the authenticated caller's id; callers never forward
 * client-supplied user ids here.
 */
export const getLeaderboard = async (
  scope: LeaderboardScope,
  userId?: string,
  limit?: number,
): Promise<LeaderboardSnapshot> => {
  const rawScope: string = scope;
  if (rawScope !== 'global' && rawScope !== 'friends') {
    throw { status: 400, message: 'Invalid leaderboard scope' };
  }

  if (scope === 'global') {
    const users = await User.find({})
      .sort(LEADERBOARD_SORT_SPEC)
      .limit(GLOBAL_LEADERBOARD_SIZE)
      .select(LEADERBOARD_FIELDS);
    return {
      scope,
      generatedAt: new Date().toISOString(),
      entries: users.map((u, i) => toEntry(u, i + 1)),
    };
  }

  if (!userId) {
    throw { status: 400, message: 'Authenticated user is required for the friends leaderboard' };
  }

  // Reuse the social service's accepted-friends helper (single source of
  // truth for friendship membership) and resolve ranking fields fresh from
  // the User collection: self + accepted friends only.
  const friendRows = await getFriends(userId);
  const ids = [userId, ...friendRows.map((r) => String((r.friend as any)?._id ?? r.friend))];
  const uniqueIds = Array.from(new Set(ids));

  const requested = Number.isFinite(limit) ? Math.floor(limit as number) : FRIENDS_LEADERBOARD_MAX;
  const capped = Math.min(Math.max(requested, 1), FRIENDS_LEADERBOARD_MAX);

  const users = await User.find({ _id: { $in: uniqueIds } })
    .sort(LEADERBOARD_SORT_SPEC)
    .limit(capped)
    .select(LEADERBOARD_FIELDS);

  return {
    scope,
    generatedAt: new Date().toISOString(),
    entries: users.map((u, i) => toEntry(u, i + 1)),
  };
};

/* ------------------------------------------------------------------
   Debounced realtime refresh (global scope only)
   ------------------------------------------------------------------ */
let dirty = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const flushLeaderboardRefresh = async (): Promise<void> => {
  refreshTimer = null;
  if (!dirty) return;
  dirty = false;
  // Only compute when a realtime server is attached; emitGlobal scopes the
  // payload to the `global` room (authenticated sockets only).
  if (!getIo()) return;
  try {
    const snapshot = await getLeaderboard('global');
    emitGlobal('leaderboard:updated', snapshot);
  } catch {
    // Best-effort: the next progression change marks dirty again.
  }
};

/**
 * Called from server-authoritative progression paths (awardXp, updateStreak)
 * whenever a ranking field changes. Trailing debounce ~5s; repeated marks
 * within the window coalesce into a single recompute + emit.
 * No-ops when no realtime server is attached (frozen unit tests, scripts).
 */
export const markLeaderboardDirty = (): void => {
  if (!getIo()) return;
  dirty = true;
  if (refreshTimer) return; // debounce window already pending
  refreshTimer = setTimeout(() => {
    void flushLeaderboardRefresh();
  }, LEADERBOARD_REFRESH_MS);
  if (typeof (refreshTimer as any).unref === 'function') (refreshTimer as any).unref();
};

/** Test/maintenance helper: cancel any pending refresh and clear the dirty flag. */
export const resetLeaderboardRefresh = (): void => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  dirty = false;
};