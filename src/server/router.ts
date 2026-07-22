/**
 * Main API Router — mounts all sub-routers under /api/v1.
 * Applies auth and rate-limit middleware to all routes.
 *
 * Validates: Requirements 9.1, 9.8
 */

import { Router } from 'express';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.js';
import { suitesRouter } from '../api/suites/router.js';
import { runsRouter } from '../api/runs/router.js';
import { resultsRouter } from '../api/results/router.js';
import { environmentsRouter } from '../api/environments/router.js';
import { schedulesRouter } from '../api/schedules/router.js';
import { notificationsRouter } from '../api/notifications/router.js';
import { reportsRouter } from '../api/reports/router.js';
import { flakyRouter } from '../api/flaky/router.js';

export const apiRouter = Router();

// Apply middleware to all API routes
apiRouter.use(authMiddleware);
apiRouter.use(rateLimiterMiddleware);

// Mount sub-routers
apiRouter.use('/suites', suitesRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/environments', environmentsRouter);
apiRouter.use('/schedules', schedulesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/flaky', flakyRouter);
