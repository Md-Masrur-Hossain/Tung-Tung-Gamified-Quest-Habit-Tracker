import mongoose, { Document, Model, Schema } from 'mongoose';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface IFriendship extends Document {
  requester: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const FriendshipSchema: Schema<IFriendship> = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true }
);

// Compound index to quickly find friendship relationships
FriendshipSchema.index({ requester: 1, recipient: 1 });

export const Friendship: Model<IFriendship> = mongoose.model<IFriendship>('Friendship', FriendshipSchema);
