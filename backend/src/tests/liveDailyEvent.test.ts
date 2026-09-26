/**
 * Sprint 6C — Deterministic daily events + realtime delivery.
 *
 * Covers: pure date->event derivation (determinism, strict alternation,
 * year boundary, zero randomness, no timers), effect helpers (enabled
 * outside the test env, gated inside it — always with explicit dates so
 * results are date-independent), REST endpoint (401 + server-derived
 * payload, forged query params ignored), socket contract (second
 * read-only handler, unicast snapshot, ack shapes), and lazy rollover
 * broadcast to the global room exactly once per day change.
 *
 * Mocking follows the project's established style (setIo(ioMock)
 * harness). No DB, no Redis, no network.
 */
import './testEnv';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import {
  getDailyEvent,
  checkDailyEventRollover,
  resetDailyEventRollover,
  applyDailyXpBonus,
  applyDailyBossCoinBonus,
  DAILY_EVENT_SUBSCRIBE,
  DAILY_EVENT_UPDATED,
} from '../realtime/dailyEvent';
import { attachRealtime } from '../realtime/socketServer';
import { setIo } from '../realtime/emitter';
import { globalRoom } from '../realtime/rooms';
import liveRoutes from '../routes/liveRoutes';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
type Handler = (...args: any[]) => any;

let emit: jest.Mock;
let ioMock: any;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

const restoreNodeEnv = () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
};

// 2026-01-01 has an even UTC day-index (20454) -> DOUBLE_XP_WORLD;
// the next day is odd -> BOSS_BONUS. Anchors keep every assertion
// deterministic regardless of when the suite runs.
const D_EVEN = new Date(Date.UTC(2026, 0, 1));
const D_ODD = new Date(Date.UTC(2026, 0, 2));

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetDailyEventRollover();
  setIo(null);
  restoreNodeEnv();
});

afterEach(() => {
  setIo(null);
  restoreNodeEnv();
  jest.useRealTimers();
});

/* ==========================================================================
   A. Pure derivation: determinism, alternation, no randomness, no timers
   ========================================================================== */
describe('daily event derivation (pure, deterministic)', () => {
  test('same instant -> deeply equal event, across repeated calls', () => {
    const now = new Date('2026-03-15T10:20:30.000Z');
    expect(getDailyEvent(now)).toEqual(getDailyEvent(now));
    expect(getDailyEvent(now)).toEqual(getDailyEvent(now));
  });

  test('event shape: UTC YYYY-MM-DD date, known type, title/description/effects', () => {
    const e = getDailyEvent(new Date('2026-03-15T23:59:59.000Z'));
    expect(e.date).toBe('2026-03-15');
    expect(['DOUBLE_XP_WORLD', 'BOSS_BONUS']).toContain(e.type);
    expect(typeof e.title).toBe('string');
    expect(e.title.length).toBeGreaterThan(0);
    expect(typeof e.description).toBe('string');
    expect(typeof e.xpMultiplier).toBe('number');
    expect(typeof e.bossCoinBonus).toBe('number');
  });

  test('consecutive UTC days strictly alternate between the two event types', () => {
    let prev = '';
    for (let i = 1; i <= 8; i++) {
      const e = getDailyEvent(new Date(Date.UTC(2026, 5, i))); // June 1..8
      expect(['DOUBLE_XP_WORLD', 'BOSS_BONUS']).toContain(e.type);
      if (prev) expect(e.type).not.toBe(prev);
      prev = e.type;
    }
  });

  test('rotation survives a year boundary (Dec 31 -> Jan 1 still alternate)', () => {
    const a = getDailyEvent(new Date(Date.UTC(2026, 11, 31)));
    const b = getDailyEvent(new Date(Date.UTC(2027, 0, 1)));
    expect(a.date).toBe('2026-12-31');
    expect(b.date).toBe('2027-01-01');
    expect(a.type).not.toBe(b.type);
  });

  test('known anchors: 2026-01-01 DOUBLE_XP_WORLD, 2026-01-02 BOSS_BONUS', () => {
    expect(getDailyEvent(D_EVEN)).toEqual({
      date: '2026-01-01',
      type: 'DOUBLE_XP_WORLD',
      title: 'Double XP World',
      description: 'All XP earned today is doubled (x2).',
      xpMultiplier: 2,
      bossCoinBonus: 0,
    });
    expect(getDailyEvent(D_ODD)).toEqual({
      date: '2026-01-02',
      type: 'BOSS_BONUS',
      title: 'Boss Bonus Day',
      description: 'Defeating a boss today grants +50 bonus coins.',
      xpMultiplier: 1,
      bossCoinBonus: 50,
    });
  });

  test('no randomness: derivation never calls Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    getDailyEvent(new Date('2026-03-15T00:00:00.000Z'));
    getDailyEvent(new Date('2026-03-16T00:00:00.000Z'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('rollover observation schedules no timers (no cron/scheduler)', () => {
    jest.useFakeTimers();
    resetDailyEventRollover();
    checkDailyEventRollover(D_EVEN);
    checkDailyEventRollover(D_ODD);
    expect(jest.getTimerCount()).toBe(0);
  });
});

/* ==========================================================================
   B. Effect helpers: deterministic (explicit dates) + test-env gated
   ========================================================================== */
describe('event effect helpers (deterministic, test-gated)', () => {
  test('under NODE_ENV=test the helpers are no-ops on both event types', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(applyDailyXpBonus(100, D_EVEN)).toBe(100); // DOUBLE_XP day but gated
    expect(applyDailyXpBonus(100, D_ODD)).toBe(100);
    expect(applyDailyBossCoinBonus(50, D_ODD)).toBe(50); // BOSS_BONUS day but gated
    expect(applyDailyBossCoinBonus(50, D_EVEN)).toBe(50);
  });

  test('outside tests: DOUBLE_XP_WORLD doubles XP; BOSS day leaves XP alone', () => {
    process.env.NODE_ENV = 'development';
    expect(applyDailyXpBonus(100, D_EVEN)).toBe(200);
    expect(applyDailyXpBonus(75, D_EVEN)).toBe(150);
    expect(applyDailyXpBonus(100, D_ODD)).toBe(100);
  });

  test('outside tests: BOSS_BONUS adds +50 coins; DOUBLE_XP day leaves coins alone', () => {
    process.env.NODE_ENV = 'development';
    expect(applyDailyBossCoinBonus(50, D_ODD)).toBe(100);
    expect(applyDailyBossCoinBonus(50, D_EVEN)).toBe(50);
  });
});

/* ==========================================================================
   C. REST endpoint: GET /api/live/daily-event
   ========================================================================== */
describe('REST: GET /api/live/daily-event', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/live', liveRoutes);
  const tokenFor = (id: string) =>
    jwt.sign({ id, email: 'holder@t.test' }, SECRET, { expiresIn: '1h' });

  test('unauthenticated -> 401', async () => {
    const res = await request(app).get('/api/live/daily-event');
    expect(res.status).toBe(401);
  });

  test('garbage token -> 401', async () => {
    const res = await request(app)
      .get('/api/live/daily-event')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('authenticated -> 200 with the server-derived event payload', async () => {
    const res = await request(app)
      .get('/api/live/daily-event')
      .set('Authorization', `Bearer ${tokenFor('64b000000000000000000001')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(getDailyEvent());
    expect(['DOUBLE_XP_WORLD', 'BOSS_BONUS']).toContain(res.body.type);
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('forged query params (type/date/multipliers) are ignored', async () => {
    const res = await request(app)
      .get('/api/live/daily-event?type=BOSS_BONUS&date=2000-01-01&xpMultiplier=99&bossCoinBonus=999')
      .set('Authorization', `Bearer ${tokenFor('64b000000000000000000002')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(getDailyEvent());
    expect(res.body.xpMultiplier).not.toBe(99);
    expect(res.body.bossCoinBonus).not.toBe(999);
    expect(res.body.date).not.toBe('2000-01-01');
  });
});

/* ==========================================================================
   D. Socket contract: daily_event:subscribe + lazy rollover broadcast
   ========================================================================== */
describe('socket: daily_event:subscribe + rollover broadcast', () => {
  beforeEach(() => {
    emit = jest.fn();
    ioMock = { use: jest.fn(), on: jest.fn(), to: jest.fn(() => ({ emit })) };
    attachRealtime(ioMock); // registers connection handler + setIo(ioMock)
  });

  const connectAs = (userId: string) => {
    const onConnection: Handler = ioMock.on.mock.calls.find(
      (c: any[]) => c[0] === 'connection',
    )[1];
    const s: any = {
      data: { user: { id: userId } },
      join: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };
    onConnection(s);
    const handlers = new Map<string, Handler>();
    s.on.mock.calls.forEach(([name, fn]: [string, Handler]) => handlers.set(name, fn));
    s.handlers = handlers;
    return s;
  };

  test('authenticated socket registers exactly the two read-only subscribe handlers', () => {
    const s = connectAs('u1');
    expect([...s.handlers.keys()]).toEqual(['leaderboard:subscribe', DAILY_EVENT_SUBSCRIBE]);
    // Gameplay/forge events still have no handler at all.
    expect(s.handlers.has('daily_event:update')).toBe(false);
    expect(s.handlers.has('quest:completed')).toBe(false);
  });

  test('subscribe unicasts a server-derived snapshot + acks ok, no broadcast', () => {
    const s = connectAs('u1');
    const ack = jest.fn();
    s.handlers.get(DAILY_EVENT_SUBSCRIBE)({}, ack);
    expect(s.emit).toHaveBeenCalledWith(DAILY_EVENT_UPDATED, getDailyEvent());
    expect(ack).toHaveBeenCalledWith({ ok: true, type: getDailyEvent().type });
    expect(ioMock.to).not.toHaveBeenCalled(); // first observation never broadcasts
  });

  test('forged payload (type/date/multiplier) cannot influence the snapshot', () => {
    const s = connectAs('u1');
    const ack = jest.fn();
    s.handlers.get(DAILY_EVENT_SUBSCRIBE)(
      { type: 'DOUBLE_XP_WORLD', date: '2000-01-01', xpMultiplier: 99 },
      ack,
    );
    const call = s.emit.mock.calls.find((c: any[]) => c[0] === DAILY_EVENT_UPDATED);
    expect(call[1]).toEqual(getDailyEvent());
    expect(call[1].xpMultiplier).not.toBe(99);
    expect(call[1].date).not.toBe('2000-01-01');
    expect(ack).toHaveBeenCalledWith({ ok: true, type: getDailyEvent().type });
  });

  test('works when the callback arrives as the only argument (socket.io style)', () => {
    const s = connectAs('u1');
    const ack = jest.fn();
    s.handlers.get(DAILY_EVENT_SUBSCRIBE)(ack);
    expect(ack).toHaveBeenCalledWith({ ok: true, type: getDailyEvent().type });
    expect(s.emit).toHaveBeenCalledWith(DAILY_EVENT_UPDATED, getDailyEvent());
  });

  test('subscribe without any callback never throws', () => {
    const s = connectAs('u1');
    expect(() => s.handlers.get(DAILY_EVENT_SUBSCRIBE)()).not.toThrow();
    expect(s.emit).toHaveBeenCalledWith(DAILY_EVENT_UPDATED, getDailyEvent());
  });

  test('day rollover emits daily_event:updated to the GLOBAL room exactly once', () => {
    setIo(ioMock);
    resetDailyEventRollover();
    expect(checkDailyEventRollover(D_EVEN)).toBe(false); // first observation: recorded only
    expect(ioMock.to).not.toHaveBeenCalled();
    expect(checkDailyEventRollover(D_EVEN)).toBe(false); // same day: no re-emit
    expect(checkDailyEventRollover(D_ODD)).toBe(true); // day changed: emit
    expect(ioMock.to).toHaveBeenCalledTimes(1);
    expect(ioMock.to).toHaveBeenCalledWith(globalRoom());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      DAILY_EVENT_UPDATED,
      expect.objectContaining({ date: '2026-01-02', type: 'BOSS_BONUS' }),
    );
    expect(checkDailyEventRollover(D_ODD)).toBe(false); // exactly once per change
    expect(checkDailyEventRollover(new Date(Date.UTC(2026, 0, 3)))).toBe(true);
    expect(ioMock.to).toHaveBeenCalledTimes(2);
  });

  test('rollover is safe with no realtime server attached (no throw, no timer)', () => {
    jest.useFakeTimers();
    setIo(null);
    resetDailyEventRollover();
    expect(checkDailyEventRollover(D_EVEN)).toBe(false);
    expect(checkDailyEventRollover(D_ODD)).toBe(true); // observed; emission no-ops
    expect(jest.getTimerCount()).toBe(0);
  });
});


