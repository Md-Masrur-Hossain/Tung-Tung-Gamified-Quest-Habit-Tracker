/**
 * Sprint 7D — Rest Mode tests (player preference; NOT a progression modifier).
 *
 * Covers: default OFF, authenticated read, unauthenticated/garbage-token
 * rejection, explicit enable/disable, persistence across requests,
 * idempotency, per-user scoping, forged userId/body fields being ignored,
 * validation (400), missing user (404), the lighter-session recommendation
 * using only the caller's own data, the no-suitable-quest fallback, and the
 * hard guarantee that XP, coins, streak, stats, achievements and quest
 * documents are never modified.
 *
 * In-memory mocking style per project convention (see analytics / nextAction /
 * suggestions tests). No real database or network access.
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { Quest } from '../models/Quest';
import { User } from '../models/User';
import { getRestMode, setRestMode, LIGHT_RANK_MAX } from '../services/restModeService';
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
    username: 'player',
    email: `${String(o._id || 'player')}@t.test`,
    level: 1,
    totalXP: 0,
    coins: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletionDate: null,
    inventory: [],
    achievements: [],
    unlockedTitles: ['Rookie'],
    equippedTitle: 'Rookie',
    stats: { questsCompleted: 0, bossesDefeated: 0 },
    ...o,
    // `restMode` intentionally absent unless the test sets it -> schema default.
  };
  u.saveCalls = 0;
  u.save = jest.fn(async () => {
    u.saveCalls += 1;
    return u;
  });
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

/** Snapshot of every progression field Rest Mode must never touch. */
const progressionSnapshot = (u: any) => ({
  totalXP: u.totalXP,
  level: u.level,
  coins: u.coins,
  currentStreak: u.currentStreak,
  longestStreak: u.longestStreak,
  lastCompletionDate: u.lastCompletionDate,
  stats: { ...u.stats },
  achievements: JSON.parse(JSON.stringify(u.achievements)),
  inventory: [...u.inventory],
  unlockedTitles: [...u.unlockedTitles],
  equippedTitle: u.equippedTitle,
});

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

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRoutes);

const auth = (id: string) => ({ Authorization: `Bearer ${tokenFor(id)}` });

/* ==========================================================================
   A. State: default OFF, authenticated read, auth rejection
   ========================================================================== */
describe('GET /api/analytics/rest-mode — state & auth', () => {
  test('a brand-new user has Rest Mode OFF by default (never inferred)', async () => {
    const a = mkUser({ username: 'fresh' });
    expect(a.restMode).toBeUndefined(); // no stored preference at all

    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.mode).toBe('NORMAL');
    expect(res.body.suggestion.type).toBe('NORMAL_MODE');
    expect(res.body.suggestion.questId).toBeNull();
    expect(a.restMode).not.toBe(true); // reading never turns it on
    expect(a.saveCalls).toBe(0);
  });

  test('authenticated read returns server-derived context for the caller', async () => {
    const a = mkUser({ currentStreak: 3 });
    mkQuest({ owner: a._id, difficulty: 'easy' });
    mkQuest({ owner: a._id, difficulty: 'hard' });
    mkQuest({ owner: a._id, difficulty: 'easy', status: 'completed' });

    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.status).toBe(200);
    expect(res.body.context.pendingQuests).toBe(2);
    expect(res.body.context.lightweightQuests).toBe(1);
    expect(res.body.context.currentStreak).toBe(3);
    expect(res.body.context.progressionUnchanged).toBe(true);
  });

  test('unauthenticated GET is rejected with 401', async () => {
    const res = await request(app).get('/api/analytics/rest-mode');
    expect(res.status).toBe(401);
  });

  test('unauthenticated POST is rejected with 401 (no state change)', async () => {
    const a = mkUser();
    const res = await request(app).post('/api/analytics/rest-mode').send({ enabled: true });
    expect(res.status).toBe(401);
    expect(a.restMode).toBeUndefined();
    expect(a.saveCalls).toBe(0);
  });

  test('garbage token is rejected with 401', async () => {
    const res = await request(app)
      .get('/api/analytics/rest-mode')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('missing user -> 404 (project convention)', async () => {
    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(oid())));
    expect(res.status).toBe(404);
  });
});

/* ==========================================================================
   B. Explicit toggle: enable, disable, persistence, idempotency, scoping
   ========================================================================== */
describe('POST /api/analytics/rest-mode — explicit player toggle', () => {
  test('authenticated player can enable Rest Mode', async () => {
    const a = mkUser();
    mkQuest({ owner: a._id, type: 'quick', difficulty: 'medium', title: 'Stretch' });

    const res = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.mode).toBe('REST');
    expect(a.restMode).toBe(true); // persisted on the user document
    expect(a.saveCalls).toBe(1);
  });

  test('authenticated player can disable Rest Mode', async () => {
    const a = mkUser({ restMode: true });
    const res = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.mode).toBe('NORMAL');
    expect(a.restMode).toBe(false);
    expect(a.saveCalls).toBe(1);
  });

  test('state persists across requests (enable -> read -> disable -> read)', async () => {
    const a = mkUser();
    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: true });

    let res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.body.enabled).toBe(true);
    expect(res.body.mode).toBe('REST');

    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: false });
    res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.body.enabled).toBe(false);
    expect(res.body.mode).toBe('NORMAL');
  });

  test('repeated enable/disable requests are safe and idempotent', async () => {
    const a = mkUser();

    const first = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: true });
    const second = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: true });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body); // identical response, no side effects
    expect(a.restMode).toBe(true);
    expect(a.saveCalls).toBe(1); // no redundant write on the repeat

    const third = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: false });
    const fourth = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: false });

    expect(fourth.body).toEqual(third.body);
    expect(a.restMode).toBe(false);
    expect(a.saveCalls).toBe(2); // one write per real change only
  });

  test('non-boolean / missing body value is rejected with 400 and changes nothing', async () => {
    const a = mkUser();

    for (const body of [{}, { enabled: 'true' }, { enabled: 1 }, { enabled: null }, { enabled: {} }]) {
      const res = await request(app)
        .post('/api/analytics/rest-mode')
        .set(auth(S(a._id)))
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/boolean/i);
    }

    expect(a.restMode).toBeUndefined();
    expect(a.saveCalls).toBe(0);
  });

  test('each user owns their own Rest Mode state', async () => {
    const a = mkUser({ username: 'on' });
    const b = mkUser({ username: 'off' });

    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: true });

    const ra = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    const rb = await request(app).get('/api/analytics/rest-mode').set(auth(S(b._id)));

    expect(ra.body.enabled).toBe(true);
    expect(rb.body.enabled).toBe(false);
    expect(a.restMode).toBe(true);
    expect(b.restMode).toBeUndefined();
    expect(b.saveCalls).toBe(0);
  });

  test('a forged userId in the body cannot change another user', async () => {
    const a = mkUser({ username: 'attacker' });
    const b = mkUser({ username: 'victim' });

    const res = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(a._id)))
      .send({ enabled: true, userId: S(b._id), _id: S(b._id), email: b.email });

    expect(res.status).toBe(200);
    expect(a.restMode).toBe(true); // the authenticated caller only
    expect(b.restMode).toBeUndefined(); // victim untouched
    expect(b.saveCalls).toBe(0);

    const rb = await request(app).get('/api/analytics/rest-mode').set(auth(S(b._id)));
    expect(rb.body.enabled).toBe(false);
  });

  test('a forged userId in a GET query cannot read another user state', async () => {
    const a = mkUser();
    const b = mkUser({ restMode: true });

    const res = await request(app)
      .get(`/api/analytics/rest-mode?userId=${S(b._id)}`)
      .set(auth(S(a._id)));

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false); // A's own state, not B's
  });

  test('missing user -> 404 on POST (nothing persisted)', async () => {
    const res = await request(app)
      .post('/api/analytics/rest-mode')
      .set(auth(S(oid())))
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});

/* ==========================================================================
   C. Rest Mode is NOT a progression modifier
   ========================================================================== */
describe('Rest Mode never touches progression', () => {
  test('toggling and reading leaves XP, level, coins, streak and stats untouched', async () => {
    const a = mkUser({
      totalXP: 1234,
      level: 6,
      coins: 250,
      currentStreak: 7,
      longestStreak: 11,
      lastCompletionDate: new Date('2026-06-14T09:00:00.000Z'),
      inventory: ['hat_1'],
      achievements: [{ key: 'FIRST_QUEST', unlockedAt: new Date('2026-01-01T00:00:00.000Z') }],
      unlockedTitles: ['Rookie', 'Explorer'],
      equippedTitle: 'Explorer',
      stats: { questsCompleted: 12, bossesDefeated: 3 },
    });
    const before = progressionSnapshot(a);

    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: true });
    await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: false });
    await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));

    expect(progressionSnapshot(a)).toEqual(before);
    // and the response never exposes a way to change them
    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.body).not.toHaveProperty('totalXP');
    expect(res.body).not.toHaveProperty('coins');
    expect(res.body).not.toHaveProperty('multiplier');
    expect(res.body).not.toHaveProperty('streakProtection');
  });

  test('no quest document is created, completed or mutated', async () => {
    const createSpy = jest.spyOn(Quest, 'create').mockImplementation((() => {
      throw new Error('Rest Mode must never create quests');
    }) as any);
    const updateSpy = jest.spyOn(Quest, 'findByIdAndUpdate').mockImplementation((() => {
      throw new Error('Rest Mode must never update quests');
    }) as any);

    const a = mkUser();
    const q1 = mkQuest({ owner: a._id, difficulty: 'easy', title: 'Walk' });
    const q2 = mkQuest({ owner: a._id, difficulty: 'epic', title: 'Marathon' });
    const q1Before = { ...q1 };
    const q2Before = { ...q2 };

    await request(app).post('/api/analytics/rest-mode').set(auth(S(a._id))).send({ enabled: true });
    await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(q1).toEqual(q1Before); // no difficulty/reward/status change
    expect(q2).toEqual(q2Before);
    expect(q1.difficulty).toBe('easy');
    expect(q2.difficulty).toBe('epic');
    expect(q1.xpReward).toBe(50);
  });

  test('the service layer also writes nothing but the flag', async () => {
    const a = mkUser({ currentStreak: 4, totalXP: 300, coins: 10 });
    const before = progressionSnapshot(a);

    const on = await setRestMode(a._id, true);
    const off = await setRestMode(a._id, false);
    const read = await getRestMode(a._id);

    expect(on.enabled).toBe(true);
    expect(off.enabled).toBe(false);
    expect(read.enabled).toBe(false);
    expect(progressionSnapshot(a)).toEqual(before); // streak/XP/coins intact
    expect(a.saveCalls).toBe(2); // exactly one write per actual change
  });
});

/* ==========================================================================
   D. Lighter-session recommendation (own data only, no fabrication)
   ========================================================================== */
describe('Rest Mode lighter-session recommendation', () => {
  test('prefers the lightest quick quest, then easy, then medium', async () => {
    const quick = mkUser({ restMode: true, username: 'quickcase' });
    const mediumQuick = mkQuest({
      owner: quick._id,
      type: 'quick',
      difficulty: 'medium',
      title: 'Short tidy-up',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    });
    const easyQuick = mkQuest({
      owner: quick._id,
      type: 'quick',
      difficulty: 'easy',
      title: 'One push-up',
      createdAt: new Date('2026-06-03T00:00:00.000Z'),
    });
    mkQuest({ owner: quick._id, type: 'daily', difficulty: 'easy', title: 'Read' });

    let res = await request(app).get('/api/analytics/rest-mode').set(auth(S(quick._id)));
    expect(res.body.suggestion.type).toBe('QUICK_QUEST');
    expect(res.body.suggestion.questId).toBe(S(easyQuick._id)); // lightest wins
    expect(res.body.suggestion.message).toContain('One push-up');
    expect(res.body.suggestion.message).not.toContain(mediumQuick.title);

    // no light quick quest -> lightest easy quest
    const easyUser = mkUser({ restMode: true, username: 'easycase' });
    const easyA = mkQuest({
      owner: easyUser._id,
      type: 'daily',
      difficulty: 'easy',
      title: 'Water plants',
      createdAt: new Date('2026-06-05T00:00:00.000Z'),
    });
    mkQuest({ owner: easyUser._id, type: 'daily', difficulty: 'hard', title: 'Deep clean' });

    res = await request(app).get('/api/analytics/rest-mode').set(auth(S(easyUser._id)));
    expect(res.body.suggestion.type).toBe('EASY_QUEST');
    expect(res.body.suggestion.questId).toBe(S(easyA._id));

    // only medium left -> the smallest thing available is still offered
    const medUser = mkUser({ restMode: true, username: 'medcase' });
    const med = mkQuest({
      owner: medUser._id,
      type: 'daily',
      difficulty: 'medium',
      title: 'Tidy desk',
    });
    res = await request(app).get('/api/analytics/rest-mode').set(auth(S(medUser._id)));
    expect(res.body.suggestion.type).toBe('SMALL_QUEST');
    expect(res.body.suggestion.questId).toBe(S(med._id));
  });

  test('recommendation uses only the authenticated user data', async () => {
    const a = mkUser({ restMode: true, username: 'mine' });
    const b = mkUser({ restMode: true, username: 'theirs' });

    const myQuest = mkQuest({ owner: a._id, type: 'quick', difficulty: 'easy', title: 'My quick' });
    const theirQuest = mkQuest({
      owner: b._id,
      type: 'quick',
      difficulty: 'easy',
      title: 'Their quick',
    });

    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.body.suggestion.questId).toBe(S(myQuest._id));
    expect(res.body.suggestion.questId).not.toBe(S(theirQuest._id));
    expect(res.body.suggestion.message).toContain('My quick');
    expect(res.body.suggestion.message).not.toContain('Their quick');

    // the returned id is a real, pending document owned by the caller
    const owned = Qs.find((q) => S(q._id) === res.body.suggestion.questId);
    expect(owned).toBeDefined();
    expect(S(owned.owner)).toBe(S(a._id));
    expect(owned.status).toBe('pending');
  });

  test('no suitable lightweight quest -> safe informational fallback (no invented id)', async () => {
    // (a) the log holds only heavy quests
    const heavy = mkUser({ restMode: true, username: 'heavy' });
    mkQuest({ owner: heavy._id, difficulty: 'hard', title: 'Deep clean' });
    mkQuest({ owner: heavy._id, difficulty: 'epic', title: 'Marathon' });

    let res = await request(app).get('/api/analytics/rest-mode').set(auth(S(heavy._id)));
    expect(res.body.enabled).toBe(true);
    expect(res.body.suggestion.type).toBe('QUIET_LOG');
    expect(res.body.suggestion.questId).toBeNull();
    expect(res.body.context.pendingQuests).toBe(2);
    expect(res.body.context.lightweightQuests).toBe(0);

    // (b) completely empty log -> distinct safe message, still no id
    const empty = mkUser({ restMode: true, username: 'empty' });
    res = await request(app).get('/api/analytics/rest-mode').set(auth(S(empty._id)));
    expect(res.body.suggestion.type).toBe('QUIET_LOG');
    expect(res.body.suggestion.questId).toBeNull();
    expect(res.body.suggestion.message).not.toMatch(/marathon/i);
  });

  test('Rest Mode OFF returns the neutral reference even when light quests exist', async () => {
    const a = mkUser();
    mkQuest({ owner: a._id, type: 'quick', difficulty: 'easy', title: 'One push-up' });

    const res = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    expect(res.body.enabled).toBe(false);
    expect(res.body.suggestion.type).toBe('NORMAL_MODE');
    expect(res.body.suggestion.questId).toBeNull();
  });

  test('output is deterministic and only easy/medium count as light', async () => {
    expect(LIGHT_RANK_MAX).toBe(1);

    const a = mkUser({ restMode: true });
    mkQuest({ owner: a._id, type: 'quick', difficulty: 'hard', title: 'Hard quick' });
    mkQuest({ owner: a._id, type: 'daily', difficulty: 'easy', title: 'Easy daily' });

    const first = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));
    const second = await request(app).get('/api/analytics/rest-mode').set(auth(S(a._id)));

    // the hard quick quest is NOT treated as light; the easy daily is chosen
    expect(first.body.suggestion.type).toBe('EASY_QUEST');
    expect(first.body).toEqual(second.body);
  });
});
