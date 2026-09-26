import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const JWT_EXPIRES_IN = '7d'; // token validity

/**
 * Sprint 8 Step 4 (security hardening): the JWT secret is configuration-only.
 *
 * There is deliberately NO hard-coded fallback any more. When JWT_SECRET is
 * missing or empty, every signing/verifying call raises a clear configuration
 * error instead of silently using a public default secret that would let
 * anybody forge a token for any account.
 *
 * `server.ts` also calls this during bootstrap, so a misconfigured deployment
 * fails at startup rather than at the first login attempt.
 */
export const JWT_SECRET_ENV_VAR = 'JWT_SECRET';

export const requireJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      `${JWT_SECRET_ENV_VAR} is not configured: set it to a strong random value in backend/.env ` +
        '(see backend/.env.example) before starting or using the API. This application has no default secret.'
    );
  }
  return secret;
};

export const register = async (username: string, email: string, password: string): Promise<IUser> => {
  // check for existing email
  const existing = await User.findOne({ email });
  if (existing) {
    throw { status: 409, message: 'Email already registered' };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({ username, email, passwordHash });
  await user.save();
  return user;
};

export const login = async (email: string, password: string): Promise<{ token: string; user: IUser }> => {
  const user = await User.findOne({ email });
  if (!user) {
    throw { status: 401, message: 'Invalid credentials' };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw { status: 401, message: 'Invalid credentials' };
  }
  const token = jwt.sign({ id: user._id, email: user.email }, requireJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
  return { token, user };
};

export const verifyToken = (token: string): { id: string; email: string } => {
  // Resolved (and therefore validated) before the try/catch below: a missing
  // JWT_SECRET is a configuration error and must never be reported as a 401.
  const secret = requireJwtSecret();
  try {
    return jwt.verify(token, secret) as { id: string; email: string };
  } catch (err) {
    throw { status: 401, message: 'Invalid token' };
  }
};
