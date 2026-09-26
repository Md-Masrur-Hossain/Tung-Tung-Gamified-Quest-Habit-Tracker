import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ICoopContribution {
  userId: mongoose.Types.ObjectId;
  completedAt: Date;
}

export type CoopQuestStatus = 'pending' | 'completed';

export interface ICoopQuest extends Document {
  party: mongoose.Types.ObjectId;
  creator: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  category: string;
  targetCount: number;
  contributions: ICoopContribution[];
  xpReward: number;
  coinReward: number;
  status: CoopQuestStatus;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CoopContributionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CoopQuestSchema: Schema<ICoopQuest> = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: {
      type: String,
      enum: ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'],
      required: true,
    },
    targetCount: { type: Number, required: true, min: 1 },
    contributions: [CoopContributionSchema],
    xpReward: { type: Number, required: true, min: 1 },
    coinReward: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const CoopQuest: Model<ICoopQuest> = mongoose.model<ICoopQuest>('CoopQuest', CoopQuestSchema);
