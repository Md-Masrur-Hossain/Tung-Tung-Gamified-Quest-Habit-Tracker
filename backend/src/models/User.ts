import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IUserAchievement {
  key: string;
  unlockedAt: Date;
}

export interface IUserStats {
  questsCompleted: number;
  bossesDefeated: number;
}

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  totalXP: number;
  level: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: Date | null;
  inventory: string[];
  achievements: IUserAchievement[];
  unlockedTitles: string[];
  equippedTitle: string;
  equippedAvatar: string;
  equippedFrame: string;
  equippedAura: string;
  equippedCompanion: string;
  /** Sprint 7D: explicit player-owned Rest Mode preference (not a modifier). */
  restMode: boolean;
  stats: IUserStats;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    totalXP: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastCompletionDate: { type: Date, default: null },
    inventory: { type: [String], default: [] },
    achievements: [
      {
        key: { type: String, required: true },
        unlockedAt: { type: Date, default: Date.now },
      },
    ],
    unlockedTitles: { type: [String], default: ['Rookie'] },
    equippedTitle: { type: String, default: 'Rookie' },
    equippedAvatar: { type: String, default: 'avatar_default' },
    equippedFrame: { type: String, default: 'frame_default' },
    equippedAura: { type: String, default: 'none' },
    equippedCompanion: { type: String, default: 'none' },
    // Sprint 7D: player preference only. Default OFF; never inferred from
    // inactivity/streaks/analytics and never a progression modifier.
    restMode: { type: Boolean, default: false },
    stats: {
      questsCompleted: { type: Number, default: 0 },
      bossesDefeated: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
