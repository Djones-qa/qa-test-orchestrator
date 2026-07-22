/**
 * Suites API router.
 * CRUD endpoints for TestSuite management.
 *
 * Validates: Requirements 1.1–1.6
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const suitesRouter = Router();

const createSuiteSchema = z.object({
  name: z.string().min(1).max(128),
  framework: z.enum(['jest', 'playwright', 'cypress']),
  sourcePath: z.string().min(1).max(512),
  config: z.record(z.unknown()).optional().nullable(),
});

const updateSuiteSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  framework: z.enum(['jest', 'playwright', 'cypress']).optional(),
  sourcePath: z.string().min(1).max(512).optional(),
  config: z.record(z.unknown()).optional().nullable(),
});

suitesRouter.post('/', validate(createSuiteSchema), handlers.createSuite);
suitesRouter.get('/', handlers.listSuites);
suitesRouter.get('/:id', handlers.getSuite);
suitesRouter.put('/:id', validate(updateSuiteSchema), handlers.updateSuite);
suitesRouter.delete('/:id', handlers.deleteSuite);
