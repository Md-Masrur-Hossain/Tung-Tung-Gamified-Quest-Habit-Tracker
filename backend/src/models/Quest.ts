import mongoose, { Document, Model, Schema } from 'mongoose';

export type QuestStatus = 'pending' | 'completed';
export type QuestType = 'daily' | 'weekly' | 'epic' | 'boss' | 'quick';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'epic';
export type Category =
  | 'Health'
  | 'Work'
  | 'Study'
  | 'Fitness'
  | 'Home'
  | 'Hobby'
  | 'Personal'
  | 'Other';

export interface IQuest extends Document {
  owner: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  type: QuestType;
  category: Category;
  difficulty: Difficulty;
  xpReward: number;
  status: QuestStatus;
  deadline?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuestSchema: Schema<IQuest> = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['daily', 'weekly', 'epic', 'boss', 'quick'], required: true },
    category: {
      type: String,
      enum: ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'],
      required: true,
    },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', 'epic'], required: true },
    xpReward: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    deadline: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const Quest: Model<IQuest> = mongoose.model<IQuest>('Quest', QuestSchema);
