# Tung-Tung

Tung-Tung is a gamified habit- and quest-tracking web application: users complete quests, earn XP and
coins, level up, keep streaks alive, fight bosses, buy cosmetics/titles, unlock achievements, team up
with friends for co-op quests and challenges, and compete on a leaderboard.

The reward and progression economy is **server-authoritative** — XP, coins, boss damage and purchase
prices are all computed/validated on the backend, not in the browser.

## Features (Sprint 1–7, complete)

| Sprint | Area |
|---|---|
| 1 | Accounts, JWT auth, protected routes |
| 2 | Quests (daily / weekly / epic), completion, XP + coins, levels, streaks |
| 3 | Bosses with actions, HP, defeat rewards; quick quests |
| 4 | Rewards: shop, inventory, cosmetics, titles, achievements |
| 5 | Social: friends, requests, parties, co-op quests, challenges |
| 6 | Leaderboard, notifications, realtime layer (Socket.IO) + daily events |
| 7 | Analytics summary, next-best-action, smart suggestions, rest mode |

## Architecture

```
frontend (React 19 + TypeScript + Vite 8 + Tailwind v4)   :5173 (dev)
      |  REST  (axios, JWT in Authorization header, /api/*)
      |  Realtime (Socket.IO, JWT in the handshake)
      v
backend (Node.js + Express 4 + TypeScript)               :5000
      |  Mongoose
      v
MongoDB                                                   :27017
```

- **Frontend** — `frontend/` : React + TypeScript, Vite dev server/build, Tailwind CSS v4 via the
  `@tailwindcss/vite` plugin, axios client in `src/lib/api.ts`, Socket.IO client in `src/hooks/useLive.ts`.
- **Backend** — `backend/` : Express REST API under `/api/*`, Mongoose models, JWT middleware, and a
  Socket.IO server that shares the same HTTP server as Express (`src/realtime/socketServer.ts`).
- **MongoDB** — all persistent state (users, quests, bosses, inventory, social graph, analytics events).
- **Socket.IO** — pushes daily-event updates to authenticated clients (`daily_event:updated`).

API route groups (all mounted under `/api` and protected by the JWT middleware, except
`/api/auth/register` and `/api/auth/login`, which are unauthenticated and therefore rate limited —
see [CORS and auth rate limiting](#cors-and-auth-rate-limiting)):

| Mount | Purpose |
|---|---|
| `/api/auth` | register, login, current user (`/me`) |
| `/api/quests` | daily / weekly / epic quests, completion |
| `/api/progression` | XP, level, streak state |
| `/api/bosses` | bosses and boss actions |
| `/api/quick-quests` | short quests |
| `/api/rewards` | shop, inventory, cosmetics, titles, achievements, reward profile |
| `/api/social` | friends, requests, parties, co-op quests, challenges |
| `/api/live` | leaderboard, notifications, daily event |
| `/api/analytics` | summary, next-action, suggestions, rest mode |

## Prerequisites

- **Node.js `^20.19.0 || >=22.12.0`** (required by Vite 8; this repo was verified on Node `v24.11.0` / npm `11.6.1`)
- **npm** (the repo is an npm-workspaces monorepo: `frontend` + `backend`)
- **MongoDB** reachable over a connection string (local install, Docker container, or a hosted URI) —
  see [MongoDB requirement](#mongodb-requirement)

## Installation

```bash
# from the repository root (installs root + frontend + backend workspaces)
npm install
```

`npm run install-all` also exists and does the same thing with explicit per-workspace installs; plain
`npm install` at the root already covers all workspaces.

## Environment variables

Backend variables are read from `backend/.env` (loaded with `dotenv` by `src/server.ts` and
`src/config/db.ts`). Start from the template:

```bash
cp backend/.env.example backend/.env      # then edit the values
```

| Variable | Read by | Required | Default if unset |
|---|---|---|---|
| `MONGODB_URI` | `backend/src/config/db.ts` | yes (for runtime) | `mongodb://localhost:27017/tungtung` |
| `JWT_SECRET` | `backend/src/services/authService.ts` | **yes** | none — the API refuses to start and every sign/verify call fails with a clear configuration error (no hard-coded fallback) |
| `PORT` | `backend/src/server.ts` | no | `5000` |
| `NODE_ENV` | `backend/src/realtime/dailyEvent.ts` | no | Node default (`development`) |
| `CORS_ORIGIN` | `backend/src/realtime/socketServer.ts` (one shared policy, applied by `backend/src/server.ts` and by Socket.IO) | no | `http://localhost:5173,http://localhost:4173` |
| `AUTH_RATE_LIMIT_MAX` | `backend/src/server.ts` | no | `50` (per IP, per window) |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `backend/src/server.ts` | no | `900000` (15 minutes) |

Frontend variable — there is no frontend `.env` in the repo; it is optional:

| Variable | Read by | Required | Default if unset |
|---|---|---|---|
| `VITE_API_URL` | `frontend/src/lib/api.ts` (REST base URL) and `frontend/src/hooks/useLive.ts` (Socket.IO URL) | no | `http://localhost:5000` |

### CORS and auth rate limiting

- **CORS is an explicit allowlist, not `*`.** `CORS_ORIGIN` (comma-separated browser origins) is read
  by a single shared policy — `corsOriginPolicy` in `backend/src/realtime/socketServer.ts` — which is
  applied to both the Express app (`app.use(cors(corsOptions))` in `backend/src/server.ts`) and the
  Socket.IO server (`new Server(httpServer, { cors: corsOptions })`). When `CORS_ORIGIN` is unset only
  the local development origins `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite
  preview) are allowed. Requests without an `Origin` header (curl, server-to-server, the test suite)
  are not browser cross-origin requests and are unaffected. `credentials: true` is retained because
  the axios client in `frontend/src/lib/api.ts` uses `withCredentials: true`.
- **The credential endpoints are rate limited.** `POST /api/auth/login` and `POST /api/auth/register`
  share one in-memory limiter (`express-rate-limit`) and answer `429` with
  `{ "message": "Too many authentication attempts. Please try again later." }` once the limit is
  exceeded. No other route is limited, so authenticated endpoints such as `GET /api/auth/me` keep
  working normally.

## MongoDB requirement

A real MongoDB instance is **required to run the application end-to-end** (API boot, register/login,
quests, progression, realtime). The backend connects on startup and exits with code 1 if the connection
fails. Quick start with a local server:

```bash
mongod --dbpath <your-data-dir>            # or point MONGODB_URI at a Docker/Atlas instance
```

`MONGODB_URI` must include the database name if you do not want the default `tungtung` database.

## Run in development

Both apps at once (from the repository root):

```bash
npm run dev          # concurrently: backend on :5000 + frontend on :5173
```

Backend only:

```bash
npm run dev --workspace backend      # ts-node-dev --respawn --transpile-only src/server.ts
```

Frontend only:

```bash
npm run dev --workspace frontend     # vite dev server
```

Then open `http://localhost:5173`. The frontend calls `http://localhost:5000` by default; set
`VITE_API_URL` in `frontend/.env` to point it somewhere else.

## Build

```bash
npm run build --workspace frontend   # tsc -b && vite build  -> frontend/dist
npm run build --workspace backend    # tsc                   -> backend/dist
```

There is no root-level `build` script; use the workspace flags above.

## Tests and checks

Backend tests (jest + ts-jest, 17 suites):

```bash
npm run test --workspace backend     # or: cd backend && npx jest
```

The backend tests mock the Mongoose models with `jest.spyOn`, so **no MongoDB instance is needed to run
them**.

Type checking:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc -b
```

Frontend linting (oxlint):

```bash
npm run lint --workspace frontend
```

The frontend currently has **no automated test suite** and no `test` script.

## Verification baseline

Last verified in this repository on Node `v24.11.0`:

| Check | Command | Result |
|---|---|---|
| Backend tests | `npm run test --workspace backend` | 247 / 247 tests passed, 17 / 17 suites (230 pre-existing + 17 new hardening tests) |
| Backend types | `cd backend && npx tsc --noEmit` | 0 errors |
| Frontend types | `cd frontend && npx tsc -b` | 0 errors |
| Frontend build | `npm run build --workspace frontend` | Vite 8.3.0, 146 modules transformed |
| Frontend lint | `npm run lint --workspace frontend` | 0 errors, 19 warnings (exit code 0) |
| Backend build | `npm run build --workspace backend` | 0 errors, regenerates `backend/dist` |

## Production start (backend)

```bash
npm run build --workspace backend
npm start --workspace backend        # node dist/server.js
```

Serving the built `frontend/dist` bundle is left to the hosting setup of your choice (there is no bundled
server/deployment config); the `npm run preview --workspace frontend` script is a local preview only.

## Known limitations

- **A real MongoDB instance is required for end-to-end runtime.** Every check in the baseline table was
  performed without a running database (the backend tests mock the models), so a live boot of the API,
  a real register/login round-trip and the Socket.IO handshake have not been exercised in this
  environment.
- **Leaderboard and notifications have backend support but no frontend UI.** The `/api/live` endpoints,
  services and tests exist, but there is no UI component and no axios wrapper for them in `frontend/src`.
- **Rate limiting is per-process and in-memory:** `express-rate-limit` keeps its counters inside the
  Node process, so the auth limits reset on restart and are not shared across instances. A
  multi-instance production deployment would need a shared store (e.g. Redis); that is out of scope
  here.
- **Boss action XP is capped server-side:** an action can award at most `min(100, damage * 4)` XP
  (`BOSS_XP_PER_DAMAGE` / `MAX_BOSS_ACTION_XP` in `backend/src/services/bossService.ts`). A
  client-supplied `xpReward` above that bound is clamped when the boss is created and clamped again
  when the action is completed, so a forged or legacy value can never be paid out in full.
- `npm run build --workspace backend` also emits `backend/dist/tests/**`, because the TypeScript config
  compiles everything under `src/`, and the build does not clean `backend/dist` before emitting.
- The frontend lint run reports warnings (0 errors) that are currently tolerated.

