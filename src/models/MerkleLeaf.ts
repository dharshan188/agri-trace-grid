import mongoose, { Schema, Document } from 'mongoose';

export interface IMerkleLeaf extends Document {
  index: number;
  hash: string;
  data: any;
  batch_id?: string;
  event_id?: string;
  type: 'batch' | 'event' | 'anchor';
  root_hash: string;
  proof: string[];
  createdAt: Date;
  updatedAt: Date;
}

const MerkleLeafSchema: Schema = new Schema({
  index: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  hash: {
    type: String,
    required: true,
    index: true
  },
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  batch_id: {
    type: String,
    ref: 'Batch'
  },
  event_id: {
    type: String,
    ref: 'Event'
  },
  type: {
    type: String,
    enum: ['batch', 'event', 'anchor'],
    required: true,
    index: true
  },
  root_hash: {
    type: String,
    required: true,
    index: true
  },
  proof: [{
    type: String
  }],
}, {
  timestamps: true
});

// Compound indexes
MerkleLeafSchema.index({ batch_id: 1, type: 1 });
MerkleLeafSchema.index({ root_hash: 1, index: 1 });

export default mongoose.model<IMerkleLeaf>('MerkleLeaf', MerkleLeafSchema);