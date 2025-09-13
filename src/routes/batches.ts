import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import Batch from '@/models/Batch';
import Event from '@/models/Event';
import { authenticateToken, requireRole } from '@/middleware/auth';
import { createError } from '@/middleware/errorHandler';
import { UserRole, AuthRequest, QRPayload } from '@/types';
import { QRGeneratorService } from '@/services/qrGenerator';
import { WeatherService } from '@/services/weather';
import { getStorageAdapter } from '@/services/storage';
import { MerkleTreeService } from '@/services/merkleTree';
import { generateKeyPair, signData, createBatchHash } from '@/utils/crypto';
import { logger } from '@/utils/logger';

const router = express.Router();

// Validation schemas
const createBatchSchema = Joi.object({
  crop: Joi.string().min(2).max(100).required(),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    address: Joi.string().max(200).optional()
  }).required(),
  photo_base64: Joi.string().optional(),
  metadata: Joi.object({
    variety: Joi.string().max(100).optional(),
    quantity: Joi.number().positive().required(),
    unit: Joi.string().valid('kg', 'tons', 'pounds', 'pieces').required(),
    harvestDate: Joi.date().max('now').required(),
    estimatedShelfLife: Joi.number().positive().optional(),
    certifications: Joi.array().items(Joi.string()).optional(),
    growingMethods: Joi.array().items(Joi.string()).optional()
  }).required()
});

const addEventSchema = Joi.object({
  type: Joi.string().valid('harvest', 'inspection', 'transport', 'processing', 'packaging', 'delivery', 'quality_check', 'storage').required(),
  weather_snapshot: Joi.object({
    temp: Joi.number().required(),
    humidity: Joi.number().min(0).max(100).required(),
    source: Joi.string().required(),
    timestamp: Joi.date().required(),
    conditions: Joi.string().optional(),
    windSpeed: Joi.number().min(0).optional()
  }).optional(),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    address: Joi.string().max(200).optional()
  }).required(),
  notes: Joi.string().max(1000).optional(),
  grade: Joi.string().valid('A', 'B', 'C', 'D', 'F').optional(),
  defects: Joi.string().max(500).optional(),
  quality_score: Joi.number().min(0).max(100).optional()
});

/**
 * @swagger
 * /batches:
 *   post:
 *     summary: Create a new batch
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - crop
 *               - location
 *               - metadata
 *             properties:
 *               crop:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *                   address:
 *                     type: string
 *               photo_base64:
 *                 type: string
 *                 description: Base64 encoded image
 *               metadata:
 *                 type: object
 *                 properties:
 *                   variety:
 *                     type: string
 *                   quantity:
 *                     type: number
 *                   unit:
 *                     type: string
 *                   harvestDate:
 *                     type: string
 *                     format: date
 *                   estimatedShelfLife:
 *                     type: number
 *                   certifications:
 *                     type: array
 *                     items:
 *                       type: string
 *                   growingMethods:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Batch created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 batch_id:
 *                   type: string
 *                 qr_json:
 *                   type: object
 *                 qr_png:
 *                   type: string
 *                   description: Base64 encoded QR code PNG
 */
router.post('/', authenticateToken, requireRole(UserRole.FARMER), async (req: AuthRequest, res, next) => {
  try {
    // Validate request body
    const { error, value } = createBatchSchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const { crop, location, photo_base64, metadata } = value;
    const farmer_id = req.user!.id;

    // Generate batch ID
    const batch_id = `FARM${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Generate farmer key pair (in production, this would be stored securely)
    const keyPair = generateKeyPair();

    // Create batch data for hashing
    const batchData = {
      batch_id,
      farmer_id,
      crop,
      location,
      metadata,
      timestamp: new Date().toISOString()
    };

    // Compute batch hash
    const batchHash = createBatchHash(batchData);

    // Store in IPFS (or mock)
    const storageAdapter = getStorageAdapter();
    const ipfs_hash = await storageAdapter.store({
      ...batchData,
      photo_hash: photo_base64 ? crypto.createHash('sha256').update(photo_base64).digest('hex') : undefined
    }, {
      type: 'batch_creation',
      farmer_key: keyPair.publicKey
    });

    // Add to Merkle tree
    const merkleResult = await MerkleTreeService.appendLeaf(batchData, 'batch', batch_id);

    // Create QR payload
    const qrPayload: QRPayload = {
      batch_id,
      farmer_id,
      timestamp: new Date().toISOString(),
      ipfs_hash,
      merkle_leaf: merkleResult.leaf,
      farmer_pubkey: keyPair.publicKey,
      signature: signData(JSON.stringify(batchData), keyPair.privateKey)
    };

    // Generate QR code
    const qr_png = await QRGeneratorService.generateQRCode(qrPayload);

    // Create batch document
    const batch = new Batch({
      batch_id,
      farmer_id,
      crop,
      location,
      photo_hash: photo_base64 ? crypto.createHash('sha256').update(photo_base64).digest('hex') : undefined,
      metadata,
      qr_data: qrPayload,
      qr_png,
      timeline: [{
        event_id: `EVT${Date.now()}`,
        timestamp: new Date(),
        type: 'harvest',
        data: {
          location,
          weather: await WeatherService.getCurrentWeather(location),
          metadata
        },
        hash: batchHash
      }],
      merkle_leaf: merkleResult.leaf,
      ipfs_hash,
      status: 'created'
    });

    await batch.save();

    logger.info(`Batch created: ${batch_id} by farmer ${farmer_id}`);

    res.status(201).json({
      success: true,
      batch_id,
      qr_json: qrPayload,
      qr_png,
      merkle_root: merkleResult.root,
      ipfs_hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /batches/{id}:
 *   get:
 *     summary: Get batch details
 *     tags: [Batches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Batch details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Batch'
 *       404:
 *         description: Batch not found
 */
router.get('/:id', async (req, res, next) => {
  try {
    const batch = await Batch.findOne({ 
      batch_id: req.params.id,
      isActive: true 
    }).populate('farmer_id', 'name email');

    if (!batch) {
      throw createError('Batch not found', 404);
    }

    res.json({
      success: true,
      batch: {
        ...batch.toObject(),
        merkle_hash: batch.merkle_leaf,
        ipfs_hash: batch.ipfs_hash
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /batches/{id}/events:
 *   post:
 *     summary: Add event to batch timeline
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - location
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [harvest, inspection, transport, processing, packaging, delivery, quality_check, storage]
 *               weather_snapshot:
 *                 type: object
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *               notes:
 *                 type: string
 *               grade:
 *                 type: string
 *                 enum: [A, B, C, D, F]
 *               defects:
 *                 type: string
 *               quality_score:
 *                 type: number
 *     responses:
 *       200:
 *         description: Event added successfully
 *       404:
 *         description: Batch not found
 */
router.post('/:id/events', authenticateToken, requireRole([UserRole.AGGREGATOR, UserRole.FARMER]), async (req: AuthRequest, res, next) => {
  try {
    // Validate request body
    const { error, value } = addEventSchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const batch_id = req.params.id;
    const { type, weather_snapshot, location, notes, grade, defects, quality_score } = value;

    // Find batch
    const batch = await Batch.findOne({ batch_id, isActive: true });
    if (!batch) {
      throw createError('Batch not found', 404);
    }

    // Get weather data if not provided
    const weather = weather_snapshot || await WeatherService.getCurrentWeather(location);

    // Create event
    const event_id = `EVT${Date.now()}${Math.random().toString(36).substr(2, 3)}`;
    const eventData = {
      event_id,
      batch_id,
      type,
      location,
      weather_snapshot: weather,
      notes,
      grade,
      defects,
      quality_score,
      inspector_id: req.user!.id,
      timestamp: new Date()
    };

    // Compute event hash
    const eventHash = crypto.createHash('sha256').update(JSON.stringify(eventData)).digest('hex');

    // Add to Merkle tree
    const merkleResult = await MerkleTreeService.appendLeaf(eventData, 'event', batch_id, event_id);

    // Save event
    const event = new Event({
      ...eventData,
      hash: eventHash,
      merkle_leaf: merkleResult.leaf
    });

    await event.save();

    // Update batch timeline
    batch.timeline.push({
      event_id,
      timestamp: eventData.timestamp,
      type,
      data: eventData,
      hash: eventHash
    });

    await batch.save();

    logger.info(`Event added to batch ${batch_id}: ${type} by ${req.user!.id}`);

    res.json({
      success: true,
      message: 'Event added to timeline',
      event_id,
      merkle_leaf: merkleResult.leaf,
      merkle_root: merkleResult.root
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /batches:
 *   get:
 *     summary: Get batches with filtering
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: farmer_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: crop
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of batches
 */
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { farmer_id, crop, status, limit = 20, offset = 0 } = req.query;

    // Build filter
    const filter: any = { isActive: true };
    
    if (farmer_id) filter.farmer_id = farmer_id;
    if (crop) filter.crop = new RegExp(crop as string, 'i');
    if (status) filter.status = status;

    // For farmers, only show their own batches
    if (req.user!.role === UserRole.FARMER) {
      filter.farmer_id = req.user!.id;
    }

    const batches = await Batch.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(offset))
      .populate('farmer_id', 'name email')
      .lean();

    const total = await Batch.countDocuments(filter);

    res.json({
      success: true,
      batches,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < total
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;