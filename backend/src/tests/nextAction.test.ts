/**
 * Sprint 7B — Next-action recommendation engine tests (NOT AI/LLM).
 *
 * Covers: authenticated access, unauthenticated/garbage-token rejection,
 * user scoping + forged client identity/stats immunity, actionable-quest
 * recommendation, completed quests never recommended, documented priority
 * order when multiple rules match (OVERDUE > STREAK > MOMENTUM > variety),
 * world-variety selection, full determinism (same state -> same output),
 * and the no-quest / new-user fallbacks.
 *
 * In-memory mocking style per the project convention (see analytics tests).
 * The engine is read-only — no DB, no writes, injectable `now`.
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { getNextAction } from '../services/nextActionService';
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

// Pinned clock for all service-level tests (Monday, UTC).
const NOW = new Date('2026-06-15T12:00:00.000Z');

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
   A. HTTP endpoint: auth + scoping + forged input
   ========================================================================== */
describe('GET /api/analytics/next-action — auth & scoping', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRoutes);

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app).get('/api/analytics/next-action');
    expect(res.status).toBe(401);
  });

  test('garbage token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/analytics/next-action')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('authenticated request returns exactly one recommendation with context', async () => {
    const a = mkUser({ username: 'alpha' });
    const q = mkQuest({ owner: a._id, title: 'Drink water', category: 'Health' });
    const res = await request(app)
      .get('/api/analytics/next-action')
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toMatchObject({
      actionType: 'COMPLETE_QUEST',
      title: 'Drink water',
      questId: S(q._id),
      world: 'Health',
    });
    expect(res.body.context).toMatchObject({
      hasQuests: true,
      totalQuests: 1,
      pendingQuests: 1,
      activeLast7Days: false,
    });
    // ONE recommendation only — never a ranked list.
    expect(Array.isArray(res.body.recommendation)).toBe(false);
    expect(res.body.recommendations).toBeUndefined();
  });

  test('scoped to authenticated user; forged userId/priority/streak params never trusted', async () => {
    const a = mkUser({ username: 'alpha', currentStreak: 0 });
    mkQuest({ owner: a._id, title: 'A quest', category: 'Health' });
    const b = mkUser({ username: 'bravo', currentStreak: 42 });
    const bQuest = mkQuest({ owner: b._id, title: 'B secret quest', category: 'Work' });
    const res = await request(app)
      .get(`/api/analytics/next-action?userId=${S(b._id)}&priority=STREAK&streak=999`)
      .set('Authorization', `Bearer ${tokenFor(S(a._id))}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendation.questId).not.toBe(S(bQuest._id));
    expect(res.body.recommendation.title).toBe('A quest');
    expect(res.body.recommendation.priority).not.toBe('STREAK'); // forged param ignored
    expect(res.body.recommendation.metadata.currentStreak).toBe(0); // A's real value, not 999
  });
});

/* ==========================================================================
   B. Deterministic rule engine (pinned now)
   ========================================================================== */
describe('next-action engine rules (pinned now)', () => {
  test('actionable pending quest is recommended with its real id/title/world', async () => {
    const p = mkUser({ username: 'svc' });
    const done = mkQuest({
      owner: p._id,
      status: 'completed',
      category: 'Work',
      completedAt: new Date('2026-05-01T00:00:00.000Z'), // older than 7d
    });
    const target = mkQuest({ owner: p._id, title: 'Walk 20 min', category: 'Fitness' });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation).toMatchObject({
      actionType: 'COMPLETE_QUEST',
      questId: S(target._id),
      title: 'Walk 20 min',
      world: 'Fitness',
      priority: 'MOMENTUM', // no completions in last 7d
    });
    expect(r.recommendation.questId).not.toBe(S(done._id));
    expect(r.recommendation.reason.length).toBeGreaterThan(10);
    expect(r.context).toMatchObject({ totalQuests: 2, pendingQuests: 1, activeLast7Days: false });
  });

  test('completed quests never recommended; only-completed log falls back safely', async () => {
    const p = mkUser({ username: 'cleared' });
    mkQuest({
      owner: p._id,
      status: 'completed',
      category: 'Health',
      completedAt: new Date('2026-06-14T10:00:00.000Z'), // recent
    });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation.actionType).toBe('CREATE_QUICK_QUEST');
    expect(r.recommendation.questId).toBeNull(); // no invented ids
    expect(r.recommendation.priority).toBe('QUICK_START');
    expect(r.recommendation.reason).toContain('All 1 of your quests are cleared'); // real count
    expect(r.context).toMatchObject({ hasQuests: true, pendingQuests: 0, activeLast7Days: true });
  });

  test('priority: OVERDUE beats STREAK when both match (documented order)', async () => {
    const p = mkUser({
      username: 'rush',
      currentStreak: 5,
      lastCompletionDate: new Date(NOW.getTime() - 36 * 3600 * 1000), // not today
    });
    const late = mkQuest({
      owner: p._id,
      title: 'Late bill',
      category: 'Home',
      deadline: new Date('2026-06-10T00:00:00.000Z'), // before NOW
    });
    mkQuest({ owner: p._id, title: 'Fine later', category: 'Study' });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation.priority).toBe('OVERDUE');
    expect(r.recommendation.questId).toBe(S(late._id));
    expect(r.recommendation.reason).toContain('2026-06-10');
    // streak signal present but lower priority:
    expect(r.recommendation.metadata.streakAtRisk).toBe(true);
  });

  test('STREAK reason when at-risk streak and no overdue quest', async () => {
    const p = mkUser({
      username: 'streaker',
      currentStreak: 5,
      longestStreak: 9,
      lastCompletionDate: new Date(NOW.getTime() - 36 * 3600 * 1000),
    });
    mkQuest({ owner: p._id, title: 'Any quest', category: 'Health' });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation.priority).toBe('STREAK');
    expect(r.recommendation.reason).toContain('5-day streak');
    expect(r.recommendation.metadata.currentStreak).toBe(5);
    expect(r.recommendation.actionType).toBe('COMPLETE_QUEST');
  });

  test('recent world activity steers variety: fresh world preferred over active one', async () => {
    const p = mkUser({ username: 'vario' });
    mkQuest({
      owner: p._id,
      status: 'completed',
      category: 'Health',
      completedAt: new Date('2026-06-12T10:00:00.000Z'), // Health active within 7d
    });
    const healthQuest = mkQuest({ owner: p._id, title: 'More health', category: 'Health' });
    const workQuest = mkQuest({ owner: p._id, title: 'Fresh work', category: 'Work' });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation.questId).toBe(S(workQuest._id));
    expect(r.recommendation.questId).not.toBe(S(healthQuest._id));
    expect(r.recommendation.priority).toBe('FRESH_WORLD');
    expect(r.recommendation.metadata.recentWorlds).toEqual(['Health']);
    expect(r.recommendation.reason).toContain('Health');
  });

  test("NEXT_QUEST label when the only option's world is already active recently", async () => {
    const p = mkUser({ username: 'same' });
    mkQuest({
      owner: p._id,
      status: 'completed',
      category: 'Health',
      completedAt: new Date('2026-06-12T10:00:00.000Z'),
    });
    mkQuest({ owner: p._id, title: 'Another health', category: 'Health' });
    const r = await getNextAction(S(p._id), NOW);
    expect(r.recommendation.priority).toBe('NEXT_QUEST');
    expect(r.recommendation.world).toBe('Health');
  });

  test('new user with no quests: GET_STARTED fallback, zeroed context, no fabrication', async () => {
    const n = mkUser({ username: 'newbie' });
    const r = await getNextAction(S(n._id), NOW);
    expect(r.recommendation).toMatchObject({
      actionType: 'CREATE_QUICK_QUEST',
      title: 'Start a quick quest',
      questId: null,
      world: null,
      priority: 'GET_STARTED',
    });
    expect(r.context).toEqual({
      hasQuests: false,
      totalQuests: 0,
      pendingQuests: 0,
      completedToday: false,
      activeLast7Days: false,
    });
    expect(r.recommendation.metadata.currentStreak).toBe(0);
  });

  test('determinism: identical state produces identical recommendations', async () => {
    const p = mkUser({ username: 'det', currentStreak: 2 });
    mkQuest({ owner: p._id, title: 'One', category: 'Home', createdAt: new Date('2026-06-02T00:00:00.000Z') });
    mkQuest({ owner: p._id, title: 'Two', category: 'Home', createdAt: new Date('2026-06-03T00:00:00.000Z') });
    const first = await getNextAction(S(p._id), NOW);
    const second = await getNextAction(S(p._id), NOW);
    expect(second).toEqual(first);
    expect(first.recommendation.questId).toBeTruthy();
  });

  test('missing user -> 404 (project convention)', async () => {
    await expect(getNextAction(S(oid()), NOW)).rejects.toMatchObject({ status: 404 });
  });
});


