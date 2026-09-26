import mongoose, { Document, Model, Schema } from 'mongoose';

export type ChallengeGoalType = 'QUEST_COUNT' | 'XP_EARNED' | 'STREAK';
export type ChallengeStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED';

export interface IChallenge extends Document {
  challenger: mongoose.Types.ObjectId;
  challenged: mongoose.Types.ObjectId;
  title: string;
  goalType: ChallengeGoalType;
  target: number;
  challengerProgress: number;
  challengedProgress: number;
  challengerBaseline: number;
  challengedBaseline: number;
  baselinesSet: boolean;
  status: ChallengeStatus;
  winner: mongoose.Types.ObjectId | null;
  xpReward: number;
  coinReward: number;
  rewardGranted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema: Schema<IChallenge> = new mongoose.Schema(
  {
    challenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    challenged: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    goalType: {
      type: String,
      enum: ['QUEST_COUNT', 'XP_EARNED', 'STREAK'],
      required: true,
    },
    target: { type: Number, required: true, min: 1 },
    challengerProgress: { type: Number, default: 0, min: 0 },
    challengedProgress: { type: Number, default: 0, min: 0 },
    challengerBaseline: { type: Number, default: 0, min: 0 },
    challengedBaseline: { type: Number, default: 0, min: 0 },
    baselinesSet: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED'],
      default: 'PENDING',
    },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    xpReward: { type: Number, default: 50 },
    coinReward: { type: Number, default: 25 },
    rewardGranted: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const Challenge: Model<IChallenge> = mongoose.model<IChallenge>('Challenge', ChallengeSchema);
