import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export enum UserRole {
  FARMER = 'farmer',
  AGGREGATOR = 'aggregator',
  CONSUMER = 'consumer',
  ADMIN = 'admin'
}

export interface Location {
  lat: number;
  lng: number;
  address?: string;
}

export interface WeatherSnapshot {
  temp: number;
  humidity: number;
  source: string;
  timestamp: Date;
  conditions?: string;
  windSpeed?: number;
}

export interface BatchMetadata {
  crop: string;
  variety?: string;
  quantity: number;
  unit: string;
  harvestDate: Date;
  estimatedShelfLife?: number;
  certifications?: string[];
  growingMethods?: string[];
}

export interface QRPayload {
  batch_id: string;
  farmer_id: string;
  timestamp: string;
  ipfs_hash: string;
  merkle_leaf: string;
  farmer_pubkey: string;
  signature: string;
}

export interface EventData {
  type: string;
  weather_snapshot?: WeatherSnapshot;
  location: Location;
  notes?: string;
  inspector_id?: string;
  grade?: string;
  defects?: string;
  quality_score?: number;
}

export interface MerkleProof {
  leaf: string;
  proof: string[];
  leafIndex: number;
  root: string;
}

export interface VerificationResult {
  verified: boolean;
  mode: 'blockchain' | 'merkle' | 'both';
  reason: string;
  timeline?: any[];
  merkle_proof?: MerkleProof;
  blockchain_tx?: string;
}

export interface AnomalyFlag {
  batch_id: string;
  type: 'price_jump' | 'geo_mismatch' | 'weather_anomaly' | 'timeline_gap';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detected_at: Date;
  metadata?: any;
}

export interface AIGradingResult {
  grade: string;
  defects: string;
  confidence: number;
  overlays: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  }>;
}

export interface StorageAdapter {
  store(data: any, metadata?: any): Promise<string>;
  retrieve(hash: string): Promise<any>;
  getPublicUrl(hash: string): string;
}