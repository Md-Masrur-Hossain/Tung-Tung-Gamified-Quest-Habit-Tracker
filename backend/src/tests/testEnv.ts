/**
 * Test-only environment defaults (Sprint 8 Step 4).
 *
 * Imported as the FIRST import by the test files that sign or verify JWTs
 * (`import './testEnv';`). It contains no production logic and is never
 * imported by application code.
 *
 * Why this exists: the production auth code no longer falls back to a
 * hard-coded secret, so the test suite must supply an explicit secret of its
 * own instead of depending on a `backend/.env` that a fresh clone does not
 * have. Existing values are never overwritten, so a developer can still run
 * the suite against a secret they export themselves.
 */

export const TEST_JWT_SECRET = 'tung-tung-test-secret';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
}

/**
 * Deterministic rate-limit settings for `securityHardening.test.ts`. They are
 * read by `server.ts` when the Express app is imported, which is why they are
 * set here (before any import of the app) rather than inside a test.
 */
if (!process.env.AUTH_RATE_LIMIT_MAX) {
  process.env.AUTH_RATE_LIMIT_MAX = '3';
}
if (!process.env.AUTH_RATE_LIMIT_WINDOW_MS) {
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
}
