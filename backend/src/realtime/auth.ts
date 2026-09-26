/**
 * Socket.io handshake authentication (Sprint 6).
 * Reuses the exact same JWT verification as REST (authService.verifyToken);
 * there is NO second authentication system. Tokens arrive via
 * `socket.handshake.auth.token`. Failures emit a generic
 * "Authentication error" with no token details leaked to logs or clients.
 */
import type { Socket } from 'socket.io';
import { verifyToken } from '../services/authService';

export interface SocketUserData {
  id: string;
  email: string;
}

export const socketAuth = (socket: Socket, next: (err?: Error) => void): void => {
  const token = socket.handshake?.auth?.token;
  if (typeof token !== 'string' || token.length === 0) {
    return next(new Error('Authentication error'));
  }
  try {
    const payload = verifyToken(token);
    if (!payload || !payload.id) {
      return next(new Error('Authentication error'));
    }
    socket.data.user = { id: payload.id, email: payload.email } as SocketUserData;
    next();
  } catch {
    next(new Error('Authentication error'));
  }
};
