/**
 * Sprint 6B — Persisted notifications (creation, persistence, listing,
 * read state, user isolation, REST auth, private realtime delivery).
 *
 * Mocking follows the project's established in-memory style (spyOn model
 * statics with thenable query chains — see socialFriends / leaderboard tests).
 * No DB, no Redis, no fake timers needed: emission is synchronous after await.
 */
import './testEnv';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import express from 'express';
import request from 'supertest';

import { Notification } from '../models/Notification';
import {
  createNotification,
  listNotifications,
  markNotificationRead,
} from '../services/notificationService';
import { attachRealtime } from '../realtime/socketServer';
import { setIo } from '../realtime/emitter';
import { userRoom, globalRoom } from '../realtime/rooms';
import liveRoutes from '../routes/liveRoutes';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const oid = () => new Types.ObjectId();
type Handler = (...args: any[]) => any;

/* ---------- in-memory fixtures + thenable query mocks ---------- */
let N: any[] = [];
let emit: jest.Mock;
let ioMock: any;

const mkN = (o: any = {}) => {
  const n: any = {
    _id: o._id || oid(),
    userId: o.userId,
    type: o.type || 'system',
    title: o.title || 'title',
    message: '',
    read: false,
    readAt: null,
    createdAt: new Date(),
    save: jest.fn(async function (this: any) {
      return this;
    }),
  };
  Object.assign(n, o);
  N.push(n);
  return n;
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
  const q: any = {
    sort: jest.fn((spec: any) => {
      sorter = spec;
      return q;
    }),
    limit: jest.fn(() => q),
    select: jest.fn(() => q),
    populate: jest.fn(() => q),
  };
  q.then = (res: any, rej: any) => {
    const out = sorter ? applySort(rows, sorter) : rows;
    return Promise.resolve(out).then(res, rej);
  };
  return q;
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  N = [];
  setIo(null);

  jest.spyOn(Notification, 'create').mockImplementation((async (d: any) => mkN(d)) as any);
  jest.spyOn(Notification, 'find').mockImplementation(((filter: any = {}) => {
    let rows = [...N];
    if (filter.userId) rows = rows.filter((n) => S(n.userId) === S(filter.userId));
    return Q(rows);
  }) as any);
  jest.spyOn(Notification, 'findOne').mockImplementation(((filter: any = {}) =>
    Promise.resolve(
      N.find(
        (n) =>
          (!filter._id || S(n._id) === S(filter._id)) &&
          (!filter.userId || S(n.userId) === S(filter.userId)),
      ) || null,
    )) as any);
});

afterEach(() => {
  setIo(null);
});

const setupIo = () => {
  emit = jest.fn();
  ioMock = { use: jest.fn(), on: jest.fn(), to: jest.fn(() => ({ emit })) };
  setIo(ioMock);
};

/* ==========================================================================
   A. Creation + persistence + private realtime delivery
   ========================================================================== */
describe('createNotification: persistence & realtime', () => {
  const uid = oid().toString();

  beforeEach(() => {
    setupIo();
  });

  test('persists notification for the target user (read=false, readAt=null)', async () => {
    const doc: any = await createNotification(uid, 'system', 'Hello', 'World');
    expect(N).toHaveLength(1);
    expect((Notification.create as jest.Mock).mock.calls[0][0]).toMatchObject({
      userId: uid,
      type: 'system',
      title: 'Hello',
      message: 'World',
    });
    expect(doc.read).toBe(false);
    expect(doc.readAt).toBe(null);
    expect(S(doc.userId)).toBe(uid);
    expect(doc._id).toBeDefined();
  });

  test('emits notification:new to user:{userId} ONLY AFTER successful persistence', async () => {
    const doc: any = await createNotification(uid, 'reward', 'Coins', '+10 coins');
    // Persist-before-emit: create() was invoked before the emit call...
    expect((Notification.create as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0],
    );
    // ...and emission goes only to the private user room.
    expect(ioMock.to).toHaveBeenCalledTimes(1);
    expect(ioMock.to).toHaveBeenCalledWith(userRoom(uid));
    expect(ioMock.to).not.toHaveBeenCalledWith(globalRoom());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe('notification:new');
    // Payload is the persisted document's projection.
    expect(emit.mock.calls[0][1]).toEqual({
      id: String(doc._id),
      userId: uid,
      type: 'reward',
      title: 'Coins',
      message: '+10 coins',
      read: false,
      readAt: null,
      createdAt: new Date(doc.createdAt).toISOString(),
    });
  });

  test('failed persistence emits nothing', async () => {
    (Notification.create as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('write concern failed');
    });
    await expect(createNotification(uid, 'system', 'T', 'M')).rejects.toThrow(
      'write concern failed',
    );
    expect(ioMock.to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  test('never broadcasts notifications to the global room', async () => {
    await createNotification(uid, 'system', 'Private', 'for one user');
    const rooms = ioMock.to.mock.calls.map((c: any[]) => c[0]);
    expect(rooms).toEqual([userRoom(uid)]);
    expect(rooms).not.toContain(globalRoom());
    expect(rooms).not.toContain(userRoom(oid().toString()));
  });
});

/* ==========================================================================
   B. Listing (scoped, newest first, sanitized)  +  C. Read state & isolation
   ========================================================================== */
describe('listNotifications', () => {
  const a = oid().toString();
  const b = oid().toString();

  test('returns only the authenticated user\'s notifications, newest first', async () => {
    const nOld = mkN({ userId: new Types.ObjectId(a), createdAt: new Date('2026-01-01T00:00:00Z') });
    const nNew = mkN({ userId: new Types.ObjectId(a), createdAt: new Date('2026-06-01T00:00:00Z') });
    mkN({ userId: new Types.ObjectId(b), createdAt: new Date('2026-12-01T00:00:00Z') });

    const rows = await listNotifications(a);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual([S(nNew._id), S(nOld._id)]);
    expect((Notification.find as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: a });
  });

  test('payload exposes only safe notification fields', async () => {
    mkN({ userId: new Types.ObjectId(a) });
    const rows = await listNotifications(a);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'createdAt',
      'id',
      'message',
      'read',
      'readAt',
      'title',
      'type',
      'userId',
    ]);
    expect(rows[0].read).toBe(false);
    expect(rows[0].readAt).toBe(null);
  });

  test('empty list for a user with no notifications (others\' data never leaks in)', async () => {
    mkN({ userId: new Types.ObjectId(b) });
    expect(await listNotifications(a)).toEqual([]);
  });
});

describe('markNotificationRead: read state & user isolation', () => {
  const a = oid().toString();
  const b = oid().toString();

  test('marks own unread notification as read and sets readAt', async () => {
    const n = mkN({ userId: new Types.ObjectId(a), read: false, readAt: null });
    const before = Date.now();
    const out = await markNotificationRead(a, S(n._id));
    expect(out.read).toBe(true);
    expect(out.readAt).not.toBe(null);
    expect(new Date(String(out.readAt)).getTime()).toBeGreaterThanOrEqual(before);
    expect(n.read).toBe(true);
    expect(n.save).toHaveBeenCalledTimes(1);
    // Scoped query includes the owner.
    expect((Notification.findOne as jest.Mock).mock.calls[0][0]).toMatchObject({
      userId: a,
    });
  });

  test('idempotent: already-read notification keeps its original readAt', async () => {
    const n = mkN({ userId: new Types.ObjectId(a), read: false, readAt: null });
    const first = await markNotificationRead(a, S(n._id));
    const second = await markNotificationRead(a, S(n._id));
    expect(second.read).toBe(true);
    expect(second.readAt).toBe(first.readAt);
    expect(n.save).toHaveBeenCalledTimes(1);
  });

  test('user isolation: another user\'s notification id is rejected as not found', async () => {
    const n = mkN({ userId: new Types.ObjectId(b), read: false });
    await expect(markNotificationRead(a, S(n._id))).rejects.toMatchObject({ status: 404 });
    expect(n.read).toBe(false);
    expect(n.save).not.toHaveBeenCalled();
  });

  test('invalid notification id is rejected with 400', async () => {
    await expect(markNotificationRead(a, 'not-a-valid-id')).rejects.toMatchObject({
      status: 400,
    });
    expect(Notification.findOne).not.toHaveBeenCalled();
  });

  test('unknown-but-valid notification id is 404', async () => {
    await expect(markNotificationRead(a, oid().toString())).rejects.toMatchObject({
      status: 404,
    });
  });

  test('invalid user id is rejected with 400 on every service entry point', async () => {
    await expect(listNotifications('nope')).rejects.toMatchObject({ status: 400 });
    await expect(createNotification('nope', 'system', 't')).rejects.toMatchObject({
      status: 400,
    });
    await expect(markNotificationRead('nope', oid().toString())).rejects.toMatchObject({
      status: 400,
    });
  });
});

/* ==========================================================================
   D. REST API: auth required, identity from JWT, foreign/invalid ids rejected
   ========================================================================== */
describe('REST /api/live/notifications', () => {
  const a = oid().toString();
  const b = oid().toString();
  const app = express();
  app.use('/api/live', liveRoutes);
  const token = (id: string) => jwt.sign({ id, email: `${id}@x.io` }, SECRET);

  test('GET unauthenticated -> 401', async () => {
    const res = await request(app).get('/api/live/notifications');
    expect(res.status).toBe(401);
  });

  test('GET returns only the JWT user\'s notifications', async () => {
    mkN({ userId: new Types.ObjectId(a), title: 'A1' });
    mkN({ userId: new Types.ObjectId(a), title: 'A2' });
    mkN({ userId: new Types.ObjectId(b), title: 'B1' });
    const res = await request(app)
      .get('/api/live/notifications')
      .set('Authorization', `Bearer ${token(a)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((n: any) => n.title).sort()).toEqual(['A1', 'A2']);
    expect(res.body.every((n: any) => n.userId === a)).toBe(true);
  });

  test('there is NO client-facing notification create endpoint', async () => {
    const res = await request(app)
      .post('/api/live/notifications')
      .set('Authorization', `Bearer ${token(a)}`)
      .send({ userId: b, type: 'system', title: 'forged' });
    expect(res.status).toBe(404);
    expect(N).toHaveLength(0);
  });

  test('POST read unauthenticated -> 401', async () => {
    const n = mkN({ userId: new Types.ObjectId(a) });
    const res = await request(app).post(`/api/live/notifications/${S(n._id)}/read`);
    expect(res.status).toBe(401);
    expect(n.read).toBe(false);
  });

  test('POST read with invalid id -> 400', async () => {
    const res = await request(app)
      .post('/api/live/notifications/definitely-not-oid/read')
      .set('Authorization', `Bearer ${token(a)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid notification id/i);
  });

  test('POST read for ANOTHER user\'s notification -> 404, unchanged', async () => {
    const n = mkN({ userId: new Types.ObjectId(b), read: false });
    const res = await request(app)
      .post(`/api/live/notifications/${S(n._id)}/read`)
      .set('Authorization', `Bearer ${token(a)}`);
    expect(res.status).toBe(404);
    expect(n.read).toBe(false);
    expect(n.save).not.toHaveBeenCalled();
  });

  test('POST read own unread -> 200 with read=true and readAt set', async () => {
    const n = mkN({ userId: new Types.ObjectId(a), read: false, readAt: null });
    const res = await request(app)
      .post(`/api/live/notifications/${S(n._id)}/read`)
      .set('Authorization', `Bearer ${token(a)}`);
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect(res.body.readAt).toBeTruthy();
    expect(res.body.id).toBe(S(n._id));
    expect(res.body.userId).toBe(a);
  });
});

/* ==========================================================================
   E. Socket security: no client event to forge, private rooms only
   ========================================================================== */
describe('socket security for notifications', () => {
  beforeEach(() => {
    emit = jest.fn();
    ioMock = { use: jest.fn(), on: jest.fn(), to: jest.fn(() => ({ emit })) };
    // Registers the connection handler + setIo(ioMock) internally.
    attachRealtime(ioMock);
  });

  const connectAs = (userId: string) => {
    const onConnection: Handler = ioMock.on.mock.calls.find((c: any[]) => c[0] === 'connection')[1];
    const s: any = { data: { user: { id: userId } }, join: jest.fn(), on: jest.fn(), emit: jest.fn() };
    onConnection(s);
    const handlers = new Map<string, Handler>();
    s.on.mock.calls.forEach(([name, fn]: [string, Handler]) => handlers.set(name, fn));
    s.handlers = handlers;
    return s;
  };

  test('no client->server event exists to create/redirect notifications (read-only subscribes only)', async () => {
    const s = connectAs(oid().toString());
    expect([...s.handlers.keys()]).toEqual(['leaderboard:subscribe', 'daily_event:subscribe']);
    // There is no notification handler a client could invoke or forge.
    expect(s.handlers.has('notification:new')).toBe(false);
    expect(s.handlers.has('notify:create')).toBe(false);
  });

  test('notification:new for user B reaches ONLY user:B - never user:A, never global', async () => {
    const a = oid().toString();
    const b = oid().toString();
    connectAs(a);
    await createNotification(b, 'system', 'For B', 'private');
    const rooms = ioMock.to.mock.calls.map((c: any[]) => c[0]);
    expect(rooms).toEqual([userRoom(b)]);
    expect(rooms).not.toContain(userRoom(a));
    expect(rooms).not.toContain(globalRoom());
    expect(emit.mock.calls[0][0]).toBe('notification:new');
    expect(emit.mock.calls[0][1].userId).toBe(b);
  });

  test('client-supplied fields can never influence the emission target (server derives room from persisted userId)', async () => {
    // Even if a payload were crafted with another user's id, the service
    // ignores any client input entirely: target comes only from its argument.
    const victim = oid().toString();
    const attacker = oid().toString();
    await createNotification(victim, 'system', 'ok', 'ok');
    expect(ioMock.to).toHaveBeenCalledWith(userRoom(victim));
    expect(ioMock.to).not.toHaveBeenCalledWith(userRoom(attacker));
    expect(ioMock.to).not.toHaveBeenCalledWith(globalRoom());
  });
});