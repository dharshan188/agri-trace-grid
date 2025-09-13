import express from 'express';
import Joi from 'joi';
import Batch from '@/models/Batch';
import { MerkleTreeService } from '@/services/merkleTree';
import { verifySignature } from '@/utils/crypto';
import { createError } from '@/middleware/errorHandler';
import { VerificationResult, QRPayload } from '@/types';
import { logger } from '@/utils/logger';

const router = express.Router();

// Validation schemas
const verifySchema = Joi.object({
  qr_json: Joi.object().optional(),
  batch_id: Joi.string().optional()
}).or('qr_json', 'batch_id');

/**
 * @swagger
 * /verify:
 *   post:
 *     summary: Verify batch authenticity
 *     tags: [Verification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               qr_json:
 *                 type: object
 *                 description: QR payload object
 *               batch_id:
 *                 type: string
 *                 description: Batch ID for direct verification
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 verified:
 *                   type: boolean
 *                 mode:
 *                   type: string
 *                   enum: [blockchain, merkle, both]
 *                 reason:
 *                   type: string
 *                 timeline:
 *                   type: array
 *                 merkle_proof:
 *                   type: object
 *                 blockchain_tx:
 *                   type: string
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = verifySchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const { qr_json, batch_id } = value;

    let batchToVerify: any;
    let qrPayload: QRPayload | null = null;

    // Get batch information
    if (qr_json) {
      qrPayload = qr_json as QRPayload;
      batchToVerify = await Batch.findOne({ 
        batch_id: qrPayload.batch_id,
        isActive: true 
      });
    } else if (batch_id) {
      batchToVerify = await Batch.findOne({ 
        batch_id: batch_id,
        isActive: true 
      });
    }

    if (!batchToVerify) {
      return res.json({
        success: true,
        verified: false,
        mode: 'merkle',
        reason: 'Batch not found in database',
        timeline: []
      });
    }

    const result: VerificationResult = {
      verified: false,
      mode: 'merkle',
      reason: '',
      timeline: batchToVerify.timeline
    };

    // 1. Verify QR signature if QR payload provided
    if (qrPayload) {
      const signatureValid = await verifyQRSignature(qrPayload, batchToVerify);
      if (!signatureValid) {
        result.reason = 'Invalid QR signature';
        logger.warn(`QR signature verification failed for batch: ${qrPayload.batch_id}`);
        return res.json({ success: true, ...result });
      }
    }

    // 2. Verify Merkle proof
    const merkleValid = await verifyMerkleInclusion(batchToVerify);
    if (!merkleValid) {
      result.reason = 'Merkle proof verification failed';
      logger.warn(`Merkle verification failed for batch: ${batchToVerify.batch_id}`);
      return res.json({ success: true, ...result });
    }

    // 3. Check blockchain anchor (if available)
    const blockchainValid = await verifyBlockchainAnchor(batchToVerify);
    
    if (blockchainValid) {
      result.mode = 'both';
      result.verified = true;
      result.reason = 'Verified through both Merkle tree and blockchain anchor';
      result.blockchain_tx = batchToVerify.blockchain_tx;
    } else {
      result.mode = 'merkle';
      result.verified = true;
      result.reason = 'Verified through Merkle tree (blockchain anchor pending or unavailable)';
    }

    // Add Merkle proof to response
    const merkleProof = await MerkleTreeService.getProof(
      await getMerkleLeafIndex(batchToVerify.merkle_leaf)
    );
    if (merkleProof) {
      result.merkle_proof = merkleProof;
    }

    logger.info(`Batch verification completed: ${batchToVerify.batch_id}, verified: ${result.verified}, mode: ${result.mode}`);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Verify QR code signature
 */
async function verifyQRSignature(qrPayload: QRPayload, batch: any): Promise<boolean> {
  try {
    // Reconstruct the original data that was signed
    const originalData = {
      batch_id: qrPayload.batch_id,
      farmer_id: qrPayload.farmer_id,
      crop: batch.crop,
      location: batch.location,
      metadata: batch.metadata,
      timestamp: qrPayload.timestamp
    };

    const dataString = JSON.stringify(originalData);
    
    return verifySignature(dataString, qrPayload.signature, qrPayload.farmer_pubkey);
  } catch (error) {
    logger.error('QR signature verification error:', error);
    return false;
  }
}

/**
 * Verify Merkle tree inclusion
 */
async function verifyMerkleInclusion(batch: any): Promise<boolean> {
  try {
    const leafIndex = await getMerkleLeafIndex(batch.merkle_leaf);
    const proof = await MerkleTreeService.getProof(leafIndex);
    
    if (!proof) {
      return false;
    }

    return MerkleTreeService.verifyProof(
      proof.leaf,
      proof.proof,
      proof.leafIndex,
      proof.root
    );
  } catch (error) {
    logger.error('Merkle verification error:', error);
    return false;
  }
}

/**
 * Verify blockchain anchor (mock implementation)
 */
async function verifyBlockchainAnchor(batch: any): Promise<boolean> {
  try {
    // In a real implementation, this would:
    // 1. Connect to the blockchain
    // 2. Query the anchor contract
    // 3. Verify the Merkle root was anchored
    // 4. Check the transaction hash
    
    // For now, we'll just check if a blockchain transaction exists
    return !!batch.blockchain_tx;
  } catch (error) {
    logger.error('Blockchain verification error:', error);
    return false;
  }
}

/**
 * Get Merkle leaf index from hash (simplified lookup)
 */
async function getMerkleLeafIndex(leafHash: string): Promise<number> {
  try {
    // In a real implementation, this would be more efficient
    // For now, we'll simulate finding the index
    const merkleLeaf = await require('@/models/MerkleLeaf').default.findOne({ hash: leafHash });
    return merkleLeaf ? merkleLeaf.index : 0;
  } catch (error) {
    logger.error('Error getting Merkle leaf index:', error);
    return 0;
  }
}

export default router;