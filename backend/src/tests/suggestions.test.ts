/**
 * Sprint 7C — Smart Suggestions engine tests (NOT AI/LLM).
 *
 * Covers: authenticated access, unauthenticated/garbage-token rejection,
 * user scoping + forged client parameters, each suggestion rule (STREAK,
 * WORLD_BALANCE, MOMENTUM, QUEST_BACKLOG incl. threshold boundary,
 * RECENT_SUCCESS, INACTIVE_PLAYER), deterministic output across multiple
 * matching rules, the max-3 cap, no duplicate suggestions, new-user
 * safety, and 404 for a missing user.
 *
 * In-memory mocking style per project convention (see analytics /
 * nextAction tests). Read-only engine, injectable pinned `now`.
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { getSuggestions, BACKLOG_THRESHOLD } from '../services/suggestionsService';
import analyticsRoutes from '../routes/analyticsRoutes';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const oid = () => new Types.ObjectId();

let Users: any[] = [];
let Qs: any[] = [];

const mkUser = (o: any = {}) => {
  const u: any = {
    _id: o._id || oid(),
    username: o.username || 'player',
    email: `${o.username || 'player'}@t.test`,
    level: 1,
    totalXP: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletionDate: null,
    ...o,
  };
  Users.push(u);
  return u;
};

const mkQuest = (o: any) => {
  const q: any = {
    _id: o._id || oid(),
    title: 'quest',
    type: 'daily',
    category: 'Health',
    difficulty: 'easy',
    xpReward: 50,
    status: 'pending',
    deadline: null,
    completedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...o,
  };
  Qs.push(q);
  return q;
};

const Q = (initial: any[]) => {
  const q: any = {};
  q.then = (res: any, rej: any) => Promise.resolve(initial).then(res, rej);
  return q;
};

const tokenFor = (id: string) =>
  jwt.sign({ id, email: 'holder@t.test' }, SECRET, { expiresIn: '1h' });

// Pinned clock (Monday, UTC). Windows: last7 = 06-09..06-15,
// previous7 = 06-02..06-08.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const IN_LAST7 = new Date('2026-06-14T10:00:00.000Z');
const IN_PREV7 = new Date('2026-06-05T10:00:00.000Z');

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  Users = [];
  Qs = [];

  jest.spyOn(User, 'findById').mockImplementation(((id: any) =>
    Promise.resolve(Users.find((u) => S(u._id) === S(id)) || null)) as any);
  jest.spyOn(Quest, 'find').mockImplementation(((filter: any = {}) =>
    Q(Qs.filter((q) => !filter.owner || S(q.owner) === S(filter.owner)))) as any);
});

/* ==========================================================================
   A. HTTP endpoint: auth + scoping + forged parameters
   ========================================================================== */
describe('GET /api/analytics/suggestions — auth & scoping', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRoutes);

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/api/analytics/suggestions');
    expect(res.status).toBe(401);
  });

  test('garbage token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/analytics/suggestions')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('authenticated request returns at most 3 well-formed unique suggestions', async () => {
    const a = mkUser({ username: 'alpha', currentStreak: 4 });
    mkQuest({ owner: a._id, status: 'completed', category: 'Health', completedAt: IN_LAST7 });
    const res = await request(app)
      .get('/api/analytics/suggestions')
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(3);
    const types = res.body.suggestions.map((s: any) => s.type);
    expect(new Set(types).size).toBe(types.length); // no duplicate types
    for (const s of res.body.suggestions) {
      expect(typeof s.title).toBe('string');
      expect(typeof s.message).toBe('string');
      expect(s.message.length).toBeGreaterThan(5);
      expect(typeof s.metadata).toBe('object');
      expect(s.world === null || typeof s.world === 'string').toBe(true);
    }
  });

  test('scoped to authenticated user; forged userId/streak/XP params never trusted', async () => {
    const a = mkUser({ username: 'alpha', currentStreak: 0 }); // no streak
    mkUser({ username: 'bravo', currentStreak: 42 }); // B has a streak
    const res = await request(app)
      .get(`/api/analytics/suggestions?userId=${Users[1]._id}&streak=777&xp=999999`)
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    // A has no quests and no streak -> only the safe empty-log suggestion.
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].type).toBe('INACTIVE_PLAYER');
    expect(res.body.suggestions[0].metadata.totalQuests).toBe(0); // A's real data
    const types = res.body.suggestions.map((s: any) => s.type);
    expect(types).not.toContain('STREAK'); // forged streak ignored
    expect(JSON.stringify(res.body)).not.toContain('777');
    expect(JSON.stringify(res.body)).not.toContain('999999');
  });
});

/* ==========================================================================
   B. Rule engine (pinned now)
   ========================================================================== */
describe('suggestions engine rules (pinned now)', () => {
  test('STREAK fires first for an at-risk streak; INACTIVE completes the set', async () => {
    const p = mkUser({
      username: 'streaker',
      currentStreak: 5,
      lastCompletionDate: new Date(NOW.getTime() - 36 * 3600 * 1000), // not today
    });
    const r = await getSuggestions(S(p._id), NOW);
    expect(r.suggestions.map((s) => s.type)).toEqual(['STREAK', 'INACTIVE_PLAYER']);
    expect(r.suggestions[0]).toMatchObject({
      title: 'Keep your streak alive',
      world: null,
      metadata: { currentStreak: 5 },
    });
    expect(r.suggestions[0].message).toContain('5-day streak');
    expect(r.suggestions[1].title).toBe('Start your adventure'); // zero quests -> empty-log variant
  });

  test('WORLD_BALANCE suggests the first quiet world; RECENT_SUCCESS follows', async () => {
    const p = mkUser({ username: 'balanced' });
    mkQuest({ owner: p._id, status: 'completed', category: 'Health', completedAt: IN_LAST7 });
    const r = await getSuggestions(S(p._id), NOW);
    expect(r.suggestions.map((s) => s.type)).toEqual(['WORLD_BALANCE', 'RECENT_SUCCESS']);
    const balance = r.suggestions[0];
    expect(balance.world).toBe('Work'); // first zero-activity world in WORLDS order
    expect(balance.metadata.suggestedWorld).toBe('Work');
    expect(balance.metadata.recentWorlds).toEqual(['Health']);
    expect(balance.message).toContain('Health');
    expect(balance.message).toContain('Work');
    expect(r.suggestions[1].metadata.last7Days).toBe(1);
  });

  test('MOMENTUM fires on decline with an actionable easy quest; suppresses RECENT_SUCCESS', async () => {
    const p = mkUser({ username: 'declining' });
    // last7: 1 completion (Health)
    mkQuest({ owner: p._id, status: 'completed', category: 'Health', completedAt: IN_LAST7 });
    // prev7: 3 completions -> decline (baseline)
    for (let i = 0; i < 3; i++) {
      mkQuest({ owner: p._id, status: 'completed', category: 'Study', completedAt: IN_PREV7 });
    }
    // pending candidates: hard first-created, easy later -> easy must win
    mkQuest({ owner: p._id, title: 'Hard thing', difficulty: 'hard', createdAt: new Date('2026-06-01T00:00:00.000Z') });
    const easy = mkQuest({ owner: p._id, title: 'Stretch break', difficulty: 'easy', createdAt: new Date('2026-06-04T00:00:00.000Z') });
    const r = await getSuggestions(S(p._id), NOW);
    expect(r.suggestions.map((s) => s.type)).toEqual(['WORLD_BALANCE', 'MOMENTUM']);
    const momentum = r.suggestions[1];
    expect(momentum.message).toContain('3'); // previous 7d total (real)
    expect(momentum.message).toContain('1'); // last 7d total (real)
    expect(momentum.message).toContain('Stretch break'); // easiest pending picked
    expect(momentum.metadata).toMatchObject({
      last7Days: 1,
      previous7Days: 3,
      pendingQuests: 2,
      suggestedQuestId: S(easy._id),
    });
    // suppression: no contradictory "nice momentum" while pace dropped
    expect(r.suggestions.map((s) => s.type)).not.toContain('RECENT_SUCCESS');
    // suppression: not inactive (last7 > 0)
    expect(r.suggestions.map((s) => s.type)).not.toContain('INACTIVE_PLAYER');
  });

  test('QUEST_BACKLOG fires at the threshold (5), not below; inactive history variant included', async () => {
    const p = mkUser({ username: 'hoarder' });
    for (let i = 0; i < BACKLOG_THRESHOLD - 1; i++) mkQuest({ owner: p._id, title: `Q${i}` });
    const below = await getSuggestions(S(p._id), NOW);
    expect(below.suggestions.map((s) => s.type)).not.toContain('QUEST_BACKLOG');
    mkQuest({ owner: p._id, title: 'Q-last' });
    const at = await getSuggestions(S(p._id), NOW);
    expect(at.suggestions.map((s) => s.type)).toContain('QUEST_BACKLOG');
    const backlog = at.suggestions.find((s) => s.type === 'QUEST_BACKLOG')!;
    expect(backlog.message).toContain(`${BACKLOG_THRESHOLD} quests waiting`);
    expect(backlog.metadata.pendingQuests).toBe(BACKLOG_THRESHOLD);
    const inactive = at.suggestions.find((s) => s.type === 'INACTIVE_PLAYER')!;
    expect(inactive.title).toBe('Ease back in'); // has quest history, just inactive
    expect(inactive.metadata.totalQuests).toBe(BACKLOG_THRESHOLD);
  });

  test('RECENT_SUCCESS alone when all 8 worlds are active and no other rule matches', async () => {
    const p = mkUser({ username: 'active' });
    const cats = ['Health', 'Work', 'Study', 'Home', 'Hobby', 'Personal', 'Fitness', 'Other'];
    for (const category of cats) {
      mkQuest({ owner: p._id, status: 'completed', category, completedAt: IN_LAST7 });
    }
    // prev7 >= last7 with zero pending -> no momentum, no backlog, streak 0
    for (let i = 0; i < 10; i++) {
      mkQuest({ owner: p._id, status: 'completed', category: 'Health', completedAt: IN_PREV7 });
    }
    const r = await getSuggestions(S(p._id), NOW);
    expect(r.suggestions.map((s) => s.type)).toEqual(['RECENT_SUCCESS']);
    expect(r.suggestions[0].metadata.last7Days).toBe(8);
    expect(r.suggestions[0].message).toContain('8 quests');
  });

  test('multiple matching rules -> deterministic max 3, no duplicates, identical on repeat', async () => {
    const p = mkUser({
      username: 'multi',
      currentStreak: 2,
      lastCompletionDate: new Date(NOW.getTime() - 36 * 3600 * 1000), // streak at risk
    });
    mkQuest({ owner: p._id, status: 'completed', category: 'Health', completedAt: IN_LAST7 }); // balance + active
    for (let i = 0; i < 3; i++) {
      mkQuest({ owner: p._id, status: 'completed', category: 'Study', completedAt: IN_PREV7 }); // decline
    }
    for (let i = 0; i < BACKLOG_THRESHOLD; i++) mkQuest({ owner: p._id, title: `P${i}` }); // backlog

    const first = await getSuggestions(S(p._id), NOW);
    const second = await getSuggestions(S(p._id), NOW);
    expect(second).toEqual(first); // same state -> same output
    // 4 rules match (STREAK, WORLD_BALANCE, MOMENTUM, QUEST_BACKLOG) -> capped at 3
    expect(first.suggestions).toHaveLength(3);
    expect(first.suggestions.map((s) => s.type)).toEqual([
      'STREAK',
      'WORLD_BALANCE',
      'MOMENTUM',
    ]);
    const types = first.suggestions.map((s) => s.type);
    const messages = first.suggestions.map((s) => s.message);
    expect(new Set(types).size).toBe(types.length); // no duplicate types
    expect(new Set(messages).size).toBe(messages.length); // no duplicate messages
  });

  test('new user with zero data: one safe suggestion, nothing fabricated', async () => {
    const n = mkUser({ username: 'newbie' });
    const r = await getSuggestions(S(n._id), NOW);
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toEqual({
      type: 'INACTIVE_PLAYER',
      title: 'Start your adventure',
      message: 'Your quest log is empty — clear your first quest to start building your stats.',
      world: null,
      metadata: { last7Days: 0, totalQuests: 0 },
    });
  });

  test('missing user -> 404 (project convention)', async () => {
    await expect(getSuggestions(S(oid()), NOW)).rejects.toMatchObject({ status: 404 });
  });
});


