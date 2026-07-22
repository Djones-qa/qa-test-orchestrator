/**
 * Notifications API handlers.
 */

import { Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { notificationService } from '../../services/notification.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { successResponse } from '../../utils/types.js';

export async function createChannel(req: Request, res: Response): Promise<void> {
  const { name, type, url, events } = req.body;

  // Validate and test the channel
  const testResult = await notificationService.validateAndTestChannel(url, type);
  if (!testResult.valid) {
    throw new ValidationError('Channel validation failed', [
      { field: 'url', message: testResult.error!, constraint: 'connectivity' },
    ]);
  }

  const channel = await notificationService.createChannel({ name, type, url, events });
  res.status(201).json(successResponse(channel));
}

export async function listChannels(req: Request, res: Response): Promise<void> {
  const channels = await prisma.notificationChannel.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(successResponse(channels));
}

export async function getChannel(req: Request, res: Response): Promise<void> {
  const channel = await prisma.notificationChannel.findUnique({ where: { id: req.params.id } });
  if (!channel) {
    throw new NotFoundError(`NotificationChannel with id '${req.params.id}' not found`, 'NotificationChannel', req.params.id!);
  }
  res.json(successResponse(channel));
}

export async function updateChannel(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationChannel.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`NotificationChannel with id '${req.params.id}' not found`, 'NotificationChannel', req.params.id!);
  }

  const channel = await prisma.notificationChannel.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(successResponse(channel));
}

export async function deleteChannel(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationChannel.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`NotificationChannel with id '${req.params.id}' not found`, 'NotificationChannel', req.params.id!);
  }

  await prisma.notificationChannel.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function getDeliveryHistory(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationChannel.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`NotificationChannel with id '${req.params.id}' not found`, 'NotificationChannel', req.params.id!);
  }

  const cursor = req.query.cursor as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

  const result = await notificationService.getDeliveryHistory(req.params.id!, cursor, pageSize);
  res.json(successResponse(result.items, result.meta));
}
