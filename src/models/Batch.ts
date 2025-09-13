import mongoose, { Schema, Document } from 'mongoose';
import { Location, BatchMetadata, QRPayload } from '@/types';

export interface IBatch extends Document {
  batch_id: string;
  farmer_id: string;
  crop: string;
  location: Location;
  photo_hash?: string;
  metadata: BatchMetadata;
  qr_data: QRPayload;
  qr_png?: string;
  timeline: Array<{
    event_id: string;
    timestamp: Date;
    type: string;
    data: any;
    hash: string;
  }>;
  merkle_leaf: string;
  ipfs_hash: string;
  blockchain_tx?: string;
  status: 'created' | 'in_transit' | 'processed' | 'delivered' | 'expired';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema: Schema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  address: { type: String }
}, { _id: false });

const BatchMetadataSchema: Schema = new Schema({
  crop: { type: String, required: true },
  variety: { type: String },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  harvestDate: { type: Date, required: true },
  estimatedShelfLife: { type: Number },
  certifications: [{ type: String }],
  growingMethods: [{ type: String }]
}, { _id: false });

const QRPayloadSchema: Schema = new Schema({
  batch_id: { type: String, required: true },
  farmer_id: { type: String, required: true },
  timestamp: { type: String, required: true },
  ipfs_hash: { type: String, required: true },
  merkle_leaf: { type: String, required: true },
  farmer_pubkey: { type: String, required: true },
  signature: { type: String, required: true }
}, { _id: false });

const TimelineEventSchema: Schema = new Schema({
  event_id: { type: String, required: true },
  timestamp: { type: Date, required: true },
  type: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  hash: { type: String, required: true }
}, { _id: false });

const BatchSchema: Schema = new Schema({
  batch_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  farmer_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  crop: {
    type: String,
    required: true,
    index: true
  },
  location: {
    type: LocationSchema,
    required: true
  },
  photo_hash: {
    type: String
  },
  metadata: {
    type: BatchMetadataSchema,
    required: true
  },
  qr_data: {
    type: QRPayloadSchema,
    required: true
  },
  qr_png: {
    type: String
  },
  timeline: [TimelineEventSchema],
  merkle_leaf: {
    type: String,
    required: true,
    index: true
  },
  ipfs_hash: {
    type: String,
    required: true
  },
  blockchain_tx: {
    type: String
  },
  status: {
    type: String,
    enum: ['created', 'in_transit', 'processed', 'delivered', 'expired'],
    default: 'created'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
BatchSchema.index({ farmer_id: 1 });
BatchSchema.index({ crop: 1 });
BatchSchema.index({ 'location.lat': 1, 'location.lng': 1 });
BatchSchema.index({ status: 1 });
BatchSchema.index({ createdAt: -1 });

export default mongoose.model<IBatch>('Batch', BatchSchema);