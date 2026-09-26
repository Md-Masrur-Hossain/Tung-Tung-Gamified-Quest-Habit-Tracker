/**
 * Sprint 6A — Live Leaderboard (global + friends, server-authoritative).
 *
 * Covers: ranking + tie-breakers, top-50 / friends-20 caps, accepted-friends-only
 * membership (self always a candidate), REST 401/auth + forged query params,
 * socket auth + identity-from-handshake, debounced leaderboard:updated emission
 * to the global room, and foundation regression (single read-only handler).
 *
 * Mocking follows the project's established in-memory style (spyOn model
 * statics with thenable query chains — see socialFriends.test.ts).
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { User } from '../models/User';
import { Friendship } from '../models/Friendship';
import {
  getLeaderboard,
  resetLeaderboardRefresh,
  GLOBAL_LEADERBOARD_SIZE,
  FRIENDS_LEADERBOARD_MAX,
  LEADERBOARD_REFRESH_MS,
} from '../services/leaderboardService';
import { awardXp, updateStreak } from '../services/progressionService';
import { attachRealtime } from '../realtime/socketServer';
import { setIo } from '../realtime/emitter';
import { globalRoom } from '../realtime/rooms';
import liveRoutes from '../routes/liveRoutes';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const oid = () => new Types.ObjectId();
type Handler = (...args: any[]) => any;

/* ---------- in-memory model fixtures + thenable query mocks ---------- */
let U: any[] = [];
let F: any[] = [];
let emit: jest.Mock;
let ioMock: any;
let connectionHandler: Handler;

const mkU = (o: any = {}) => {
  const u: any = {
    _id: o._id || oid(),
    username: o.username || 'user',
    email: `${o.username || 'user'}@t.test`,
    passwordHash: 'HASH_SECRET',
    totalXP: 0,
    level: 1,
    coins: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletionDate: null,
    save: jest.fn(async function (this: any) {
      return this;
    }),
  };
  Object.assign(u, o);
  U.push(u);
  return u;
};

const pop = (r: any) => {
  if (!r) return r;
  if (typeof r === 'object' && r.username !== undefined) return r;
  return U.find((u) => S(u._id) === S(r)) || r;
};

const applySort = (rows: any[], spec: Record<string, number>) =>
  [...rows].sort((a, b) => {
    for (const key of Object.keys(spec)) {
      const dir = spec[key];
      if (a[key] < b[key]) return -dir;
      if (a[key] > b[key]) return dir;
    }
    return 0;
  });

const Q = (initial: any[]) => {
  let rows = initial;
  let sorter: any = null;
  let lim: number | null = null;
  const q: any = {
    sort: jest.fn((spec: any) => {
      sorter = spec;
      return q;
    }),
    limit: jest.fn((n: number) => {
      lim = n;
      return q;
    }),
    select: jest.fn(() => q),
    populate: jest.fn(() => q),
  };
  q.then = (res: any, rej: any) => {
    let out = sorter ? applySort(rows, sorter) : rows;
    if (lim !== null) out = out.slice(0, lim);
    return Promise.resolve(out).then(res, rej);
  };
  return q;
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  U = [];
  F = [];
  resetLeaderboardRefresh();
  setIo(null);

  jest.spyOn(User, 'find').mockImplementation(((filter: any = {}) => {
    let rows = [...U];
    if (filter && filter._id && filter._id.$in) {
      const allow = filter._id.$in.map((v: any) => S(v));
      rows = rows.filter((u) => allow.includes(S(u._id)));
    }
    return Q(rows);
  }) as any);
  jest.spyOn(User, 'findById').mockImplementation(((id: any) =>
    Promise.resolve(U.find((u) => S(u._id) === S(id)) || null)) as any);
  jest.spyOn(Friendship, 'find').mockImplementation(((filter: any = {}) => {
    let rows = [...F];
    if (filter.status) rows = rows.filter((f) => f.status === filter.status);
    if (filter.$or) {
      rows = rows.filter((f) =>
        filter.$or.some(
          (c: any) =>
            (!c.requester || S(f.requester) === S(c.requester)) &&
            (!c.recipient || S(f.recipient) === S(c.recipient)),
        ),
      );
    }
    return Q(rows.map((f) => ({ ...f, requester: pop(f.requester), recipient: pop(f.recipient) })));
  }) as any);
});

afterEach(() => {
  resetLeaderboardRefresh();
  setIo(null);
  jest.useRealTimers();
});

/* ---------- helpers ---------- */
const seedFriends = () => {
  const me = mkU({ username: 'me', totalXP: 100, level: 2 });
  const f1 = mkU({ username: 'friend1', totalXP: 500, level: 3 });
  const f2 = mkU({ username: 'friend2', totalXP: 50, level: 1 });
  const pending = mkU({ username: 'pendingUser', totalXP: 9999, level: 9 });
  const rejected = mkU({ username: 'rejectedUser', totalXP: 9999, level: 9 });
  const stranger = mkU({ username: 'stranger', totalXP: 9999, level: 9 });
  F.push({ _id: oid(), requester: me._id, recipient: f1._id, status: 'ACCEPTED', createdAt: new Date() });
  F.push({ _id: oid(), requester: f2._id, recipient: me._id, status: 'ACCEPTED', createdAt: new Date() });
  F.push({ _id: oid(), requester: pending._id, recipient: me._id, status: 'PENDING', createdAt: new Date() });
  F.push({ _id: oid(), requester: me._id, recipient: rejected._id, status: 'REJECTED', createdAt: new Date() });
  return { me, f1, f2, pending, rejected, stranger };
};

const seedCircle = (n: number) => {
  const me = mkU({ username: 'me', totalXP: 1000, level: 9 });
  for (let i = 0; i < n; i++) {
    const f = mkU({ username: `f${String(i).padStart(2, '0')}`, totalXP: i + 1, level: 1 });
    F.push({ _id: oid(), requester: me._id, recipient: f._id, status: 'ACCEPTED', createdAt: new Date() });
  }
  return { me };
};

const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/* ========================= Global ranking ========================= */
describe('Leaderboard: global ranking (server-derived)', () => {
  test('ranks by totalXP descending with server-assigned ranks', async () => {
    mkU({ username: 'aaa', totalXP: 10 });
    mkU({ username: 'zzz', totalXP: 900 });
    mkU({ username: 'mmm', totalXP: 500 });
    const snap = await getLeaderboard('global');
    expect(snap.scope).toBe('global');
    expect(snap.entries.map((e) => e.username)).toEqual(['zzz', 'mmm', 'aaa']);
    expect(snap.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(typeof snap.generatedAt).toBe('string');
  });

  test('tie-break 1: level desc wins over username order', async () => {
    mkU({ username: 'alpha', totalXP: 100, level: 2 });
    mkU({ username: 'zeta', totalXP: 100, level: 5 });
    const snap = await getLeaderboard('global');
    expect(snap.entries.map((e) => e.username)).toEqual(['zeta', 'alpha']);
  });

  test('tie-break 2: longestStreak desc on equal XP and level', async () => {
    mkU({ username: 'alpha', totalXP: 100, level: 3, longestStreak: 2 });
    mkU({ username: 'zeta', totalXP: 100, level: 3, longestStreak: 9 });
    const snap = await getLeaderboard('global');
    expect(snap.entries.map((e) => e.username)).toEqual(['zeta', 'alpha']);
  });

  test('final tie-break: username ascending when everything else ties', async () => {
    mkU({ username: 'zoe', totalXP: 50, level: 1, longestStreak: 0 });
    mkU({ username: 'amy', totalXP: 50, level: 1, longestStreak: 0 });
    const snap = await getLeaderboard('global');
    expect(snap.entries.map((e) => e.username)).toEqual(['amy', 'zoe']);
  });

  test('returns exactly the server-derived top 50', async () => {
    for (let i = 0; i < 60; i++) mkU({ username: `u${String(i).padStart(2, '0')}`, totalXP: i });
    const snap = await getLeaderboard('global');
    expect(snap.entries).toHaveLength(GLOBAL_LEADERBOARD_SIZE);
    expect(snap.entries[0].totalXP).toBe(59);
    expect(snap.entries[49].rank).toBe(50);
    expect(snap.entries[49].totalXP).toBe(10);
    expect(snap.entries.some((e) => e.totalXP === 9)).toBe(false);
  });

  test('entries are sanitized: only public ranking fields, no secrets', async () => {
    mkU({ username: 'x', totalXP: 5, email: 'leak@hidden.test', passwordHash: 'HASH_SECRET' });
    const snap = await getLeaderboard('global');
    expect(Object.keys(snap.entries[0]).sort()).toEqual([
      'level',
      'longestStreak',
      'rank',
      'totalXP',
      'userId',
      'username',
    ]);
    const json = JSON.stringify(snap);
    expect(json).not.toContain('HASH_SECRET');
    expect(json).not.toContain('leak@hidden.test');
    expect(json).not.toContain('passwordHash');
  });
});
/* ========================= Friends scope ========================= */
describe('Leaderboard: friends scope', () => {
  test('includes authenticated self + accepted friends only, ranked', async () => {
    const { me, stranger } = seedFriends();
    const snap = await getLeaderboard('friends', S(me._id));
    expect(snap.scope).toBe('friends');
    expect(snap.entries.map((e) => e.username)).toEqual(['friend1', 'me', 'friend2']);
    expect(snap.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    const ids = snap.entries.map((e) => e.userId);
    expect(ids).toContain(S(me._id));
    expect(ids).not.toContain(S(stranger._id));
  });

  test('pending, rejected and unrelated users are excluded', async () => {
    const { me, pending, rejected, stranger } = seedFriends();
    const snap = await getLeaderboard('friends', S(me._id));
    const ids = snap.entries.map((e) => e.userId);
    expect(ids).not.toContain(S(pending._id));
    expect(ids).not.toContain(S(rejected._id));
    expect(ids).not.toContain(S(stranger._id));
    expect(snap.entries).toHaveLength(3);
  });

  test('self is always included even with zero friends', async () => {
    const me = mkU({ username: 'lonely', totalXP: 7 });
    const snap = await getLeaderboard('friends', S(me._id));
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0].username).toBe('lonely');
    expect(snap.entries[0].rank).toBe(1);
  });

  test('honors the requested limit', async () => {
    const { me } = seedFriends();
    const snap = await getLeaderboard('friends', S(me._id), 1);
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0].username).toBe('friend1'); // highest XP in circle
  });

  test('caps at 20 even when asked for more', async () => {
    const { me } = seedCircle(30);
    const snap = await getLeaderboard('friends', S(me._id), 500);
    expect(snap.entries).toHaveLength(FRIENDS_LEADERBOARD_MAX);
    expect(snap.entries.map((e) => e.username)).toContain('me');
    expect(snap.entries[1].username).toBe('f29'); // best-scoring friend tops the circle after self
  });

  test('defaults to a maximum of 20 entries', async () => {
    const { me } = seedCircle(30);
    const snap = await getLeaderboard('friends', S(me._id));
    expect(snap.entries).toHaveLength(FRIENDS_LEADERBOARD_MAX);
    expect(snap.entries.map((e) => e.username)).toContain('me');
  });

  test('friends scope requires an authenticated user id', async () => {
    await expect(getLeaderboard('friends')).rejects.toMatchObject({ status: 400 });
  });
});
/* ========================= REST endpoint ========================= */
describe('Leaderboard: REST endpoint (GET /api/live/leaderboard)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/live', liveRoutes);
  const tokenFor = (id: string) => jwt.sign({ id, email: 'holder@t.test' }, SECRET, { expiresIn: '1h' });

  test('unauthenticated requests are rejected with 401', async () => {
    const res = await request(app).get('/api/live/leaderboard');
    expect(res.status).toBe(401);
  });

  test('garbage tokens are rejected with 401', async () => {
    const res = await request(app)
      .get('/api/live/leaderboard')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('authenticated request returns the server-derived global snapshot', async () => {
    mkU({ username: 'goat', totalXP: 42 });
    const res = await request(app)
      .get('/api/live/leaderboard?scope=global')
      .set('Authorization', `Bearer ${tokenFor(S(oid()))}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('global');
    expect(res.body.entries[0]).toMatchObject({ rank: 1, username: 'goat', totalXP: 42 });
  });

  test('unknown scope is rejected with 400', async () => {
    const res = await request(app)
      .get('/api/live/leaderboard?scope=everything')
      .set('Authorization', `Bearer ${tokenFor(S(oid()))}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/scope/i);
  });

  test('invalid limits are rejected with 400', async () => {
    for (const limit of ['abc', '0']) {
      const res = await request(app)
        .get(`/api/live/leaderboard?scope=friends&limit=${limit}`)
        .set('Authorization', `Bearer ${tokenFor(S(oid()))}`);
      expect(res.status).toBe(400);
    }
  });

  test('client-supplied userId/rank/XP/level can never forge the board', async () => {
    const me = mkU({ username: 'me', totalXP: 10, level: 1 });
    const victim = mkU({ username: 'victim', totalXP: 7777, level: 9 });
    const res = await request(app)
      .get(
        `/api/live/leaderboard?scope=friends&userId=${S(victim._id)}&rank=1&totalXP=999999&level=99`,
      )
      .set('Authorization', `Bearer ${tokenFor(S(me._id))}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({ username: 'me', rank: 1, totalXP: 10, level: 1 });
    expect(res.body.entries.some((e: any) => e.username === 'victim')).toBe(false);
  });
});
/* ================== Socket contract + debounce ================== */
describe('Leaderboard: socket contract + debounced realtime refresh', () => {
  beforeEach(() => {
    emit = jest.fn();
    ioMock = { use: jest.fn(), on: jest.fn(), to: jest.fn(() => ({ emit })) };
    attachRealtime(ioMock); // registers connection handler + setIo(ioMock)
    connectionHandler = ioMock.on.mock.calls.find((c: any[]) => c[0] === 'connection')[1];
  });

  /* --- socket contract --- */
  test('unauthenticated sockets get zero handlers and are disconnected', () => {
    const s = makeSocket();
    connectionHandler(s);
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(s.handlers.size).toBe(0);
    expect(s.handlers.has('leaderboard:subscribe')).toBe(false);
  });

  test('subscribe returns a snapshot to the requesting socket only', async () => {
    mkU({ username: 'solo', totalXP: 7 });
    const s = connectAs(S(oid()));
    const ack = jest.fn();
    await s.handlers.get('leaderboard:subscribe')({}, ack);
    expect(s.emit).toHaveBeenCalledWith(
      'leaderboard:updated',
      expect.objectContaining({ scope: 'global', entries: expect.any(Array) }),
    );
    expect(ack).toHaveBeenCalledWith({ ok: true, scope: 'global' });
    expect(ioMock.to).not.toHaveBeenCalled(); // initial snapshot is unicast, not a broadcast
  });

  test('friends identity comes from the handshake; payload userId is ignored', async () => {
    const { me } = seedFriends();
    const s = connectAs(S(me._id));
    const ack = jest.fn();
    await s.handlers.get('leaderboard:subscribe')(
      { scope: 'friends', userId: S(oid()) }, // forged foreign id
      ack,
    );
    expect(ack).toHaveBeenCalledWith({ ok: true, scope: 'friends' });
    const call = s.emit.mock.calls.find((c: any[]) => c[0] === 'leaderboard:updated');
    const names = (call[1] as any).entries.map((e: any) => e.username).sort();
    expect(names).toEqual(['friend1', 'friend2', 'me']);
  });

  test('forged rank/XP/level/entries in the payload are ignored', async () => {
    const me = mkU({ username: 'me', totalXP: 7, level: 1 });
    const s = connectAs(S(me._id));
    const ack = jest.fn();
    await s.handlers.get('leaderboard:subscribe')(
      { scope: 'global', rank: 99, totalXP: 123456, level: 77, entries: [{ rank: 1, totalXP: 99999 }] },
      ack,
    );
    const call = s.emit.mock.calls.find((c: any[]) => c[0] === 'leaderboard:updated');
    const snap = call[1] as any;
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0]).toMatchObject({ rank: 1, totalXP: 7, level: 1, username: 'me' });
    expect(ack).toHaveBeenCalledWith({ ok: true, scope: 'global' });
  });

  test('invalid scope acks an error and emits no snapshot', async () => {
    const s = connectAs(S(oid()));
    const ack = jest.fn();
    await s.handlers.get('leaderboard:subscribe')({ scope: 'sprint8' }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: 'Invalid leaderboard scope' });
    expect(s.emit.mock.calls.some((c: any[]) => c[0] === 'leaderboard:updated')).toBe(false);
  });

  /* --- debounced realtime refresh --- */
  test('progression change emits leaderboard:updated to the global room after ~5s', async () => {
    jest.useFakeTimers();
    const hero = mkU({ username: 'hero', totalXP: 100, level: 2 });
    await awardXp(hero._id, 50);
    expect(hero.totalXP).toBe(150);
    expect(ioMock.to).not.toHaveBeenCalled(); // nothing before the debounce window
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS);
    await tick();
    expect(ioMock.to).toHaveBeenCalledTimes(1);
    expect(ioMock.to).toHaveBeenCalledWith(globalRoom());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'leaderboard:updated',
      expect.objectContaining({ scope: 'global' }),
    );
    const snap = emit.mock.calls[0][1] as any;
    expect(snap.entries[0].totalXP).toBe(150); // freshly recomputed server-side
  });

  test('rapid progression changes coalesce into a single emission (throttle)', async () => {
    jest.useFakeTimers();
    const u = mkU({ username: 'burst', totalXP: 0 });
    await awardXp(u._id, 10);
    await awardXp(u._id, 10);
    await awardXp(u._id, 10);
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS - 1);
    await tick();
    expect(emit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await tick();
    expect(emit).toHaveBeenCalledTimes(1);
    expect((emit.mock.calls[0][1] as any).entries[0].totalXP).toBe(30);
  });

  test('a later progression change opens a fresh debounce window', async () => {
    jest.useFakeTimers();
    const u = mkU({ username: 'later', totalXP: 0 });
    await awardXp(u._id, 5);
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS);
    await tick();
    expect(emit).toHaveBeenCalledTimes(1);
    await awardXp(u._id, 5);
    expect(emit).toHaveBeenCalledTimes(1); // new window still pending
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS);
    await tick();
    expect(emit).toHaveBeenCalledTimes(2);
    expect((emit.mock.calls[1][1] as any).entries[0].totalXP).toBe(10);
  });

  test('streak progression (updateStreak) also marks the leaderboard dirty', async () => {
    jest.useFakeTimers();
    const u = mkU({ username: 'streaker', totalXP: 0 });
    await updateStreak(u, new Date());
    expect(u.longestStreak).toBe(1);
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS);
    await tick();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(ioMock.to).toHaveBeenCalledWith(globalRoom());
  });

  test('no realtime server attached -> no timer, no emission (unit-test safety)', async () => {
    jest.useFakeTimers();
    setIo(null);
    const u = mkU({ username: 'quiet', totalXP: 0 });
    await awardXp(u._id, 10);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(LEADERBOARD_REFRESH_MS * 2);
    await tick();
    expect(emit).not.toHaveBeenCalled();
  });
});

/* ---------- socket harness (Sprint 6 style) ---------- */
const makeSocket = () => {
  const handlers = new Map<string, Handler>();
  const socket: any = {
    data: {},
    handshake: { auth: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn((ev: string, h: Handler) => handlers.set(ev, h)),
    handlers,
  };
  return socket;
};

function connectAs(id: string) {
  const s = makeSocket();
  s.data.user = { id, email: `${id}@t.test` };
  connectionHandler(s);
  return s;
}