/**
 * Results API router.
 * Endpoints for TestResult submission and retrieval.
 *
 * Validates: Requirements 2.3, 3.1
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const resultsRouter = Router();

const resultItemSchema = z.object({
  testName: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  duration: z.number().int().min(0),
  errorMessage: z.string().optional().nullable(),
  errorStack: z.string().optional().nullable(),
});

const createResultsSchema = z.object({
  runId: z.string().uuid(),
  results: z.array(resultItemSchema).min(1),
});

resultsRouter.post('/', validate(createResultsSchema), handlers.createResults);
resultsRouter.get('/', handlers.listResults);
