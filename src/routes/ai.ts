import express from 'express';
import Joi from 'joi';
import crypto from 'crypto';
import { createError } from '@/middleware/errorHandler';
import { AIGradingResult } from '@/types';
import { logger } from '@/utils/logger';

const router = express.Router();

// Validation schema
const gradeSchema = Joi.object({
  image_base64: Joi.string().required(),
  crop_type: Joi.string().optional(),
  analysis_type: Joi.string().valid('quality', 'defects', 'ripeness', 'size').default('quality')
});

/**
 * @swagger
 * /ai/grade:
 *   post:
 *     summary: AI-powered crop grading
 *     tags: [AI Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image_base64
 *             properties:
 *               image_base64:
 *                 type: string
 *                 description: Base64 encoded image
 *               crop_type:
 *                 type: string
 *                 description: Type of crop (optional)
 *               analysis_type:
 *                 type: string
 *                 enum: [quality, defects, ripeness, size]
 *                 default: quality
 *     responses:
 *       200:
 *         description: AI grading result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 grade:
 *                   type: string
 *                 defects:
 *                   type: string
 *                 confidence:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 1
 *                 overlays:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       x:
 *                         type: number
 *                       y:
 *                         type: number
 *                       w:
 *                         type: number
 *                       h:
 *                         type: number
 *                       label:
 *                         type: string
 *                 processing_time:
 *                   type: number
 *                 model_version:
 *                   type: string
 */
router.post('/grade', async (req, res, next) => {
  try {
    const startTime = Date.now();

    // Validate request body
    const { error, value } = gradeSchema.validate(req.body);
    if (error) {
      throw createError(error.details[0].message, 400);
    }

    const { image_base64, crop_type, analysis_type } = value;

    // Validate base64 image
    if (!isValidBase64Image(image_base64)) {
      throw createError('Invalid base64 image format', 400);
    }

    // Generate deterministic but realistic results based on image hash
    const result = await generateMockAIResult(image_base64, crop_type, analysis_type);

    const processingTime = Date.now() - startTime;

    logger.info(`AI grading completed: ${result.grade} (confidence: ${result.confidence})`);

    res.json({
      success: true,
      ...result,
      processing_time: processingTime,
      model_version: 'mock-v1.0.0',
      analysis_type,
      crop_type: crop_type || 'unknown'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /ai/batch-analysis:
 *   post:
 *     summary: Analyze multiple images in batch
 *     tags: [AI Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     image_base64:
 *                       type: string
 *                     crop_type:
 *                       type: string
 *     responses:
 *       200:
 *         description: Batch analysis results
 */
router.post('/batch-analysis', async (req, res, next) => {
  try {
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      throw createError('Images array is required and must not be empty', 400);
    }

    if (images.length > 10) {
      throw createError('Maximum 10 images allowed per batch', 400);
    }

    const results = [];

    for (const imageData of images) {
      if (!imageData.image_base64 || !imageData.id) {
        results.push({
          id: imageData.id || 'unknown',
          success: false,
          error: 'Missing image_base64 or id'
        });
        continue;
      }

      try {
        const result = await generateMockAIResult(
          imageData.image_base64, 
          imageData.crop_type,
          'quality'
        );

        results.push({
          id: imageData.id,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          id: imageData.id,
          success: false,
          error: 'Analysis failed'
        });
      }
    }

    res.json({
      success: true,
      results,
      total_processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /ai/models:
 *   get:
 *     summary: Get available AI models
 *     tags: [AI Services]
 *     responses:
 *       200:
 *         description: List of available models
 */
router.get('/models', async (req, res, next) => {
  try {
    const models = [
      {
        id: 'crop-grader-v1',
        name: 'Crop Quality Grader v1.0',
        type: 'classification',
        supported_crops: ['tomato', 'apple', 'orange', 'banana', 'potato'],
        accuracy: 0.94,
        status: 'active'
      },
      {
        id: 'defect-detector-v2',
        name: 'Defect Detection v2.1',
        type: 'object_detection',
        supported_crops: ['tomato', 'apple', 'orange'],
        accuracy: 0.91,
        status: 'active'
      },
      {
        id: 'ripeness-analyzer-v1',
        name: 'Ripeness Analyzer v1.5',
        type: 'regression',
        supported_crops: ['banana', 'tomato', 'avocado'],
        accuracy: 0.89,
        status: 'beta'
      }
    ];

    res.json({
      success: true,
      models,
      total: models.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate mock AI analysis results
 */
async function generateMockAIResult(
  imageBase64: string, 
  cropType?: string, 
  analysisType: string = 'quality'
): Promise<AIGradingResult> {
  // Create deterministic results based on image hash
  const hash = crypto.createHash('md5').update(imageBase64).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);
  
  // Use seed for deterministic randomness
  const seededRandom = (offset: number = 0) => {
    return ((seed + offset) % 100) / 100;
  };

  // Generate grade based on analysis type and crop
  const grades = ['A', 'B', 'C', 'D', 'F'];
  const gradeIndex = Math.floor(seededRandom(1) * grades.length);
  const grade = grades[gradeIndex];

  // Generate confidence (higher for better grades)
  const baseConfidence = 0.7 + (4 - gradeIndex) * 0.05;
  const confidence = Math.min(0.99, baseConfidence + seededRandom(2) * 0.2);

  // Generate defects based on grade
  const defectPercentages = ['0-2%', '3-7%', '8-15%', '16-25%', '26%+'];
  const defects = defectPercentages[gradeIndex];

  // Generate overlay annotations
  const overlays = [];
  const numOverlays = Math.floor(seededRandom(3) * 3) + 1;

  for (let i = 0; i < numOverlays; i++) {
    const x = Math.floor(seededRandom(4 + i) * 400);
    const y = Math.floor(seededRandom(5 + i) * 300);
    const w = 50 + Math.floor(seededRandom(6 + i) * 100);
    const h = 50 + Math.floor(seededRandom(7 + i) * 100);

    const labels = grade === 'A' 
      ? ['High Quality', 'Good Color', 'Optimal Size']
      : ['Minor Bruising', 'Color Variation', 'Size Deviation', 'Surface Damage'];

    overlays.push({
      x,
      y,
      w,
      h,
      label: labels[i % labels.length]
    });
  }

  return {
    grade,
    defects,
    confidence: Math.round(confidence * 100) / 100,
    overlays
  };
}

/**
 * Validate base64 image format
 */
function isValidBase64Image(base64String: string): boolean {
  // Check if it's a valid base64 string with image mime type
  const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
  
  if (!base64Regex.test(base64String)) {
    return false;
  }

  // Extract the base64 part
  const base64Data = base64String.split(',')[1];
  
  // Check if it's valid base64
  try {
    return btoa(atob(base64Data)) === base64Data;
  } catch (error) {
    return false;
  }
}

export default router;