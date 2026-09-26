import express from 'express';
import socialRoutes from './routes/socialRoutes';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import questRoutes from './routes/questRoutes';
import progressionRoutes from './routes/progressionRoutes';
import bossRoutes from './routes/bossRoutes';
import quickQuestRoutes from './routes/quickQuestRoutes';
import rewardRoutes from './routes/rewardRoutes';
import liveRoutes from './routes/liveRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import { errorHandler } from './middleware/errorHandler';
import { createRealtimeServer, corsOptions } from './realtime/socketServer';
import { requireJwtSecret } from './services/authService';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 5000;

/* ------------------------------------------------------------------
   Rate limiting for the credential endpoints (Sprint 8 Step 4)
   ------------------------------------------------------------------
   Only the two unauthenticated endpoints that accept credentials are
   limited: POST /api/auth/login and POST /api/auth/register. The rest of
   the API - including the authenticated GET /api/auth/me - is untouched.
   Defaults are demo/development friendly and can be tuned with the
   AUTH_RATE_LIMIT_* environment variables. */
const positiveIntFromEnv = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const AUTH_RATE_LIMIT_MAX = positiveIntFromEnv('AUTH_RATE_LIMIT_MAX', 50);
export const AUTH_RATE_LIMIT_WINDOW_MS = positiveIntFromEnv(
  'AUTH_RATE_LIMIT_WINDOW_MS',
  15 * 60 * 1000
);

export const authRateLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ message: 'Too many authentication attempts. Please try again later.' });
  },
});

// CORS: an explicit allowlist instead of the previous wide-open policy.
// The same shared policy is applied to Socket.IO in realtime/socketServer.ts.
app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (req, res) => res.send('Tung-Tung API'));

app.post('/api/auth/login', authRateLimiter);
app.post('/api/auth/register', authRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/bosses', bossRoutes);
app.use('/api/quick-quests', quickQuestRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/analytics', analyticsRoutes);
// Global error handler
app.use(errorHandler);

if (require.main === module) {
  // Fail fast: the API never starts with an unconfigured JWT secret.
  requireJwtSecret();
  connectDB().then(() => {
    // HTTP + Socket.io share one server (Sprint 6 realtime foundation)
    const { httpServer } = createRealtimeServer(app);
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}
