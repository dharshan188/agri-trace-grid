import mongoose, { Schema, Document } from 'mongoose';
import { AnomalyFlag } from '@/types';

export interface IAnomaly extends Document, AnomalyFlag {
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: Date;
  resolution_notes?: string;
}

const AnomalySchema: Schema = new Schema({
  batch_id: {
    type: String,
    required: true,
    ref: 'Batch',
    index: true
  },
  type: {
    type: String,
    enum: ['price_jump', 'geo_mismatch', 'weather_anomaly', 'timeline_gap'],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  detected_at: {
    type: Date,
    required: true,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolved_by: {
    type: String,
    ref: 'User'
  },
  resolved_at: {
    type: Date
  },
  resolution_notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Compound indexes
AnomalySchema.index({ batch_id: 1, resolved: 1 });
AnomalySchema.index({ type: 1, severity: 1 });
AnomalySchema.index({ detected_at: -1 });

export default mongoose.model<IAnomaly>('Anomaly', AnomalySchema);