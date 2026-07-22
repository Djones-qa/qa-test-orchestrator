/**
 * Schedules API router.
 * CRUD + pause/resume for ExecutionSchedule.
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 5.6, 5.7
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const schedulesRouter = Router();

const createScheduleSchema = z.object({
  suiteId: z.string().uuid(),
  type: z.enum(['cron', 'event']),
  cronExpression: z.string().optional().nullable(),
  webhookPattern: z.string().optional().nullable(),
  matrixId: z.string().uuid().optional().nullable(),
});

const updateScheduleSchema = z.object({
  cronExpression: z.string().optional().nullable(),
  webhookPattern: z.string().optional().nullable(),
  matrixId: z.string().uuid().optional().nullable(),
});

schedulesRouter.post('/', validate(createScheduleSchema), handlers.createSchedule);
schedulesRouter.get('/:id', handlers.getSchedule);
schedulesRouter.put('/:id', validate(updateScheduleSchema), handlers.updateSchedule);
schedulesRouter.post('/:id/pause', handlers.pauseSchedule);
schedulesRouter.post('/:id/resume', handlers.resumeSchedule);
schedulesRouter.delete('/:id', handlers.deleteSchedule);
