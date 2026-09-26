/**
 * Sprint 6 realtime foundation: socket auth (same JWT as REST),
 * server-verified rooms (user:{id} + global), identity isolation,
 * and emitter room scoping. Drives the REAL attachRealtime registration
 * code through a mocked Socket.io server (no live network needed).
 */
import './testEnv';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { attachRealtime } from '../realtime/socketServer';
import { setIo, emitToUser, emitGlobal } from '../realtime/emitter';
import { userRoom, globalRoom } from '../realtime/rooms';

dotenv.config();
const SECRET = process.env.JWT_SECRET ?? ''; // provided by tests/testEnv.ts - no production fallback
type Handler = (...args: any[]) => any;

const makeSocket = (token?: string) => {
  const handlers = new Map<string, Handler>();
  const socket: any = {
    data: {},
    handshake: { auth: token !== undefined ? { token } : {} },
    join: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn((ev: string, h: Handler) => handlers.set(ev, h)),
    handlers,
  };
  return socket;
};
const runMw = (mw: any, socket: any) => new Promise<any>((r) => mw(socket, (e?: any) => r(e)));

let ioMock: any;
let connectionHandler: Handler;
let mw: any;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  ioMock = { use: jest.fn(), on: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) };
  attachRealtime(ioMock);
  connectionHandler = ioMock.on.mock.calls.find((c: any[]) => c[0] === 'connection')[1];
  mw = ioMock.use.mock.calls[0][0];
});
afterEach(() => {
  setIo(null);
});

describe('Sprint6 socket auth (same JWT as REST)', () => {
  test('rejects missing, empty and garbage tokens with a generic error', async () => {
    for (const t of [undefined, '', 'not-a-jwt']) {
      const err = await runMw(mw, makeSocket(t as any));
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Authentication error'); // never leaks token details
    }
  });
  test('rejects a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ id: 'x', email: 'x@t' }, 'wrong_secret');
    const err = await runMw(mw, makeSocket(bad));
    expect(err?.message).toBe('Authentication error');
  });
  test('accepts a valid REST JWT and populates socket.data.user', async () => {
    const token = jwt.sign({ id: 'u123', email: 'u@t' }, SECRET, { expiresIn: '1h' });
    const err = await runMw(mw, makeSocket(token));
    expect(err).toBeUndefined();
  });
});

describe('Sprint6 rooms (server-verified identity)', () => {
  test('connection joins only its own user room + global (server-verified)', () => {
    const s = connectAs('u1');
    expect(s.join).toHaveBeenCalledWith(userRoom('u1'));
    expect(s.join).toHaveBeenCalledWith(globalRoom());
    expect(s.join).toHaveBeenCalledTimes(2); // server-derived rooms only, never client-supplied
    expect(s.join).not.toHaveBeenCalledWith(userRoom('u2')); // identity isolation
  });
  test('socket without authenticated user is force-disconnected', () => {
    const s = makeSocket();
    connectionHandler(s);
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(s.join).not.toHaveBeenCalled();
  });
  test('ONLY read-only subscribe handlers registered; all gameplay events ignored', () => {
    const s = connectAs('u1');
    // Sprint 6A/6C add only read-only subscribe handlers; gameplay events stay ignored.
    expect([...s.handlers.keys()]).toEqual(['leaderboard:subscribe', 'daily_event:subscribe']);
    expect(s.handlers.has('quest:completed')).toBe(false);
    expect(s.handlers.has('player:progression')).toBe(false);
    expect(s.handlers.has('reward:unlocked')).toBe(false);
  });
});

describe('Sprint6 emitter scoping', () => {
  test('emits target ONLY the explicit room (user/global isolation)', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    setIo({ to } as any);
    emitToUser('uA', 'user:event', {});
    expect(to).toHaveBeenCalledWith(userRoom('uA'));
    expect(to).not.toHaveBeenCalledWith(userRoom('uB'));
    expect(to).not.toHaveBeenCalledWith(globalRoom());
    expect(to).toHaveBeenCalledTimes(1); // user emit did NOT touch any other room
    emitGlobal('server:event', {});
    expect(to).toHaveBeenCalledWith(globalRoom());
    expect(emit.mock.calls.map((c: any[]) => c[0])).toEqual(['user:event', 'server:event']);
  });
  test('all emitter helpers no-op safely when no realtime server is attached', () => {
    setIo(null);
    expect(() => {
      emitToUser('u', 'e', {});
      emitGlobal('e', {});
    }).not.toThrow();
  });
});

function connectAs(id: string) {
  const s = makeSocket();
  s.data.user = { id, email: `${id}@t.test` };
  connectionHandler(s);
  return s;
}