/**
 * Sprint 6C — Deterministic daily events.
 *
 * The event for a calendar day is derived PURELY from the UTC date:
 *   - even UTC day-index -> DOUBLE_XP_WORLD (x2 XP)
 *   - odd  UTC day-index -> BOSS_BONUS (+50 boss coins on boss defeat)
 * Same `now` in, deeply-equal event out, forever. Consecutive days strictly
 * alternate. There is NO cron, NO scheduler, NO Redis, NO persistence and
 * NO Math.random anywhere in this module.
 *
 * Effect application (applyDailyXpBonus / applyDailyBossCoinBonus) is
 * enabled only outside the test environment so the frozen regression suite
 * (exact XP/coin assertions) can never become date-dependent.
 *
 * Day rollover is detected LAZILY (piggybacked on REST reads and socket
 * subscribes — same pattern as the 6A leaderboard debounce): the first
 * observation of a day only records it; a later observation of a NEW day
 * broadcasts `daily_event:updated` to the global room exactly once.
 */
import { emitGlobal } from './emitter';

export type DailyEventType = 'DOUBLE_XP_WORLD' | 'BOSS_BONUS';

export interface DailyEvent {
  /** YYYY-MM-DD in UTC — the deterministic key of the event. */
  date: string;
  type: DailyEventType;
  title: string;
  description: string;
  /** 2 on DOUBLE_XP_WORLD days, 1 otherwise. */
  xpMultiplier: number;
  /** 50 on BOSS_BONUS days, 0 otherwise. */
  bossCoinBonus: number;
}

/** Server->client event name (rollover broadcasts + subscribe snapshots). */
export const DAILY_EVENT_UPDATED = 'daily_event:updated';
/** The second read-only client->server event (Sprint 6C). */
export const DAILY_EVENT_SUBSCRIBE = 'daily_event:subscribe';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole UTC days since the epoch — parity defines the rotation. */
const utcDayIndex = (now: Date): number =>
  Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY_MS,
  );

const utcDateKey = (now: Date): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Pure: calendar date -> event. Same input, same output, forever. */
export const getDailyEvent = (now: Date = new Date()): DailyEvent => {
  const date = utcDateKey(now);
  const type: DailyEventType =
    Math.abs(utcDayIndex(now)) % 2 === 0 ? 'DOUBLE_XP_WORLD' : 'BOSS_BONUS';
  return type === 'DOUBLE_XP_WORLD'
    ? {
        date,
        type,
        title: 'Double XP World',
        description: 'All XP earned today is doubled (x2).',
        xpMultiplier: 2,
        bossCoinBonus: 0,
      }
    : {
        date,
        type,
        title: 'Boss Bonus Day',
        description: 'Defeating a boss today grants +50 bonus coins.',
        xpMultiplier: 1,
        bossCoinBonus: 50,
      };
};

/**
 * Event effects are DISABLED under Jest (NODE_ENV=test) so the frozen
 * exact-value assertions never become date-dependent. Checked per call
 * (not cached at import) so unit tests can toggle NODE_ENV deterministically.
 */
const eventsEnabled = (): boolean => process.env.NODE_ENV !== 'test';

/** DOUBLE_XP_WORLD days double the XP amount outside the test environment. */
export const applyDailyXpBonus = (baseXp: number, now: Date = new Date()): number => {
  if (!eventsEnabled()) return baseXp;
  const event = getDailyEvent(now);
  return event.type === 'DOUBLE_XP_WORLD' ? baseXp * event.xpMultiplier : baseXp;
};

/** BOSS_BONUS days add +50 boss coins outside the test environment. */
export const applyDailyBossCoinBonus = (baseCoins: number, now: Date = new Date()): number => {
  if (!eventsEnabled()) return baseCoins;
  const event = getDailyEvent(now);
  return event.type === 'BOSS_BONUS' ? baseCoins + event.bossCoinBonus : baseCoins;
};

/* ------------------------------------------------------------------
   Lazy day-rollover broadcast (no cron / no timers / no scheduler)
   ------------------------------------------------------------------ */
let lastObservedDate: string | null = null;

/**
 * Called from REST reads and socket subscribes. The first observation of a
 * day only records it; when the observed UTC day changes afterwards it
 * broadcasts `daily_event:updated` to the global room exactly once.
 * Returns true when a rollover emission happened.
 */
export const checkDailyEventRollover = (now: Date = new Date()): boolean => {
  const event = getDailyEvent(now);
  if (lastObservedDate === event.date) return false;
  const isFirstObservation = lastObservedDate === null;
  lastObservedDate = event.date;
  if (isFirstObservation) return false;
  emitGlobal(DAILY_EVENT_UPDATED, event);
  return true;
};

/** Test hook: forget the observed day (next check acts as first observation). */
export const resetDailyEventRollover = (): void => {
  lastObservedDate = null;
};
