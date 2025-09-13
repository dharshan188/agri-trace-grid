import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Farm-to-Fork Transparency API',
      version: '1.0.0',
      description: 'Backend API for Farm-to-Fork supply chain transparency system',
      contact: {
        name: 'Farm-to-Fork Team',
        email: 'team@farmtofork.dev'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}/api`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: { 
              type: 'string',
              enum: ['farmer', 'aggregator', 'consumer', 'admin']
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Batch: {
          type: 'object',
          properties: {
            batch_id: { type: 'string' },
            farmer_id: { type: 'string' },
            crop: { type: 'string' },
            location: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
                address: { type: 'string' }
              }
            },
            metadata: { type: 'object' },
            qr_data: { type: 'object' },
            timeline: { type: 'array' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/models/*.ts']
};

const specs = swaggerJsdoc(options);

const swaggerSetup = (app: Express): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Farm-to-Fork API Documentation'
  }));
};

export default swaggerSetup;