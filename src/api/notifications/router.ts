/**
 * Notifications API router.
 * Endpoints for NotificationChannel CRUD and delivery history.
 *
 * Validates: Requirements 7.4, 7.5, 7.6, 7.7
 */

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../server/middleware/validate.js';
import * as handlers from './handlers.js';

export const notificationsRouter = Router();

const createChannelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['slack', 'webhook']),
  url: z.string().url(),
  events: z.array(z.enum([
    'run.failed',
    'flaky.detected',
    'flaky.resolved',
    'threshold.breached',
    'schedule.skipped',
  ])).min(1),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['slack', 'webhook']).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum([
    'run.failed',
    'flaky.detected',
    'flaky.resolved',
    'threshold.breached',
    'schedule.skipped',
  ])).optional(),
  active: z.boolean().optional(),
});

notificationsRouter.post('/channels', validate(createChannelSchema), handlers.createChannel);
notificationsRouter.get('/channels', handlers.listChannels);
notificationsRouter.get('/channels/:id', handlers.getChannel);
notificationsRouter.put('/channels/:id', validate(updateChannelSchema), handlers.updateChannel);
notificationsRouter.delete('/channels/:id', handlers.deleteChannel);
notificationsRouter.get('/channels/:id/history', handlers.getDeliveryHistory);
