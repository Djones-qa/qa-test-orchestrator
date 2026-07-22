/**
 * Reports API handlers.
 */

import { Request, Response } from 'express';
import { MetricsService } from '../../services/metrics.js';
import { successResponse } from '../../utils/types.js';

const metricsService = new MetricsService();

export async function getSuiteReport(req: Request, res: Response): Promise<void> {
  const suiteId = req.params.suiteId!;
  const startDate = new Date(req.query.startDate as string);
  const endDate = new Date(req.query.endDate as string);
  const groupBy = (req.query.groupBy as 'day' | 'week' | 'month') || 'day';

  const report = await metricsService.getReport(suiteId, { startDate, endDate, groupBy });
  res.json(successResponse(report));
}
