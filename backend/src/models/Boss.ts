import mongoose, { Document, Model, Schema } from 'mongoose';
import { Category } from './Quest'; // re-use Category enum

export type BossStatus = 'ACTIVE' | 'DEFEATED';

export interface IBoss extends Document {
  owner: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: Category;
  maxHp: number;
  currentHp: number;
  status: BossStatus;
  actions: mongoose.Types.ObjectId[]; // references to BossAction
  createdAt: Date;
  updatedAt: Date;
}

const BossSchema: Schema<IBoss> = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String },
    category: {
      type: String,
      enum: ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'],
      required: true,
    },
    maxHp: { type: Number, required: true, min: 1 },
    currentHp: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'DEFEATED'], default: 'ACTIVE' },
    actions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BossAction' }],
  },
  { timestamps: true }
);

export const Boss: Model<IBoss> = mongoose.model<IBoss>('Boss', BossSchema);
