import mongoose, { Document, Model, Schema } from 'mongoose';

export type PartyStatus = 'ACTIVE' | 'DISBANDED';

export interface IParty extends Document {
  name: string;
  leader: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: PartyStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema: Schema<IParty> = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['ACTIVE', 'DISBANDED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export const Party: Model<IParty> = mongoose.model<IParty>('Party', PartySchema);
