/**
 * Singleton Socket.io emitter (Sprint 6).
 * Services call these 1-line helpers so they never need to import the
 * Server instance directly (avoids circular imports).
 * All helpers are safe no-ops when no realtime server is attached
 * (unit tests, scripts).
 */
import type { Server } from 'socket.io';
import { userRoom, globalRoom } from './rooms';

let ioRef: Server | null = null;

export const setIo = (io: Server | null): void => {
  ioRef = io;
};

export const getIo = (): Server | null => ioRef;

export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  if (!ioRef || !userId) return;
  ioRef.to(userRoom(userId)).emit(event, payload);
};

export const emitGlobal = (event: string, payload: unknown): void => {
  if (!ioRef) return;
  ioRef.to(globalRoom()).emit(event, payload);
};
