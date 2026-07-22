/**
 * Express application factory.
 * Configures middleware, mounts API router, and attaches global error handler.
 *
 * Validates: Requirements 9.1, 9.2, 9.8
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiRouter } from './router.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS
  app.use(cors());

  // Request logging
  app.use(morgan('combined'));

  // JSON body parsing
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routes under /api/v1
  app.use('/api/v1', apiRouter);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
