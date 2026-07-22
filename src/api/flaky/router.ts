/**
 * Flaky Tests API router.
 * Retrieves currently flagged flaky tests.
 *
 * Validates: Requirement 3.5
 */

import { Router } from 'express';
import * as handlers from './handlers.js';

export const flakyRouter = Router();

flakyRouter.get('/', handlers.listFlakyTests);
