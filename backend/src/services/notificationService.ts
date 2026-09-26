/**
 * Sprint 6B — Notification service (persisted, server-authoritative).
 *
 * - createNotification: persists FIRST, then emits `notification:new`
 *   privately to `user:{userId}` (never `global`) via the realtime emitter.
 * - listNotifications / markNotificationRead: every query is strictly scoped
 *   to the authenticated userId - a client can never read or mutate another
 *   user's notifications, and there is no client-facing "create for arbitrary
 *   user" path at all.
 * No Redis, queues, cron, TTL, or expiry - plain Mongo persistence + the
 * Sprint 6 realtime foundation.
 */
import { Types } from 'mongoose';
import { Notification, INotification } from '../models/Notification';
import { emitToUser } from '../realtime/emitter';

export interface NotificationPayload {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Public projection of a notification (only its own fields, no extras). */
const toPayload = (doc: any): NotificationPayload => ({
  id: String(doc._id),
  userId: String(doc.userId),
  type: doc.type,
  title: doc.title,
  message: doc.message,
  read: !!doc.read,
  readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
  createdAt: new Date(doc.createdAt).toISOString(),
});

/**
 * Create and persist a notification for a specific user, then deliver it
 * privately to that user's room - emission happens ONLY after persistence
 * succeeds; a failed save emits nothing.
 */
export const createNotification = async (
  userId: string,
  type: string,
  title: string,
  message = '',
): Promise<INotification> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw { status: 400, message: 'Invalid user id' };
  }
  const created = await Notification.create({
    userId,
    type,
    title,
    message,
    read: false,
    readAt: null,
  });
  // Private, server-derived room only - never emitGlobal.
  emitToUser(String(userId), 'notification:new', toPayload(created));
  return created;
};

/** List the authenticated user's notifications, newest first. */
export const listNotifications = async (userId: string): Promise<NotificationPayload[]> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw { status: 400, message: 'Invalid user id' };
  }
  const rows = await Notification.find({ userId }).sort({ createdAt: -1 });
  return rows.map(toPayload);
};

/**
 * Mark one of the authenticated user's notifications as read.
 * Query is scoped by BOTH _id and userId: another user's notification id
 * behaves exactly like a missing one (404). Idempotent once read.
 */
export const markNotificationRead = async (
  userId: string,
  notificationId: string,
): Promise<NotificationPayload> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw { status: 400, message: 'Invalid user id' };
  }
  if (!Types.ObjectId.isValid(notificationId)) {
    throw { status: 400, message: 'Invalid notification id' };
  }
  const doc = await Notification.findOne({ _id: notificationId, userId });
  if (!doc) {
    throw { status: 404, message: 'Notification not found' };
  }
  if (!doc.read) {
    doc.read = true;
    doc.readAt = new Date();
    await doc.save();
  }
  return toPayload(doc);
};