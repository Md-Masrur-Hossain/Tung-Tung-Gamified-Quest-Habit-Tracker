/**
 * Sprint 8 Step 4 — production security hardening.
 *
 * Covers the three hardening changes made on top of the frozen Sprint 1-7
 * baseline:
 *   1. JWT_SECRET is configuration-only: there is no hard-coded fallback, and
 *      a missing secret is a clear configuration error (never a 401).
 *   2. CORS is an explicit allowlist shared by REST and Socket.IO instead of
 *      "any origin".
 *   3. The credential endpoints (login / register) are rate limited while the
 *      rest of the API is not.
 *
 * No database and no external network: `../server` only builds the Express app
 * on import (MongoDB is connected solely when the module runs as the main
 * module) and supertest drives it in-process. The Socket.IO check starts a real
 * HTTP server on an ephemeral port and closes it again.
 */
import './testEnv';
import http from 'http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app, AUTH_RATE_LIMIT_MAX } from '../server';
import { JWT_SECRET_ENV_VAR, requireJwtSecret, verifyToken } from '../services/authService';
import {
  CORS_ORIGIN_ENV_VAR,
  DEFAULT_DEV_CORS_ORIGINS,
  allowedCorsOrigins,
  corsOptions,
  corsOriginPolicy,
  createRealtimeServer,
  parseCorsOrigins,
} from '../realtime/socketServer';
import { TEST_JWT_SECRET } from './testEnv';

const DEV_ORIGIN = 'http://localhost:5173';

const restoreEnv = (name: string, previous: string | undefined, fallback?: string) => {
  if (previous === undefined) {
    if (fallback === undefined) delete process.env[name];
    else process.env[name] = fallback;
  } else {
    process.env[name] = previous;
  }
};

const pollSocketHandshake = (port: number, origin: string): Promise<http.IncomingHttpHeaders> =>
  new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/socket.io/?EIO=4&transport=polling',
        headers: { Origin: origin },
      },
      (res) => {
        res.resume();
        resolve(res.headers);
      }
    );
    req.on('error', reject);
  });

describe('Sprint 8 Step 4 - security hardening', () => {
  describe('JWT secret authority (no hard-coded fallback)', () => {
    test('1. a missing JWT_SECRET is a clear configuration error, never a silent default', () => {
      const previous = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        expect(JWT_SECRET_ENV_VAR).toBe('JWT_SECRET');
        expect(() => requireJwtSecret()).toThrow(/JWT_SECRET is not configured/);

        // Verification surfaces the configuration error - it is NOT reported as a 401.
        let caught: any = null;
        try {
          verifyToken(jwt.sign({ id: 'u1', email: 'u1@t.test' }, TEST_JWT_SECRET));
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(caught.status).toBeUndefined();
        expect(String(caught.message)).toMatch(/JWT_SECRET is not configured/);
      } finally {
        restoreEnv('JWT_SECRET', previous, TEST_JWT_SECRET);
      }
    });

    test('2. an empty / whitespace JWT_SECRET is treated as missing', () => {
      const previous = process.env.JWT_SECRET;
      try {
        process.env.JWT_SECRET = '   ';
        expect(() => requireJwtSecret()).toThrow(/JWT_SECRET is not configured/);
      } finally {
        restoreEnv('JWT_SECRET', previous, TEST_JWT_SECRET);
      }
    });

    test('3. tokens signed with the old hard-coded default secret are rejected', () => {
      const forged = jwt.sign({ id: 'attacker', email: 'attacker@evil.test' }, 'default_secret');

      let caught: any = null;
      try {
        verifyToken(forged);
      } catch (err) {
        caught = err;
      }
      expect(caught).toEqual({ status: 401, message: 'Invalid token' });
    });

    test('4. a token signed with the configured secret still verifies (auth behaviour preserved)', () => {
      const token = jwt.sign({ id: 'user-1', email: 'user-1@t.test' }, requireJwtSecret(), {
        expiresIn: '1h',
      });
      expect(verifyToken(token)).toMatchObject({ id: 'user-1', email: 'user-1@t.test' });
    });
  });

  describe('CORS allowlist (shared by REST and Socket.IO)', () => {
    test('5. requests without an Origin header are unaffected', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('6. the existing frontend dev origin is allowed, with credentials', async () => {
      const res = await request(app).get('/').set('Origin', DEV_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(DEV_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    test('7. an unknown origin gets no CORS headers (CORS is no longer wide open)', async () => {
      for (const origin of ['https://evil.example', 'http://localhost:3000']) {
        const res = await request(app).get('/').set('Origin', origin);

        // The API still answers the raw request ...
        expect(res.status).toBe(200);
        // ... but a browser is never told it may read the response.
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    test('8. CORS_ORIGIN extends the allowlist and is read per request', async () => {
      const previous = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = 'https://app.example.test, https://second.example.test';
      try {
        expect(allowedCorsOrigins()).toEqual([
          'https://app.example.test',
          'https://second.example.test',
        ]);

        const allowed = await request(app).get('/').set('Origin', 'https://second.example.test');
        expect(allowed.headers['access-control-allow-origin']).toBe('https://second.example.test');

        const blocked = await request(app).get('/').set('Origin', DEV_ORIGIN);
        expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        restoreEnv('CORS_ORIGIN', previous);
      }
    });

    test('9. an unset CORS_ORIGIN keeps only the local development origins', () => {
      const previous = process.env.CORS_ORIGIN;
      delete process.env.CORS_ORIGIN;
      try {
        expect(CORS_ORIGIN_ENV_VAR).toBe('CORS_ORIGIN');
        expect(allowedCorsOrigins()).toEqual([...DEFAULT_DEV_CORS_ORIGINS]);
        expect(DEFAULT_DEV_CORS_ORIGINS).toContain(DEV_ORIGIN);
      } finally {
        restoreEnv('CORS_ORIGIN', previous);
      }
    });

    test('10. comma-separated parsing ignores blanks and whitespace', () => {
      expect(parseCorsOrigins(undefined)).toEqual([]);
      expect(parseCorsOrigins('   ')).toEqual([]);
      expect(parseCorsOrigins('a,, b ,')).toEqual(['a', 'b']);
    });

    test('11. the Socket.IO engine applies the same allowlist, not origin: true', async () => {
      expect(corsOptions.origin).toBe(corsOriginPolicy);
      expect(corsOptions.credentials).toBe(true);

      const realtime = createRealtimeServer(app);
      await new Promise<void>((resolve) => realtime.httpServer.listen(0, () => resolve()));
      const address = realtime.httpServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      try {
        const allowed = await pollSocketHandshake(port, DEV_ORIGIN);
        expect(allowed['access-control-allow-origin']).toBe(DEV_ORIGIN);

        const blocked = await pollSocketHandshake(port, 'https://evil.example');
        expect(blocked['access-control-allow-origin']).toBeUndefined();
      } finally {
        await realtime.stop();
        if (realtime.httpServer.listening) {
          await new Promise<void>((resolve) => realtime.httpServer.close(() => resolve()));
        }
      }
    });
  });

  describe('credential endpoint rate limiting', () => {
    test('12. login and register share one limiter and 429 once it is exhausted', async () => {
      expect(AUTH_RATE_LIMIT_MAX).toBe(3); // deterministic value from tests/testEnv.ts

      for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX; attempt += 1) {
        const res = await request(app).post('/api/auth/login').send({});
        expect(res.status).toBe(400); // express-validator rejects the empty payload
      }

      // The same limiter protects /register, so the shared budget is exhausted.
      const blocked = await request(app).post('/api/auth/register').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/Too many authentication attempts/);
      expect(blocked.headers['ratelimit']).toBeDefined();
    });

    test('13. the rest of the API, including authenticated auth routes, is not rate limited', async () => {
      const root = await request(app).get('/');
      expect(root.status).toBe(200);

      for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX + 2; attempt += 1) {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Authorization header missing');
      }

      // ... while the credential limiter is still armed from the previous test.
      const blocked = await request(app).post('/api/auth/login').send({});
      expect(blocked.status).toBe(429);
    });
  });
});
