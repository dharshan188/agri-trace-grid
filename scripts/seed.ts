import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User';
import Batch from '../src/models/Batch';
import { UserRole } from '../src/types';
import { generateKeyPair, signData, createBatchHash } from '../src/utils/crypto';
import { QRGeneratorService } from '../src/services/qrGenerator';
import { getStorageAdapter } from '../src/services/storage';
import { MerkleTreeService } from '../src/services/merkleTree';

dotenv.config();

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/farm-to-fork');
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Batch.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    const users = [
      {
        name: 'Alice Farmer',
        email: 'alice@farm.com',
        password: 'password123',
        role: UserRole.FARMER
      },
      {
        name: 'Bob Aggregator',
        email: 'bob@supply.com',
        password: 'password123',
        role: UserRole.AGGREGATOR
      },
      {
        name: 'Carol Consumer',
        email: 'carol@consumer.com',
        password: 'password123',
        role: UserRole.CONSUMER
      },
      {
        name: 'Admin User',
        email: 'admin@system.com',
        password: 'password123',
        role: UserRole.ADMIN
      }
    ];

    const createdUsers = [];
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`Created user: ${user.name} (${user.role})`);
    }

    // Create sample batches
    const farmer = createdUsers.find(u => u.role === UserRole.FARMER);
    if (!farmer) throw new Error('Farmer not found');

    const sampleBatches = [
      {
        crop: 'Tomatoes',
        location: { lat: 40.7128, lng: -74.0060, address: 'New York Farm' },
        metadata: {
          variety: 'Roma',
          quantity: 500,
          unit: 'kg',
          harvestDate: new Date('2025-09-10'),
          certifications: ['Organic', 'Local'],
          growingMethods: ['Greenhouse', 'Hydroponic']
        }
      },
      {
        crop: 'Apples',
        location: { lat: 42.3601, lng: -71.0589, address: 'Boston Orchard' },
        metadata: {
          variety: 'Gala',
          quantity: 1000,
          unit: 'kg',
          harvestDate: new Date('2025-09-12'),
          certifications: ['Organic'],
          growingMethods: ['Traditional']
        }
      }
    ];

    for (const batchData of sampleBatches) {
      const batch_id = `DEMO${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      const keyPair = generateKeyPair();
      
      const canonicalData = {
        batch_id,
        farmer_id: farmer._id.toString(),
        crop: batchData.crop,
        location: batchData.location,
        metadata: batchData.metadata,
        timestamp: new Date().toISOString()
      };

      const batchHash = createBatchHash(canonicalData);
      const storageAdapter = getStorageAdapter();
      const ipfs_hash = await storageAdapter.store(canonicalData);
      const merkleResult = await MerkleTreeService.appendLeaf(canonicalData, 'batch', batch_id);

      const qrPayload = {
        batch_id,
        farmer_id: farmer._id.toString(),
        timestamp: new Date().toISOString(),
        ipfs_hash,
        merkle_leaf: merkleResult.leaf,
        farmer_pubkey: keyPair.publicKey,
        signature: signData(JSON.stringify(canonicalData), keyPair.privateKey)
      };

      const qr_png = await QRGeneratorService.generateQRCode(qrPayload);

      const batch = new Batch({
        batch_id,
        farmer_id: farmer._id,
        crop: batchData.crop,
        location: batchData.location,
        metadata: batchData.metadata,
        qr_data: qrPayload,
        qr_png,
        timeline: [{
          event_id: `EVT${Date.now()}`,
          timestamp: new Date(),
          type: 'harvest',
          data: { location: batchData.location, metadata: batchData.metadata },
          hash: batchHash
        }],
        merkle_leaf: merkleResult.leaf,
        ipfs_hash,
        status: 'created'
      });

      await batch.save();
      console.log(`Created batch: ${batch_id} (${batchData.crop})`);
    }

    console.log('✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();