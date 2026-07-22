/**
 * Runs API handlers.
 */

import { Request, Response } from 'express';
import { RunService } from '../../services/run.service.js';
import { successResponse } from '../../utils/types.js';

const runService = new RunService();

export async function createRun(req: Request, res: Response): Promise<void> {
  const { suiteId, environmentId, matrixId } = req.body;

  let runs;
  if (matrixId) {
    runs = await runService.createFromMatrix(suiteId, matrixId);
    // Enqueue each run
    for (const run of runs) {
      await runService.enqueue(run);
    }
    res.status(201).json(successResponse(runs));
  } else {
    const run = await runService.create(suiteId, environmentId);
    await runService.enqueue(run);
    res.status(201).json(successResponse(run));
  }
}

export async function getRun(req: Request, res: Response): Promise<void> {
  const run = await runService.findById(req.params.id!);
  res.json(successResponse(run));
}

export async function listRuns(req: Request, res: Response): Promise<void> {
  const cursor = req.query.cursor as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
  const suiteId = req.query.suiteId as string | undefined;
  const status = req.query.status as string | undefined;

  const result = await runService.findAll(
    { suiteId, status: status as any },
    cursor,
    pageSize,
  );
  res.json(successResponse(result.items, result.meta));
}
