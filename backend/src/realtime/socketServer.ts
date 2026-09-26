/**
 * Socket.io server bootstrap (Sprint 6 realtime foundation).
 *
 * - Authenticated handshake only (socketAuth reusing REST JWT verification).
 * - Rooms joined server-side only: user:{id} and global - never client-supplied.
 * - Exactly two read-only client->server events (Sprint 6A leaderboard:
 *   subscribe, Sprint 6C daily_event:subscribe): snapshot requests whose
 *   content is always server-derived; client payloads are ignored.
 *   Every other event (fake progression/quest/reward...) has no handler and
 *   is ignored - the server never trusts client payloads.
 */
import { createServer, Server as HttpServer } from 'http';
import type { Express } from 'express';
import { Server, Socket } from 'socket.io';
import { socketAuth, SocketUserData } from './auth';
import { setIo } from './emitter';
import { userRoom, globalRoom } from './rooms';
import { getLeaderboard, LeaderboardScope } from '../services/leaderboardService';
import {
  checkDailyEventRollover,
  getDailyEvent,
  DAILY_EVENT_SUBSCRIBE,
  DAILY_EVENT_UPDATED,
} from './dailyEvent';

export interface RealtimeServer {
  httpServer: HttpServer;
  io: Server;
  stop: () => Promise<void>;
}

/* ------------------------------------------------------------------
   CORS allowlist (Sprint 8 Step 4)

   Shared by the REST API (server.ts) and the Socket.IO server below, so
   both use exactly the same policy.

   - CORS_ORIGIN holds a comma-separated list of allowed browser origins.
   - When it is unset the local development origins are allowed (Vite dev
     server + Vite preview), which keeps local development working.
   - Requests without an Origin header (curl, server-to-server calls, the
     test suite) are not browser cross-origin requests and are let through;
     browsers only ever receive an Access-Control-Allow-Origin header for an
     allowlisted origin.
   ------------------------------------------------------------------ */
export const CORS_ORIGIN_ENV_VAR = 'CORS_ORIGIN';

export const DEFAULT_DEV_CORS_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:4173',
];

/** Split a comma-separated CORS_ORIGIN value into individual origins. */
export const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/** The allowlist actually used at runtime: CORS_ORIGIN, else the dev default. */
export const allowedCorsOrigins = (): string[] => {
  const configured = parseCorsOrigins(process.env.CORS_ORIGIN);
  return configured.length > 0 ? configured : [...DEFAULT_DEV_CORS_ORIGINS];
};

/**
 * Origin policy shared by Express (`cors`) and Socket.IO. `allow === false`
 * makes the library omit the CORS headers, so the browser blocks the request.
 */
export const corsOriginPolicy = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  if (!origin) {
    // No Origin header: not a browser cross-origin request (curl, tests, SSR).
    callback(null, true);
    return;
  }
  callback(null, allowedCorsOrigins().includes(origin));
};

/**
 * The exact CORS options used for both REST and Socket.IO. `credentials: true`
 * matches the existing clients: the axios client (`frontend/src/lib/api.ts`)
 * sends `withCredentials: true` and Socket.IO keeps its previous behaviour.
 * With credentials enabled the allowed origin is echoed back explicitly, which
 * is exactly why an allowlist (and never `*`) is required.
 */
export const corsOptions = { origin: corsOriginPolicy, credentials: true };

/* ------------------------------------------------------------------
   Per-connection registration (server-derived identity + rooms)
   ------------------------------------------------------------------ */
const registerConnection = (socket: Socket): void => {
  const userData = socket.data.user as SocketUserData | undefined;
  if (!userData || !userData.id) {
    socket.disconnect(true);
    return;
  }
  const userId = userData.id;

  // Rooms (server-derived only): user:{id} + global. Never client-supplied.
  socket.join(userRoom(userId));
  socket.join(globalRoom());

  // Sprint 6A: read-only leaderboard snapshot request. Identity always
  // comes from the authenticated handshake; any userId/rank/XP/level
  // fields in the payload are ignored.
  socket.on('leaderboard:subscribe', async (payload?: unknown, ack?: (res: unknown) => void) => {
    try {
      const requestedScope =
        payload && typeof payload === 'object' ? (payload as { scope?: unknown }).scope : undefined;
      if (
        requestedScope !== undefined &&
        requestedScope !== 'global' &&
        requestedScope !== 'friends'
      ) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid leaderboard scope' });
        return;
      }
      const scope: LeaderboardScope = (requestedScope as LeaderboardScope) ?? 'global';
      const snapshot = await getLeaderboard(scope, userId);
      // Initial snapshot goes only back to this socket; later refreshes
      // (global scope) arrive via the existing `global` room broadcast.
      socket.emit('leaderboard:updated', snapshot);
      if (typeof ack === 'function') ack({ ok: true, scope });
    } catch {
      if (typeof ack === 'function') ack({ ok: false, error: 'Failed to load leaderboard' });
    }
  });

  // Sprint 6C: daily event snapshot - also nudges the lazy day-rollover
  // check so connected clients receive `daily_event:updated` on date
  // changes. The event is derived purely from the server's calendar date;
  // any payload fields (type/date/xpMultiplier...) are ignored entirely.
  // Accepts ('daily_event:subscribe', ack) or ('daily_event:subscribe', cb).
  socket.on(DAILY_EVENT_SUBSCRIBE, (payload?: unknown, ack?: unknown) => {
    const respond =
      typeof payload === 'function' ? payload : typeof ack === 'function' ? ack : null;
    try {
      checkDailyEventRollover();
      const event = getDailyEvent();
      // Initial snapshot goes only back to this socket; later rollover
      // refreshes arrive via the existing `global` room broadcast.
      socket.emit(DAILY_EVENT_UPDATED, event);
      if (respond) respond({ ok: true, type: event.type });
    } catch {
      if (respond) respond({ ok: false, error: 'Failed to load daily event' });
    }
  });
};

/* ------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------ */
/** Attach realtime behaviour to an existing Socket.io server (used by tests). */
export const attachRealtime = (io: Server): void => {
  setIo(io);
  io.use(socketAuth);
  io.on('connection', registerConnection);
};

/** Create the production HTTP + Socket.io server around the Express app. */
export const createRealtimeServer = (app: Express): RealtimeServer => {
  const httpServer: HttpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: corsOptions,
  });
  attachRealtime(io);
  return {
    httpServer,
    io,
    stop: async () => {
      setIo(null);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
};