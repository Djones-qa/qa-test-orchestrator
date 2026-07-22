/**
 * Flaky tests API handlers.
 */

import { Request, Response } from 'express';
import { FlakyDetectorService } from '../../services/flaky-detector.js';
import { successResponse } from '../../utils/types.js';

const flakyDetector = new FlakyDetectorService();

export async function listFlakyTests(req: Request, res: Response): Promise<void> {
  const cursor = req.query.cursor as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

  const result = await flakyDetector.getFlakyTests(cursor, pageSize);
  res.json(successResponse(result.items, result.meta));
}
