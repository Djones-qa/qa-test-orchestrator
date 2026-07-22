/**
 * Reports API router.
 * Historical reporting endpoints.
 *
 * Validates: Requirements 8.2, 8.3, 8.4, 8.6, 8.7
 */

import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const reportsRouter = Router();

const reportQuerySchema = z.object({
  startDate: z.string().refine((s) => !isNaN(Date.parse(s)), { message: 'Invalid start date' }),
  endDate: z.string().refine((s) => !isNaN(Date.parse(s)), { message: 'Invalid end date' }),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
});

reportsRouter.get('/suites/:suiteId/summary', validateQuery(reportQuerySchema), handlers.getSuiteReport);
