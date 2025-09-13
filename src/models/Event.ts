import mongoose, { Schema, Document } from 'mongoose';
import { Location, WeatherSnapshot } from '@/types';

export interface IEvent extends Document {
  event_id: string;
  batch_id: string;
  type: string;
  timestamp: Date;
  location: Location;
  weather_snapshot?: WeatherSnapshot;
  inspector_id?: string;
  notes?: string;
  grade?: string;
  defects?: string;
  quality_score?: number;
  photos?: string[];
  metadata: any;
  hash: string;
  merkle_leaf?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WeatherSnapshotSchema: Schema = new Schema({
  temp: { type: Number, required: true },
  humidity: { type: Number, required: true },
  source: { type: String, required: true },
  timestamp: { type: Date, required: true },
  conditions: { type: String },
  windSpeed: { type: Number }
}, { _id: false });

const LocationSchema: Schema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  address: { type: String }
}, { _id: false });

const EventSchema: Schema = new Schema({
  event_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  batch_id: {
    type: String,
    required: true,
    ref: 'Batch',
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['harvest', 'inspection', 'transport', 'processing', 'packaging', 'delivery', 'quality_check', 'storage'],
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  location: {
    type: LocationSchema,
    required: true
  },
  weather_snapshot: {
    type: WeatherSnapshotSchema
  },
  inspector_id: {
    type: String,
    ref: 'User'
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  grade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'F']
  },
  defects: {
    type: String
  },
  quality_score: {
    type: Number,
    min: 0,
    max: 100
  },
  photos: [{
    type: String
  }],
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  hash: {
    type: String,
    required: true,
    index: true
  },
  merkle_leaf: {
    type: String
  }
}, {
  timestamps: true
});

// Compound indexes
EventSchema.index({ batch_id: 1, timestamp: 1 });
EventSchema.index({ type: 1, timestamp: -1 });

export default mongoose.model<IEvent>('Event', EventSchema);