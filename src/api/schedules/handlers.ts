/**
 * Schedules API handlers.
 */

import { Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { successResponse } from '../../utils/types.js';
import cronParser from 'cron-parser';

function validateCronExpression(expression: string): void {
  try {
    const interval = cronParser.parseExpression(expression);
    // Check minimum interval (1 minute)
    const first = interval.next().toDate();
    const second = interval.next().toDate();
    const diffMs = second.getTime() - first.getTime();
    if (diffMs < 60000) {
      throw new ValidationError('Invalid cron expression', [
        { field: 'cronExpression', message: 'Minimum interval is 1 minute', constraint: 'minInterval' },
      ]);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid cron expression', [
      { field: 'cronExpression', message: 'Invalid cron expression format', constraint: 'cronFormat' },
    ]);
  }
}

export async function createSchedule(req: Request, res: Response): Promise<void> {
  const { suiteId, type, cronExpression, webhookPattern, matrixId } = req.body;

  // Validate suite exists
  const suite = await prisma.testSuite.findUnique({ where: { id: suiteId } });
  if (!suite) {
    throw new ValidationError('Invalid schedule configuration', [
      { field: 'suiteId', message: 'Referenced test suite does not exist', constraint: 'exists' },
    ]);
  }

  if (type === 'cron') {
    if (!cronExpression) {
      throw new ValidationError('Invalid schedule configuration', [
        { field: 'cronExpression', message: 'Cron expression is required for cron schedules', constraint: 'required' },
      ]);
    }
    validateCronExpression(cronExpression);
  }

  const schedule = await prisma.executionSchedule.create({
    data: {
      suiteId,
      type,
      cronExpression: cronExpression ?? null,
      webhookPattern: webhookPattern ?? null,
      matrixId: matrixId ?? null,
      active: true,
    },
  });

  res.status(201).json(successResponse(schedule));
}

export async function getSchedule(req: Request, res: Response): Promise<void> {
  const schedule = await prisma.executionSchedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) {
    throw new NotFoundError(`ExecutionSchedule with id '${req.params.id}' not found`, 'ExecutionSchedule', req.params.id!);
  }
  res.json(successResponse(schedule));
}

export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const existing = await prisma.executionSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`ExecutionSchedule with id '${req.params.id}' not found`, 'ExecutionSchedule', req.params.id!);
  }

  if (req.body.cronExpression) {
    validateCronExpression(req.body.cronExpression);
  }

  const schedule = await prisma.executionSchedule.update({
    where: { id: req.params.id },
    data: req.body,
  });

  res.json(successResponse(schedule));
}

export async function pauseSchedule(req: Request, res: Response): Promise<void> {
  const existing = await prisma.executionSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`ExecutionSchedule with id '${req.params.id}' not found`, 'ExecutionSchedule', req.params.id!);
  }

  const schedule = await prisma.executionSchedule.update({
    where: { id: req.params.id },
    data: { active: false },
  });

  res.json(successResponse(schedule));
}

export async function resumeSchedule(req: Request, res: Response): Promise<void> {
  const existing = await prisma.executionSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`ExecutionSchedule with id '${req.params.id}' not found`, 'ExecutionSchedule', req.params.id!);
  }

  const schedule = await prisma.executionSchedule.update({
    where: { id: req.params.id },
    data: { active: true },
  });

  res.json(successResponse(schedule));
}

export async function deleteSchedule(req: Request, res: Response): Promise<void> {
  const existing = await prisma.executionSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`ExecutionSchedule with id '${req.params.id}' not found`, 'ExecutionSchedule', req.params.id!);
  }

  await prisma.executionSchedule.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
