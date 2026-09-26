/**
 * Socket.io room naming helpers (Sprint 6 realtime foundation).
 * Rooms are used to scope private server->client events:
 *  - user:{id}  : only events explicitly emitted to that user
 *  - global     : safe, public events
 * No namespaces are used. Rooms are always joined server-side;
 * clients can never choose or supply a room.
 */
export const GLOBAL_ROOM = 'global';

export const userRoom = (userId: string | number): string => `user:${String(userId)}`;

export const globalRoom = (): string => GLOBAL_ROOM;