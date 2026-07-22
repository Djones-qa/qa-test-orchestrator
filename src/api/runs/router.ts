/**
 * Runs API router.
 * Endpoints for TestRun creation and retrieval.
 *
 * Validates: Requirements 2.1, 2.4, 2.7, 4.3
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const runsRouter = Router();

const createRunSchema = z.object({
  suiteId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  matrixId: z.string().uuid().optional(),
});

runsRouter.post('/', validate(createRunSchema), handlers.createRun);
runsRouter.get('/', handlers.listRuns);
runsRouter.get('/:id', handlers.getRun);
