import express from 'express';
import Joi from 'joi';
import Batch from '@/models/Batch';
import Event from '@/models/Event';
import Anomaly from '@/models/Anomaly';
import User from '@/models/User';
import { authenticateToken, requireRole } from '@/middleware/auth';
import { createError } from '@/middleware/errorHandler';
import { UserRole, AuthRequest, AnomalyFlag } from '@/types';
import { WeatherService } from '@/services/weather';
import { logger } from '@/utils/logger';

const router = express.Router();

/**
 * @swagger
 * /admin/anomalies:
 *   get:
 *     summary: Get flagged anomalies
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [price_jump, geo_mismatch, weather_anomaly, timeline_gap]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *       - in: query
 *         name: resolved
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of anomalies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 anomalies:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: number
 */
router.get('/anomalies', authenticateToken, requireRole(UserRole.ADMIN), async (req: AuthRequest, res, next) => {
  try {
    const { type, severity, resolved, limit = 50 } = req.query;

    // Build filter
    const filter: any = {};
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (resolved !== undefined) filter.resolved = resolved === 'true';

    const anomalies = await Anomaly.find(filter)
      .sort({ detected_at: -1 })
      .limit(Number(limit))
      .populate('batch_id', 'crop farmer_id status')
      .populate('resolved_by', 'name email')
      .lean();

    const total = await Anomaly.countDocuments(filter);

    // Run anomaly detection if no specific filters
    if (!type && !severity && resolved === undefined) {
      await runAnomalyDetection();
    }

    res.json({
      success: true,
      anomalies,
      total,
      summary: {
        unresolved: await Anomaly.countDocuments({ resolved: false }),
        high_severity: await Anomaly.countDocuments({ severity: 'high', resolved: false }),
        by_type: await getAnomalyTypeStats()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/anomalies/{id}/resolve:
 *   post:
 *     summary: Resolve an anomaly
 *     tags: [Admin]
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
 *             properties:
 *               resolution_notes:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Anomaly resolved
 */
router.post('/anomalies/:id/resolve', authenticateToken, requireRole(UserRole.ADMIN), async (req: AuthRequest, res, next) => {
  try {
    const { resolution_notes } = req.body;

    const anomaly = await Anomaly.findById(req.params.id);
    if (!anomaly) {
      throw createError('Anomaly not found', 404);
    }

    if (anomaly.resolved) {
      throw createError('Anomaly already resolved', 400);
    }

    anomaly.resolved = true;
    anomaly.resolved_by = req.user!.id;
    anomaly.resolved_at = new Date();
    anomaly.resolution_notes = resolution_notes;

    await anomaly.save();

    logger.info(`Anomaly resolved: ${anomaly._id} by ${req.user!.id}`);

    res.json({
      success: true,
      message: 'Anomaly resolved successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get system statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics
 */
router.get('/stats', authenticateToken, requireRole(UserRole.ADMIN), async (req: AuthRequest, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      users: {
        total: await User.countDocuments({ isActive: true }),
        farmers: await User.countDocuments({ role: UserRole.FARMER, isActive: true }),
        aggregators: await User.countDocuments({ role: UserRole.AGGREGATOR, isActive: true }),
        consumers: await User.countDocuments({ role: UserRole.CONSUMER, isActive: true }),
        new_this_month: await User.countDocuments({ 
          isActive: true,
          createdAt: { $gte: thirtyDaysAgo }
        })
      },
      batches: {
        total: await Batch.countDocuments({ isActive: true }),
        active: await Batch.countDocuments({ status: { $in: ['created', 'in_transit', 'processed'] } }),
        delivered: await Batch.countDocuments({ status: 'delivered' }),
        new_this_month: await Batch.countDocuments({
          isActive: true,
          createdAt: { $gte: thirtyDaysAgo }
        })
      },
      events: {
        total: await Event.countDocuments(),
        this_month: await Event.countDocuments({
          createdAt: { $gte: thirtyDaysAgo }
        }),
        by_type: await Event.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      },
      anomalies: {
        total: await Anomaly.countDocuments(),
        unresolved: await Anomaly.countDocuments({ resolved: false }),
        high_severity: await Anomaly.countDocuments({ severity: 'high', resolved: false }),
        resolved_this_month: await Anomaly.countDocuments({
          resolved: true,
          resolved_at: { $gte: thirtyDaysAgo }
        })
      }
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Run anomaly detection algorithms
 */
async function runAnomalyDetection(): Promise<void> {
  try {
    logger.info('Running anomaly detection...');

    // 1. Detect timeline gaps
    await detectTimelineGaps();

    // 2. Detect geographic mismatches
    await detectGeographicMismatches();

    // 3. Detect weather anomalies
    await detectWeatherAnomalies();

    // 4. Detect price jumps (mock implementation)
    await detectPriceJumps();

    logger.info('Anomaly detection completed');
  } catch (error) {
    logger.error('Anomaly detection failed:', error);
  }
}

/**
 * Detect batches with suspicious timeline gaps
 */
async function detectTimelineGaps(): Promise<void> {
  const batches = await Batch.find({ isActive: true }).lean();

  for (const batch of batches) {
    if (batch.timeline.length < 2) continue;

    const sortedTimeline = batch.timeline.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let i = 1; i < sortedTimeline.length; i++) {
      const gap = new Date(sortedTimeline[i].timestamp).getTime() - 
                  new Date(sortedTimeline[i-1].timestamp).getTime();
      
      // Flag gaps longer than 7 days
      if (gap > 7 * 24 * 60 * 60 * 1000) {
        const existing = await Anomaly.findOne({
          batch_id: batch.batch_id,
          type: 'timeline_gap',
          resolved: false
        });

        if (!existing) {
          await new Anomaly({
            batch_id: batch.batch_id,
            type: 'timeline_gap',
            severity: gap > 14 * 24 * 60 * 60 * 1000 ? 'high' : 'medium',
            description: `Timeline gap of ${Math.round(gap / (24 * 60 * 60 * 1000))} days detected`,
            detected_at: new Date(),
            metadata: {
              gap_days: Math.round(gap / (24 * 60 * 60 * 1000)),
              between_events: [sortedTimeline[i-1].type, sortedTimeline[i].type]
            }
          }).save();
        }
      }
    }
  }
}

/**
 * Detect geographic inconsistencies
 */
async function detectGeographicMismatches(): Promise<void> {
  const batches = await Batch.find({ isActive: true }).lean();

  for (const batch of batches) {
    const events = await Event.find({ batch_id: batch.batch_id }).lean();
    
    for (const event of events) {
      const distance = calculateDistance(
        batch.location.lat, batch.location.lng,
        event.location.lat, event.location.lng
      );

      // Flag if event is more than 1000km from origin
      if (distance > 1000) {
        const existing = await Anomaly.findOne({
          batch_id: batch.batch_id,
          type: 'geo_mismatch',
          resolved: false
        });

        if (!existing) {
          await new Anomaly({
            batch_id: batch.batch_id,
            type: 'geo_mismatch',
            severity: distance > 5000 ? 'high' : 'medium',
            description: `Event located ${Math.round(distance)}km from batch origin`,
            detected_at: new Date(),
            metadata: {
              distance_km: Math.round(distance),
              event_type: event.type,
              event_location: event.location
            }
          }).save();
        }
      }
    }
  }
}

/**
 * Detect weather anomalies
 */
async function detectWeatherAnomalies(): Promise<void> {
  const events = await Event.find({
    weather_snapshot: { $exists: true },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  }).lean();

  for (const event of events) {
    const weather = event.weather_snapshot;
    if (!weather) continue;

    // Flag extreme temperatures
    if (weather.temp < -20 || weather.temp > 50) {
      const existing = await Anomaly.findOne({
        batch_id: event.batch_id,
        type: 'weather_anomaly',
        resolved: false
      });

      if (!existing) {
        await new Anomaly({
          batch_id: event.batch_id,
          type: 'weather_anomaly',
          severity: 'medium',
          description: `Extreme temperature recorded: ${weather.temp}°C`,
          detected_at: new Date(),
          metadata: {
            temperature: weather.temp,
            humidity: weather.humidity,
            event_type: event.type
          }
        }).save();
      }
    }
  }
}

/**
 * Detect price anomalies (mock implementation)
 */
async function detectPriceJumps(): Promise<void> {
  // This is a mock implementation
  // In a real system, this would analyze price data from events
  const batches = await Batch.find({ 
    isActive: true,
    crop: 'tomato', // Example crop
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  }).lean();

  // Simulate random price jump detection
  for (const batch of batches) {
    if (Math.random() < 0.05) { // 5% chance of anomaly
      const existing = await Anomaly.findOne({
        batch_id: batch.batch_id,
        type: 'price_jump',
        resolved: false
      });

      if (!existing) {
        await new Anomaly({
          batch_id: batch.batch_id,
          type: 'price_jump',
          severity: 'low',
          description: 'Unusual price movement detected for crop type',
          detected_at: new Date(),
          metadata: {
            crop: batch.crop,
            simulated: true
          }
        }).save();
      }
    }
  }
}

/**
 * Get anomaly type statistics
 */
async function getAnomalyTypeStats(): Promise<any[]> {
  return await Anomaly.aggregate([
    { $match: { resolved: false } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(value: number): number {
  return value * Math.PI / 180;
}

export default router;