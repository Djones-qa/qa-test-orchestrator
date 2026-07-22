/**
 * Suites API handlers.
 */

import { Request, Response } from 'express';
import { suiteService } from '../../services/suite.service.js';
import { successResponse } from '../../utils/types.js';

export async function createSuite(req: Request, res: Response): Promise<void> {
  const suite = await suiteService.create(req.body);
  res.status(201).json(successResponse(suite));
}

export async function getSuite(req: Request, res: Response): Promise<void> {
  const suite = await suiteService.findById(req.params.id!);
  res.json(successResponse(suite));
}

export async function listSuites(req: Request, res: Response): Promise<void> {
  const cursor = req.query.cursor as string | undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
  const result = await suiteService.findAll(cursor, pageSize);
  res.json(successResponse(result.items, result.meta));
}

export async function updateSuite(req: Request, res: Response): Promise<void> {
  const suite = await suiteService.update(req.params.id!, req.body);
  res.json(successResponse(suite));
}

export async function deleteSuite(req: Request, res: Response): Promise<void> {
  await suiteService.delete(req.params.id!);
  res.status(204).send();
}
