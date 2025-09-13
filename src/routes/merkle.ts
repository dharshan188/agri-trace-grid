import express from 'express';
import Joi from 'joi';
import { MerkleTreeService } from '@/services/merkleTree';
import { authenticateToken, requireRole } from '@/middleware/auth';
import { createError } from '@/middleware/errorHandler';
import { UserRole } from '@/types';

const router = express.Router();

// Validation schemas
const appendSchema = Joi.object({
  data: Joi.object().required(),
  type: Joi.string().valid('batch', 'event', 'anchor').required(),
  batch_id: Joi.string().optional(),
  event_id: Joi.string().optional()
});

const proofSchema = Joi.object({
  leafIndex: Joi.number().integer().min(0).required()
});

const verifySchema = Joi.object({
  leaf: Joi.string().required(),
  proof: Joi.array().items(Joi.string()).required(),
  leafIndex: Joi.number().integer().min(0).required(),
  root: Joi.string().required()
});

/**
 * @swagger
 * /merkle/root:
 *   get:
 *     summary: Get current Merkle tree root
 *     tags: [Merkle Tree]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current Merkle root
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 root:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/root', authenticateToken, async (req, res, next) => {
  try {
    const root = await MerkleTreeService.getCurrentRoot();
    
    res.json({
      success: true,
      root: root || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /merkle/append:
 *   post:
 *     summary: Append a new leaf to the Merkle tree
 *     tags: [Merkle Tree]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *               - type
 *             properties:
 *               data:
 *                 type: object
 *                 description: Data to be hashed and added as leaf
 *               type:
 *                 type: string
 *                 enum: [batch, event, anchor]
 *               batch_id:
 *                 type: string
 *               event_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Leaf appended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 index:
 *                   type: number
 *                 root:
 *                   type: string
 *                 leaf:
 *                   type: string
 */
router.post('/append', authenticateToken, requireRole([UserRole.ADMIN, UserRole.AGGREGATOR]), async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = appendSchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const { data, type, batch_id, event_id } = value;

    const result = await MerkleTreeService.appendLeaf(data, type, batch_id, event_id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /merkle/proof/{leafIndex}:
 *   get:
 *     summary: Get Merkle proof for a specific leaf
 *     tags: [Merkle Tree]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leafIndex
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Merkle proof for the leaf
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 proof:
 *                   type: object
 *                   properties:
 *                     leaf:
 *                       type: string
 *                     proof:
 *                       type: array
 *                       items:
 *                         type: string
 *                     leafIndex:
 *                       type: number
 *                     root:
 *                       type: string
 *       404:
 *         description: Leaf not found
 */
router.get('/proof/:leafIndex', authenticateToken, async (req, res, next) => {
  try {
    const leafIndex = parseInt(req.params.leafIndex);
    
    if (isNaN(leafIndex) || leafIndex < 0) {
      throw createError('Invalid leaf index', 400);
    }

    const proof = await MerkleTreeService.getProof(leafIndex);
    
    if (!proof) {
      throw createError('Leaf not found', 404);
    }

    res.json({
      success: true,
      proof
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /merkle/verify:
 *   post:
 *     summary: Verify a Merkle proof
 *     tags: [Merkle Tree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - leaf
 *               - proof
 *               - leafIndex
 *               - root
 *             properties:
 *               leaf:
 *                 type: string
 *               proof:
 *                 type: array
 *                 items:
 *                   type: string
 *               leafIndex:
 *                 type: number
 *               root:
 *                 type: string
 *     responses:
 *       200:
 *         description: Proof verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 verified:
 *                   type: boolean
 */
router.post('/verify', async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = verifySchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const { leaf, proof, leafIndex, root } = value;

    const verified = MerkleTreeService.verifyProof(leaf, proof, leafIndex, root);

    res.json({
      success: true,
      verified
    });
  } catch (error) {
    next(error);
  }
});

export default router;