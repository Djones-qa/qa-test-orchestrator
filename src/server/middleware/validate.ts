/**
 * Validation middleware — uses Zod schemas for request body validation.
 * Returns 422 with field-level error details on failure.
 *
 * Validates: Requirement 9.4
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../../utils/errors.js';
import type { FieldError } from '../../utils/types.js';

/**
 * Creates middleware that validates req.body against the provided Zod schema.
 * On success, replaces req.body with the parsed/transformed data.
 * On failure, throws ValidationError with field-level details.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fields = mapZodErrors(result.error);
      throw new ValidationError('Request validation failed', fields);
    }

    req.body = result.data;
    next();
  };
}

/**
 * Creates middleware that validates req.query against the provided Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const fields = mapZodErrors(result.error);
      throw new ValidationError('Query parameter validation failed', fields);
    }

    req.query = result.data;
    next();
  };
}

function mapZodErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
    constraint: issue.code,
  }));
}
