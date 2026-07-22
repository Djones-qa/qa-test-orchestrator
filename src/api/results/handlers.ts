/**
 * Results API handlers.
 */

import { Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { FlakyDetectorService } from '../../services/flaky-detector.js';
import { NotFoundError } from '../../utils/errors.js';
import { successResponse, PaginatedResult } from '../../utils/types.js';

const flakyDetector = new FlakyDetectorService();

export async function createResults(req: Request, res: Response): Promise<void> {
  const { runId, results } = req.body;

  // Verify run exists
  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new NotFoundError(`TestRun with id '${runId}' not found`, 'TestRun', runId);
  }

  // Batch create results
  const created = [];
  for (const result of results) {
    const record = await prisma.testResult.create({
      data: {
        runId,
        testName: result.testName,
        status: result.status,
        duration: result.duration,
        errorMessage: result.errorMessage ?? null,
        errorStack: result.errorStack ?? null,
      },
    });
    created.push(record);

    // Process flaky detection for pass/fail results
    if (result.status === 'passed' || result.status === 'failed') {
      await flakyDetector.processResult(result.testName, run.suiteId, result.status);
    }
  }

  // Update run totals
  const passed = results.filter((r: any) => r.status === 'passed').length;
  const failed = results.filter((r: any) => r.status === 'failed').length;
  const skipped = results.filter((r: any) => r.status === 'skipped').length;

  await prisma.testRun.update({
    where: { id: runId },
    data: {
      totalTests: { increment: results.length },
      passedTests: { increment: passed },
      failedTests: { increment: failed },
      skippedTests: { increment: skipped },
    },
  });

  res.status(201).json(successResponse(created));
}

export async function listResults(req: Request, res: Response): Promise<void> {
  const runId = req.query.runId as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
  const take = Math.min(Math.max(pageSize, 1), 100);

  const where: Record<string, unknown> = {};
  if (runId) where.runId = runId;

  const totalCount = await prisma.testResult.count({ where });

  const queryArgs: any = {
    where,
    take: take + 1,
    orderBy: { createdAt: 'asc' },
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const items = await prisma.testResult.findMany(queryArgs);

  const hasMore = items.length > take;
  const returnItems = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? returnItems[returnItems.length - 1]!.id : null;

  const result: PaginatedResult<any> = {
    items: returnItems,
    meta: { totalCount, pageSize: take, nextCursor },
  };

  res.json(successResponse(result.items, result.meta));
}
