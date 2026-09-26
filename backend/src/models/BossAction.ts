import mongoose, { Document, Model, Schema } from 'mongoose';
import { IBoss } from './Boss';

export interface IBossAction extends Document {
  boss: mongoose.Types.ObjectId; // reference to Boss
  title: string;
  damage: number; // positive integer
  xpReward?: number; // optional XP to award on completion
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BossActionSchema: Schema<IBossAction> = new mongoose.Schema(
  {
    boss: { type: mongoose.Schema.Types.ObjectId, ref: 'Boss', required: true },
    title: { type: String, required: true },
    damage: { type: Number, required: true, min: 1 },
    xpReward: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const BossAction: Model<IBossAction> = mongoose.model<IBossAction>('BossAction', BossActionSchema);
