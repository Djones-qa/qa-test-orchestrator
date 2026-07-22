/**
 * Environments API router.
 * Endpoints for environment configs and matrices.
 *
 * Validates: Requirements 4.1, 4.2, 4.5, 4.6
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const environmentsRouter = Router();

const createEnvSchema = z.object({
  browser: z.string().optional().nullable(),
  os: z.string().optional().nullable(),
  runtimeVersion: z.string().optional().nullable(),
});

const updateEnvSchema = z.object({
  browser: z.string().optional().nullable(),
  os: z.string().optional().nullable(),
  runtimeVersion: z.string().optional().nullable(),
});

const createMatrixSchema = z.object({
  name: z.string().min(1),
  environmentIds: z.array(z.string().uuid()).min(1).max(50),
});

environmentsRouter.post('/', validate(createEnvSchema), handlers.createEnvironment);
environmentsRouter.get('/:id', handlers.getEnvironment);
environmentsRouter.put('/:id', validate(updateEnvSchema), handlers.updateEnvironment);
environmentsRouter.delete('/:id', handlers.deleteEnvironment);

environmentsRouter.post('/matrix', validate(createMatrixSchema), handlers.createMatrix);
environmentsRouter.get('/matrix/:id', handlers.getMatrix);
environmentsRouter.delete('/matrix/:id', handlers.deleteMatrix);
