/**
 * Authentication middleware — validates Bearer tokens against AUTH_SECRET.
 * Returns 401 with error envelope on missing, invalid, or expired tokens.
 *
 * Validates: Requirement 9.3
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config.js';
import { AuthenticationError } from '../../utils/errors.js';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('Missing authorization header', 'missing_token');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError(
      'Invalid authorization format. Expected: Bearer <token>',
      'invalid_format',
    );
  }

  const token = parts[1]!;

  if (token !== config.authSecret) {
    throw new AuthenticationError('Invalid or expired token', 'invalid_token');
  }

  next();
}
