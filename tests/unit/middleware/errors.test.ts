import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  QueueCapacityError,
  RateLimitError,
  FieldError,
} from '../../../src/utils/errors.js';

describe('Custom Error Classes', () => {
  describe('AppError', () => {
    it('should create a base error with status code, code, and message', () => {
      const error = new AppError('Something went wrong', 500, 'INTERNAL_ERROR');
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should allow marking errors as non-operational', () => {
      const error = new AppError('Critical failure', 500, 'CRITICAL', false);
      expect(error.isOperational).toBe(false);
    });

    it('should capture a stack trace', () => {
      const error = new AppError('Test', 400, 'TEST');
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create a 422 error with field-level details', () => {
      const fields: FieldError[] = [
        { field: 'name', message: 'Name is required', constraint: 'required' },
        { field: 'framework', message: 'Unsupported framework', constraint: 'enum' },
      ];
      const error = new ValidationError('Validation failed', fields);

      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.fields).toEqual(fields);
      expect(error.fields).toHaveLength(2);
      expect(error.message).toBe('Validation failed');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should work with an empty fields array', () => {
      const error = new ValidationError('No fields', []);
      expect(error.fields).toEqual([]);
    });

    it('should preserve the prototype chain', () => {
      const error = new ValidationError('Test', []);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('NotFoundError', () => {
    it('should create a 404 error with resource type and id', () => {
      const error = new NotFoundError(
        "TestSuite with id 'abc-123' not found",
        'TestSuite',
        'abc-123',
      );

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.resourceType).toBe('TestSuite');
      expect(error.resourceId).toBe('abc-123');
      expect(error.message).toBe("TestSuite with id 'abc-123' not found");
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('should preserve the prototype chain', () => {
      const error = new NotFoundError('Not found', 'Resource', '123');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('ConflictError', () => {
    it('should create a 409 error with conflicting resource info', () => {
      const error = new ConflictError(
        'Conflict on TestSuite: name already exists',
        'TestSuite',
        'abc-123',
      );

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Conflict on TestSuite: name already exists');
      expect(error.resourceType).toBe('TestSuite');
      expect(error.resourceId).toBe('abc-123');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
    });

    it('should allow omitting resourceId', () => {
      const error = new ConflictError('Duplicate name', 'TestSuite');
      expect(error.resourceType).toBe('TestSuite');
      expect(error.resourceId).toBeUndefined();
    });

    it('should preserve the prototype chain', () => {
      const error = new ConflictError('Duplicate resource', 'Resource');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
    });
  });

  describe('AuthenticationError', () => {
    it('should create a 401 error with authentication failure reason', () => {
      const error = new AuthenticationError('Token expired', 'token_expired');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Token expired');
      expect(error.reason).toBe('token_expired');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should default reason to message when not provided', () => {
      const error = new AuthenticationError('Missing token');
      expect(error.reason).toBe('Missing token');
    });

    it('should preserve the prototype chain', () => {
      const error = new AuthenticationError('Missing token');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });
  });

  describe('QueueCapacityError', () => {
    it('should create a 503 error with current queue depth', () => {
      const error = new QueueCapacityError('Queue capacity exceeded: 100/100 jobs in queue', 100);

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('QUEUE_CAPACITY_EXCEEDED');
      expect(error.message).toBe('Queue capacity exceeded: 100/100 jobs in queue');
      expect(error.currentDepth).toBe(100);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(QueueCapacityError);
    });

    it('should preserve the prototype chain', () => {
      const error = new QueueCapacityError('Queue full', 50);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(QueueCapacityError);
    });
  });

  describe('RateLimitError', () => {
    it('should create a 429 error with retryAfter seconds', () => {
      const error = new RateLimitError('Rate limit exceeded. Retry after 45 seconds', 45);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(45);
      expect(error.message).toBe('Rate limit exceeded. Retry after 45 seconds');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
    });

    it('should preserve the prototype chain', () => {
      const error = new RateLimitError('Too many requests', 60);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
    });
  });
});
