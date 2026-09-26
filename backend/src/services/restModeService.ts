import { Types } from 'mongoose';
import { Quest } from '../models/Quest';
import { User, IUser } from '../models/User';

/**
 * Sprint 7D — Rest Mode (player-owned preference; NOT a progression modifier).
 *
 * Rest Mode is an EXPLICIT choice the player makes and the server owns. It is
 * never inferred from inactivity, streak state, analytics or any other
 * condition, and it is never an automatic/background mode.
 *
 * HARD GUARANTEES (this file must never break them):
 *  - writes exactly ONE field: `User.restMode`
 *  - no XP, coin, level, streak, stats, inventory, achievement, equipped-item,
 *    reward or leaderboard value is read-modified or written
 *  - no quest is created, completed, deleted, re-priced or re-difficultied
 *  - no progression rule is bypassed, frozen, protected or multiplied
 *  - quest IDs are copied from real documents owned by the caller; never faked
 *  - identity is the authenticated user only; client-supplied ids are ignored
 * Rest Mode only changes the TYPE OF GUIDANCE shown (a lighter session built
 * from the player's own pending quests).
 *
 * DOCUMENTED PRIORITY ORDER for the lighter-session suggestion (first match
 * wins). Every choice is deterministic; ties break by difficulty rank, then
 * oldest createdAt, then _id string:
 *  1. QUICK_QUEST – lightest pending quest of the project's quick type
 *                   (type 'quick' with easy/medium difficulty)
 *  2. EASY_QUEST  – lightest pending quest with difficulty 'easy'
 *  3. SMALL_QUEST – lightest pending quest with difficulty 'medium'
 *  4. QUIET_LOG   – no suitable lightweight probe exists -> safe informational
 *                   fallback (questId null; nothing is invented)
 * With Rest Mode OFF the response carries the neutral NORMAL_MODE suggestion so
 * the contract shape stays stable for the future UI.
 */

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2, epic: 3 };

/** Difficulties considered "light" for a Rest Mode session (easy/medium). */
export const LIGHT_RANK_MAX = 1;

export type RestSuggestionType =
  | 'QUICK_QUEST'
  | 'EASY_QUEST'
  | 'SMALL_QUEST'
  | 'QUIET_LOG'
  | 'NORMAL_MODE';

export interface RestModeSuggestion {
  type: RestSuggestionType;
  title: string;
  message: string;
  /** Real pending quest _id owned by the caller, or null when informational. */
  questId: string | null;
}

export interface RestModeResponse {
  enabled: boolean;
  mode: 'REST' | 'NORMAL';
  suggestion: RestModeSuggestion;
  context: {
    pendingQuests: number;
    lightweightQuests: number;
    /** Display-only snapshot; Rest Mode never changes it. */
    currentStreak: number;
    /** Explicit contract flag: Rest Mode is not a progression modifier. */
    progressionUnchanged: true;
  };
}

const rank = (d: unknown): number => DIFFICULTY_RANK[String(d)] ?? 9;

const ms = (v: unknown, fallback = 0): number => {
  if (!v) return fallback;
  const t = new Date(v as string | Date).getTime();
  return Number.isNaN(t) ? fallback : t;
};

/** Deterministic "lightest then oldest then smallest _id" pick. */
const lightestOf = (list: any[]): any =>
  [...list].sort((a, b) => {
    const ra = rank(a.difficulty);
    const rb = rank(b.difficulty);
    if (ra !== rb) return ra - rb;
    const ca = ms(a.createdAt);
    const cb = ms(b.createdAt);
    if (ca !== cb) return ca - cb;
    return String(a._id).localeCompare(String(b._id));
  })[0];

const suggestionFor = (enabled: boolean, pending: any[]): RestModeSuggestion => {
  if (!enabled) {
    return {
      type: 'NORMAL_MODE',
      title: 'Normal mode',
      message: 'Rest Mode is off — your usual quests and guidance apply.',
      questId: null,
    };
  }

  const lightQuick = pending.filter((q) => String(q.type) === 'quick' && rank(q.difficulty) <= LIGHT_RANK_MAX);
  const lightEasy = pending.filter((q) => rank(q.difficulty) === 0);
  const lightMedium = pending.filter((q) => rank(q.difficulty) === 1);

  if (lightQuick.length > 0) {
    const q = lightestOf(lightQuick);
    return {
      type: 'QUICK_QUEST',
      title: 'Quick quest ready',
      message: `Light session: "${q.title}" is a quick quest you can finish in one sitting.`,
      questId: String(q._id),
    };
  }

  if (lightEasy.length > 0) {
    const q = lightestOf(lightEasy);
    return {
      type: 'EASY_QUEST',
      title: 'Easy quest ready',
      message: `Easier pace: "${q.title}" is an easy quest already in your log.`,
      questId: String(q._id),
    };
  }

  if (lightMedium.length > 0) {
    const q = lightestOf(lightMedium);
    return {
      type: 'SMALL_QUEST',
      title: 'Small step available',
      message: `Gentle option: "${q.title}" is the smallest thing waiting in your log.`,
      questId: String(q._id),
    };
  }

  return {
    type: 'QUIET_LOG',
    title: 'Nothing light waiting',
    message:
      pending.length === 0
        ? "Your log is clear, so there is nothing light to pick up — resting is a valid choice. XP, coins and streak rules are unchanged."
        : "Nothing light is waiting in your log right now — rest is fine, or take on a heavier quest when you feel ready. XP, coins and streak rules are unchanged.",
    questId: null,
  };
};

/** Pending quests owned by ONE user (JS-filtered like 7B/7C for parity). */
const loadPending = async (userId: string | Types.ObjectId): Promise<any[]> => {
  const quests = await Quest.find({ owner: new Types.ObjectId(String(userId)) });
  return (quests as any[]).filter((q) => q.status === 'pending');
};

const buildResponse = (user: IUser, pending: any[]): RestModeResponse => {
  const enabled = (user as any).restMode === true; // undefined -> schema default OFF
  return {
    enabled,
    mode: enabled ? 'REST' : 'NORMAL',
    suggestion: suggestionFor(enabled, pending),
    context: {
      pendingQuests: pending.length,
      lightweightQuests: pending.filter((q) => rank(q.difficulty) <= LIGHT_RANK_MAX).length,
      currentStreak: user.currentStreak || 0,
      progressionUnchanged: true,
    },
  };
};

/**
 * Read the caller's Rest Mode state + lighter-session context.
 * Read-only; throws { status: 404 } for a missing user (project convention).
 */
export const getRestMode = async (userId: string | Types.ObjectId): Promise<RestModeResponse> => {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };
  const pending = await loadPending(userId);
  return buildResponse(user, pending);
};

/**
 * Explicitly enable/disable Rest Mode for the authenticated user.
 * Persists ONLY the `restMode` flag. Idempotent: repeating the same value is a
 * no-op (no write, identical response). `enabled` must be a strict boolean —
 * anything else is rejected with 400 so the mode can never be set implicitly
 * or coerced from user input.
 */
export const setRestMode = async (
  userId: string | Types.ObjectId,
  enabled: unknown,
): Promise<RestModeResponse> => {
  if (typeof enabled !== 'boolean') {
    throw { status: 400, message: 'enabled must be a boolean' };
  }

  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };

  if ((user as any).restMode !== enabled) {
    // The ONLY write in the whole Sprint 7D engine.
    (user as any).restMode = enabled;
    await user.save();
  }

  const pending = await loadPending(userId);
  return buildResponse(user, pending);
};

