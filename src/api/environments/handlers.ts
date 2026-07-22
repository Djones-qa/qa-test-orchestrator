/**
 * Environments API handlers.
 */

import { Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { successResponse } from '../../utils/types.js';

export async function createEnvironment(req: Request, res: Response): Promise<void> {
  const { browser, os, runtimeVersion } = req.body;

  if (!browser && !os && !runtimeVersion) {
    throw new ValidationError('At least one field is required', [
      { field: 'body', message: 'At least one of browser, os, or runtimeVersion must be provided', constraint: 'minFields' },
    ]);
  }

  const env = await prisma.environmentConfig.create({
    data: { browser, os, runtimeVersion },
  });

  res.status(201).json(successResponse(env));
}

export async function getEnvironment(req: Request, res: Response): Promise<void> {
  const env = await prisma.environmentConfig.findUnique({ where: { id: req.params.id } });
  if (!env) {
    throw new NotFoundError(`EnvironmentConfig with id '${req.params.id}' not found`, 'EnvironmentConfig', req.params.id!);
  }
  res.json(successResponse(env));
}

export async function updateEnvironment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.environmentConfig.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`EnvironmentConfig with id '${req.params.id}' not found`, 'EnvironmentConfig', req.params.id!);
  }

  const env = await prisma.environmentConfig.update({
    where: { id: req.params.id },
    data: req.body,
  });

  res.json(successResponse(env));
}

export async function deleteEnvironment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.environmentConfig.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`EnvironmentConfig with id '${req.params.id}' not found`, 'EnvironmentConfig', req.params.id!);
  }

  // Check for active runs referencing this environment
  const activeRuns = await prisma.testRun.count({
    where: {
      environmentId: req.params.id,
      status: { in: ['queued', 'running'] },
    },
  });

  if (activeRuns > 0) {
    throw new ConflictError(
      `Cannot delete environment: ${activeRuns} active run(s) reference this configuration`,
      'EnvironmentConfig',
      req.params.id!,
    );
  }

  await prisma.environmentConfig.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function createMatrix(req: Request, res: Response): Promise<void> {
  const { name, environmentIds } = req.body;

  if (environmentIds.length < 1 || environmentIds.length > 50) {
    throw new ValidationError('Matrix must contain 1 to 50 environments', [
      { field: 'environmentIds', message: 'Must contain 1 to 50 environment IDs', constraint: 'arraySize' },
    ]);
  }

  const matrix = await prisma.environmentMatrix.create({
    data: {
      name,
      entries: {
        create: environmentIds.map((envId: string) => ({
          environmentId: envId,
        })),
      },
    },
    include: { entries: true },
  });

  res.status(201).json(successResponse(matrix));
}

export async function getMatrix(req: Request, res: Response): Promise<void> {
  const matrix = await prisma.environmentMatrix.findUnique({
    where: { id: req.params.id },
    include: { entries: { include: { environment: true } } },
  });

  if (!matrix) {
    throw new NotFoundError(`EnvironmentMatrix with id '${req.params.id}' not found`, 'EnvironmentMatrix', req.params.id!);
  }

  res.json(successResponse(matrix));
}

export async function deleteMatrix(req: Request, res: Response): Promise<void> {
  const existing = await prisma.environmentMatrix.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new NotFoundError(`EnvironmentMatrix with id '${req.params.id}' not found`, 'EnvironmentMatrix', req.params.id!);
  }

  await prisma.environmentMatrix.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
