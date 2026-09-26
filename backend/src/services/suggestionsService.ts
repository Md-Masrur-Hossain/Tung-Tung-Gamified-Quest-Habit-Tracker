import { Types } from 'mongoose';
import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { WORLDS, WORLD_TITLES } from '../constants/worlds';

/**
 * Sprint 7C — Smart Suggestions engine (NOT AI/LLM, read-only).
 *
 * Generates at most 3 short, actionable suggestions from the player's own
 * persisted data. Never writes, never awards anything, never compares the
 * player to anyone else, never reads client input. Same state => same
 * output (every choice has stable tie-breaks ending in _id).
 *
 * Signals (all existing data; windows match Sprint 7A analytics):
 *  - currentStreak + lastCompletionDate (streak context; local-day math
 *    mirrors progressionService.updateStreak / Sprint 7B)
 *  - completions by world within the last 7 UTC days (balance)
 *  - last-7-day vs previous-7-day completion totals (momentum/baseline)
 *  - pending quest count + difficulty (backlog; "manageable" pick)
 *
 * DOCUMENTED PRIORITY ORDER (evaluation order; first 3 that match are
 * returned, each type at most once):
 *  1. STREAK          – streak > 0 and nothing completed today
 *  2. WORLD_BALANCE   – active in the last 7 days AND ≥1 world with zero
 *                       recent activity (suggests the first quiet world
 *                       in WORLDS order)
 *  3. MOMENTUM        – previous-7d total > last-7d total AND a pending
 *                       quest exists (suggests the easiest pending quest:
 *                       difficulty rank, then oldest createdAt, then _id)
 *  4. QUEST_BACKLOG   – pending quests ≥ BACKLOG_THRESHOLD (5)
 *  5. RECENT_SUCCESS  – ≥1 completion in the last 7 days
 *                       (suppressed when MOMENTUM fired — contradictory tone)
 *  6. INACTIVE_PLAYER – zero completions in the last 7 days
 *                       (suppressed when MOMENTUM fired — redundant; has a
 *                       distinct empty-log message for brand-new players)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimum pending quests before the backlog suggestion fires. */
export const BACKLOG_THRESHOLD = 5;

export type SuggestionType =
  | 'STREAK'
  | 'WORLD_BALANCE'
  | 'MOMENTUM'
  | 'QUEST_BACKLOG'
  | 'RECENT_SUCCESS'
  | 'INACTIVE_PLAYER';

export interface SmartSuggestion {
  type: SuggestionType;
  title: string;
  message: string;
  world: string | null;
  metadata: Record<string, string | number | boolean | string[]>;
}

export interface SuggestionsResponse {
  suggestions: SmartSuggestion[]; // 0–3 entries, unique types
}

const utcStartOfDay = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Same local-day normalization as progressionService.updateStreak. */
const localDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const ms = (v: unknown, fallback = 0): number => {
  if (!v) return fallback;
  const t = new Date(v as string | Date).getTime();
  return Number.isNaN(t) ? fallback : t;
};

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2, epic: 3 };

/**
 * Build the player's smart suggestions (0–3 entries).
 * Read-only; throws { status: 404 } for a missing user (project convention).
 * `now` is injectable so tests are date-independent.
 */
export const getSuggestions = async (
  userId: string | Types.ObjectId,
  now: Date = new Date(),
): Promise<SuggestionsResponse> => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };

  const quests = await Quest.find({ owner: new Types.ObjectId(String(userId)) });

  const nowMs = now.getTime();
  const startLast7 = utcStartOfDay(nowMs) - 6 * DAY_MS;
  const startPrev7 = startLast7 - 7 * DAY_MS;

  const pending: any[] = [];
  let totalQuests = 0;
  let last7Total = 0;
  let prev7Total = 0;
  const last7ByWorld = new Map<string, number>();

  for (const q of quests as any[]) {
    totalQuests += 1;
    if (q.status === 'pending') {
      pending.push(q);
      continue;
    }
    const t = ms(q.completedAt, NaN);
    if (Number.isNaN(t)) continue;
    if (t >= startLast7) {
      last7Total += 1;
      const cat = String(q.category || '');
      last7ByWorld.set(cat, (last7ByWorld.get(cat) || 0) + 1);
    } else if (t >= startPrev7) {
      prev7Total += 1;
    }
  }

  /* ---------- derived signals ---------- */
  const last = user.lastCompletionDate ? new Date(user.lastCompletionDate) : null;
  const completedToday = !!last && localDay(last) === localDay(now);
  const currentStreak = user.currentStreak || 0;
  const streakAtRisk = currentStreak > 0 && !completedToday;

  const activeLast7 = last7Total > 0;
  const quietWorlds: string[] = WORLDS.map((w) => WORLD_TITLES[w]).filter(
    (title) => !(last7ByWorld.get(title) || 0),
  );
  const recentWorlds: string[] = WORLDS.map((w) => WORLD_TITLES[w]).filter((title) =>
    last7ByWorld.has(title),
  );

  // "Manageable" pending pick: easiest difficulty, oldest, stable _id.
  const manageable = [...pending].sort((a, b) => {
    const ra = DIFFICULTY_RANK[String(a.difficulty)] ?? 9;
    const rb = DIFFICULTY_RANK[String(b.difficulty)] ?? 9;
    if (ra !== rb) return ra - rb;
    const ca = ms(a.createdAt);
    const cb = ms(b.createdAt);
    if (ca !== cb) return ca - cb;
    return String(a._id).localeCompare(String(b._id));
  })[0];

  /* ---------- rule evaluation in documented priority order ---------- */
  const momentumFired = prev7Total > last7Total && pending.length > 0;
  const candidates: SmartSuggestion[] = [];

  if (streakAtRisk) {
    candidates.push({
      type: 'STREAK',
      title: 'Keep your streak alive',
      message: `You're on a ${currentStreak}-day streak with nothing completed today — one quest keeps it going.`,
      world: null,
      metadata: { currentStreak },
    });
  }

  if (activeLast7 && quietWorlds.length > 0) {
    const target = quietWorlds[0]; // first quiet world in WORLDS order
    const shown = recentWorlds.slice(0, 3).join(', ') + (recentWorlds.length > 3 ? '…' : '');
    candidates.push({
      type: 'WORLD_BALANCE',
      title: 'Balance your worlds',
      message:
        recentWorlds.length > 0
          ? `You've been active in ${shown} this week, but ${target} has been quiet — try a quest there.`
          : `${target} has been quiet this week — try a quest there.`,
      world: target,
      metadata: { suggestedWorld: target, recentWorlds, quietWorlds },
    });
  }

  if (momentumFired) {
    candidates.push({
      type: 'MOMENTUM',
      title: 'Pick your pace back up',
      message: `You cleared ${prev7Total} quests in the previous 7 days and ${last7Total} in the last 7 — start with "${manageable.title}".`,
      world: manageable.category ? String(manageable.category) : null,
      metadata: {
        last7Days: last7Total,
        previous7Days: prev7Total,
        pendingQuests: pending.length,
        suggestedQuestId: String(manageable._id),
        suggestedQuestTitle: String(manageable.title),
      },
    });
  }

  if (pending.length >= BACKLOG_THRESHOLD) {
    candidates.push({
      type: 'QUEST_BACKLOG',
      title: 'Clear the backlog',
      message: `You have ${pending.length} quests waiting in your log — clear one before adding more.`,
      world: null,
      metadata: { pendingQuests: pending.length },
    });
  }

  if (activeLast7 && !momentumFired) {
    candidates.push({
      type: 'RECENT_SUCCESS',
      title: 'Nice momentum',
      message: `You've cleared ${last7Total} quest${last7Total === 1 ? '' : 's'} in the last 7 days — keep the good run going.`,
      world: null,
      metadata: { last7Days: last7Total },
    });
  }

  if (!activeLast7 && !momentumFired) {
    candidates.push({
      type: 'INACTIVE_PLAYER',
      title: totalQuests === 0 ? 'Start your adventure' : 'Ease back in',
      message:
        totalQuests === 0
          ? 'Your quest log is empty — clear your first quest to start building your stats.'
          : "It's been a quiet week — one small quest is an easy way back in.",
      world: null,
      metadata: { last7Days: 0, totalQuests },
    });
  }

  /* ---------- cap at 3 (types are unique by construction) ---------- */
  return { suggestions: candidates.slice(0, 3) };
};

