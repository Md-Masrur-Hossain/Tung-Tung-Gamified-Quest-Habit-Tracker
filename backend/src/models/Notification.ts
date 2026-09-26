import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * Sprint 6B — Persisted user notifications.
 *
 * Deliberately simple: no TTL indexes, no expiry, no background cleanup.
 * Notifications persist until the owner marks them read (and beyond).
 */
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema<INotification> = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Plain query index for per-user listing. NOT a TTL index - no expiry is ever applied.
NotificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  NotificationSchema,
);