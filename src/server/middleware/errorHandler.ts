/**
 * Global error handler middleware.
 * Maps custom error types to HTTP status codes and returns consistent
 * error envelope responses. Never exposes internal details in 500 responses.
 *
 * Validates: Requirements 9.2, 9.7, 9.9
 */

import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  RateLimitError,
} from '../../utils/errors.js';
import { errorResponse } from '../../utils/types.js';
import logger from '../../utils/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Handle known operational errors
  if (err instanceof AppError) {
    const body = errorResponse(err.message, err.code);

    // Add field-level details for validation errors
    if (err instanceof ValidationError && body.error) {
      body.error.fields = err.fields;
    }

    // Add resource context for NotFoundError
    if (err instanceof NotFoundError && body.error) {
      body.error.message = `${err.resourceType} with id '${err.resourceId}' not found`;
    }

    // Add Retry-After header for rate limit errors
    if (err instanceof RateLimitError) {
      res.set('Retry-After', String(err.retryAfter));
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / programming errors — log and return generic 500
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  res.status(500).json(
    errorResponse(
      'An unexpected error occurred. Please try again later.',
      'INTERNAL_ERROR',
    ),
  );
}
