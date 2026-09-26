/**
 * Sprint 7A — Player analytics foundation tests.
 *
 * Covers: authenticated access, unauthenticated/garbage-token rejection,
 * strict user scoping (client-supplied userId never trusted), correct
 * aggregation from known seeded data (windows, per-day buckets, world
 * grouping, completion rate), empty/new-user safety, UTC date-boundary
 * behavior (injectable `now`), and missing-user 404.
 *
 * Mocking follows the project's established in-memory style (spyOn model
 * statics, thenable query chains — see leaderboard/notifications tests).
 * No DB, no network, no writes.
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { getAnalyticsSummary } from '../services/analyticsService';
import analyticsRoutes from '../routes/analyticsRoutes';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const oid = () => new Types.ObjectId();

/* ---------- in-memory fixtures + thenable query mocks ---------- */
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
    stats: { questsCompleted: 0, bossesDefeated: 0 },
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
    completedAt: null,
    createdAt: new Date(),
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

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  Users = [];
  Qs = [];

  jest.spyOn(User, 'findById').mockImplementation(((id: any) =>
    Promise.resolve(Users.find((u) => S(u._id) === S(id)) || null)) as any);
  jest.spyOn(Quest, 'find').mockImplementation(((filter: any = {}) =>
    Q(
      Qs.filter((q) => !filter.owner || S(q.owner) === S(filter.owner)),
    )) as any);
});

/* ==========================================================================
   A. HTTP endpoint: auth + scoping + empty user (real time is fine here)
   ========================================================================== */
describe('GET /api/analytics/summary — auth & scoping', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRoutes);

  const seedPlayerA = () => {
    const a = mkUser({
      username: 'alpha',
      level: 5,
      totalXP: 4321,
      currentStreak: 3,
      longestStreak: 9,
    });
    mkQuest({ owner: a._id, status: 'completed', category: 'Health', xpReward: 100, completedAt: new Date() });
    mkQuest({ owner: a._id, status: 'completed', category: 'Work', xpReward: 50, completedAt: new Date() });
    mkQuest({ owner: a._id, status: 'pending', category: 'Study' });
    return a;
  };

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(401);
  });

  test('garbage token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('authenticated request returns the player overview derived from their own data', async () => {
    const a = seedPlayerA();
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    expect(res.body.overview).toMatchObject({
      level: 5,
      totalXP: 4321,
      currentStreak: 3,
      longestStreak: 9,
      totalQuests: 3,
      totalQuestsCompleted: 2,
      completionRate: 0.6667,
    });
    expect(res.body.recent.byDay).toHaveLength(7);
    expect(res.body.worlds.activity).toHaveLength(8);
  });

  test('scoped to authenticated user; client userId/level/XP params never trusted', async () => {
    const a = seedPlayerA();
    const b = mkUser({ username: 'bravo', level: 9, totalXP: 7777 });
    mkQuest({ owner: b._id, status: 'completed', category: 'Fitness', xpReward: 10, completedAt: new Date() });
    const res = await request(app)
      .get(`/api/analytics/summary?userId=${S(b._id)}&level=99&totalXP=999999`)
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    // Still player A's data — forged query values never read.
    expect(res.body.overview.level).toBe(5);
    expect(res.body.overview.totalXP).toBe(4321);
    expect(res.body.overview.totalQuestsCompleted).toBe(2);
    expect(res.body.overview.totalQuests).toBe(3);
    const worldFor = (n: string) =>
      res.body.worlds.activity.find((w: any) => w.world === n).completedQuests;
    expect(worldFor('Fitness')).toBe(0); // B's quest never leaks into A
    expect(worldFor('Health')).toBe(1);
  });

  test('new user with no quests: safe zeros, null rate, empty distribution', async () => {
    const c = mkUser({ username: 'fresh' });
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${tokenFor(S(c._id))}`);
    expect(res.status).toBe(200);
    expect(res.body.overview).toMatchObject({
      level: 1,
      totalXP: 0,
      currentStreak: 0,
      totalQuests: 0,
      totalQuestsCompleted: 0,
      completionRate: null,
    });
    expect(res.body.recent.today).toEqual({ questsCompleted: 0, xpEarned: 0 });
    expect(res.body.recent.last7Days).toEqual({ questsCompleted: 0, xpEarned: 0, activeDays: 0 });
    expect(res.body.recent.previous7Days).toEqual({ questsCompleted: 0, xpEarned: 0 });
    expect(res.body.recent.byDay).toHaveLength(7);
    expect(
      res.body.recent.byDay.every((d: any) => d.questsCompleted === 0 && d.xpEarned === 0),
    ).toBe(true);
    expect(res.body.worlds.activity).toHaveLength(8);
    expect(res.body.worlds.activity.every((w: any) => w.completedQuests === 0)).toBe(true);
    expect(res.body.worlds.mostActiveWorld).toBeNull();
  });
});

/* ==========================================================================
   B. Service aggregation with pinned dates (fully deterministic)
   ========================================================================== */
describe('analytics service aggregation (pinned now)', () => {
  // Windows relative to 2026-06-15 (UTC): today = 06-15,
  // last7 = 06-09..06-15, previous7 = 06-02..06-08.
  const NOW = new Date('2026-06-15T12:00:00.000Z');

  const seed = () => {
    const p = mkUser({
      username: 'svc',
      level: 12,
      totalXP: 9876,
      currentStreak: 4,
      longestStreak: 11,
    });
    const owner = p._id;
    // last7 window (incl. today)
    mkQuest({ owner, status: 'completed', category: 'Health', xpReward: 100, completedAt: new Date('2026-06-15T08:00:00.000Z') }); // today
    mkQuest({ owner, status: 'completed', category: 'Health', xpReward: 50, completedAt: new Date('2026-06-15T10:00:00.000Z') }); // today
    mkQuest({ owner, status: 'completed', category: 'Work', xpReward: 200, completedAt: new Date('2026-06-14T23:59:59.999Z') }); // yesterday
    mkQuest({ owner, status: 'completed', category: 'Study', xpReward: 100, completedAt: new Date('2026-06-10T00:00:00.000Z') });
    mkQuest({ owner, status: 'completed', category: 'Work', xpReward: 50, completedAt: new Date('2026-06-09T00:00:00.000Z') }); // last7 boundary (inclusive)
    // previous7 window
    mkQuest({ owner, status: 'completed', category: 'Hobby', xpReward: 300, completedAt: new Date('2026-06-08T23:59:59.000Z') });
    mkQuest({ owner, status: 'completed', category: 'Fitness', xpReward: 100, completedAt: new Date('2026-06-02T00:00:00.000Z') }); // prev7 boundary
    // older than both windows: totals + worlds only
    mkQuest({ owner, status: 'completed', category: 'Other', xpReward: 1000, completedAt: new Date('2026-05-01T00:00:00.000Z') });
    // pending quest: denominator only
    mkQuest({ owner, status: 'pending', category: 'Work' });
    // legacy completed quest without completedAt: totals + worlds only
    mkQuest({ owner, status: 'completed', category: 'Hobby', xpReward: 999, completedAt: null });
    return p;
  };

  test('overview: totals, completion rate, and user fields come from real data', async () => {
    const p = seed();
    const s = await getAnalyticsSummary(S(p._id), NOW);
    expect(s.overview).toEqual({
      level: 12,
      totalXP: 9876,
      currentStreak: 4,
      longestStreak: 11,
      totalQuests: 10,
      totalQuestsCompleted: 9,
      completionRate: 0.9,
    });
  });

  test('recent windows + per-day buckets aggregate exactly (counts, XP, activeDays)', async () => {
    const p = seed();
    const s = await getAnalyticsSummary(S(p._id), NOW);
    expect(s.recent.today).toEqual({ questsCompleted: 2, xpEarned: 150 });
    expect(s.recent.last7Days).toEqual({ questsCompleted: 5, xpEarned: 500, activeDays: 4 });
    expect(s.recent.previous7Days).toEqual({ questsCompleted: 2, xpEarned: 400 });
    expect(s.recent.byDay).toHaveLength(7);
    expect(s.recent.byDay.map((d) => d.date)).toEqual([
      '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12',
      '2026-06-13', '2026-06-14', '2026-06-15',
    ]);
    expect(s.recent.byDay.map((d) => d.questsCompleted)).toEqual([1, 1, 0, 0, 0, 1, 2]);
    expect(s.recent.byDay.map((d) => d.xpEarned)).toEqual([50, 100, 0, 0, 0, 200, 150]);
  });

  test('world grouping: all 8 worlds present with exact counts + most active', async () => {
    const p = seed();
    const s = await getAnalyticsSummary(S(p._id), NOW);
    expect(s.worlds.activity).toEqual([
      { world: 'Health', completedQuests: 2 },
      { world: 'Work', completedQuests: 2 },
      { world: 'Study', completedQuests: 1 },
      { world: 'Home', completedQuests: 0 },
      { world: 'Hobby', completedQuests: 2 },
      { world: 'Personal', completedQuests: 0 },
      { world: 'Fitness', completedQuests: 1 },
      { world: 'Other', completedQuests: 1 },
    ]);
    // Ties (Health/Work/Hobby = 2) resolve to the earliest world in WORLDS order.
    expect(s.worlds.mostActiveWorld).toBe('Health');
  });

  test('date boundaries: completion exactly at UTC midnight counts as today; 1ms before does not', async () => {
    const p = mkUser({ username: 'edge' });
    mkQuest({ owner: p._id, status: 'completed', category: 'Health', xpReward: 30, completedAt: new Date('2026-06-15T00:00:00.000Z') });
    mkQuest({ owner: p._id, status: 'completed', category: 'Work', xpReward: 70, completedAt: new Date('2026-06-14T23:59:59.999Z') });
    const s = await getAnalyticsSummary(S(p._id), new Date('2026-06-15T00:00:00.000Z'));
    expect(s.recent.today).toEqual({ questsCompleted: 1, xpEarned: 30 });
    expect(s.recent.last7Days).toEqual({ questsCompleted: 2, xpEarned: 100, activeDays: 2 });
    expect(s.recent.byDay[5]).toEqual({ date: '2026-06-14', questsCompleted: 1, xpEarned: 70 });
    expect(s.recent.byDay[6]).toEqual({ date: '2026-06-15', questsCompleted: 1, xpEarned: 30 });
  });

  test('missing user -> 404 (same convention as progressionService)', async () => {
    await expect(getAnalyticsSummary(S(oid()), NOW)).rejects.toMatchObject({ status: 404 });
  });
});


