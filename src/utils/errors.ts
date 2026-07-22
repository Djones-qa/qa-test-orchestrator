/**
 * Custom error classes for the QA Test Orchestrator.
 * Each error maps to a specific HTTP status code and includes
 * relevant metadata for the global error handler.
 *
 * Validates: Requirements 9.2, 9.3, 9.4, 9.7, 9.9
 */

import { FieldError } from './types';

// Re-export FieldError for consumers that import from this module
export type { FieldError };

/**
 * Base application error. All custom errors extend this class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 422 Unprocessable Entity — request payload failed validation.
 * Includes field-level error details identifying each invalid field
 * and the validation constraint that was violated.
 */
export class ValidationError extends AppError {
  public readonly fields: FieldError[];

  constructor(message: string, fields: FieldError[]) {
    super(message, 422, 'VALIDATION_ERROR');
    this.fields = fields;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 404 Not Found — a referenced resource does not exist.
 * Includes the resource type and identifier for context.
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(message: string, resourceType: string, resourceId: string) {
    super(message, 404, 'NOT_FOUND');
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 409 Conflict — the request conflicts with current state
 * (e.g., duplicate name, active runs preventing deletion).
 * Includes the conflicting resource type and optional identifier.
 */
export class ConflictError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(message: string, resourceType: string, resourceId?: string) {
    super(message, 409, 'CONFLICT');
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 401 Unauthorized — invalid, expired, or missing authentication token.
 * The message describes the authentication failure reason.
 */
export class AuthenticationError extends AppError {
  public readonly reason: string;

  constructor(message: string, reason?: string) {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.reason = reason ?? message;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 503 Service Unavailable — the job queue has reached maximum capacity.
 * Indicates no more test runs can be accepted until workers process existing jobs.
 * Includes the current queue depth for diagnostics.
 */
export class QueueCapacityError extends AppError {
  public readonly currentDepth: number;

  constructor(message: string, currentDepth: number) {
    super(message, 503, 'QUEUE_CAPACITY_EXCEEDED');
    this.currentDepth = currentDepth;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 429 Too Many Requests — client has exceeded the rate limit.
 * Includes retryAfter in seconds indicating when the client can retry.
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
