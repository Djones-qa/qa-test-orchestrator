/**
 * Rate limiting middleware — sliding window per client (100 req/min default).
 * Uses in-memory store (can be upgraded to Redis for multi-instance).
 * Returns 429 with Retry-After header when exceeded.
 *
 * Validates: Requirement 9.6
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../../utils/config.js';
import { RateLimitError } from '../../utils/errors.js';

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

function getClientId(req: Request): string {
  // Use auth token or IP as client identifier
  const auth = req.headers.authorization;
  if (auth) {
    return `auth:${auth}`;
  }
  return `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
}

export function rateLimiterMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const clientId = getClientId(req);
  const now = Date.now();
  const windowMs = config.rateLimitWindowMs;
  const maxRequests = config.rateLimitMax;

  let entry = store.get(clientId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(clientId, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0]!;
    const retryAfterMs = windowMs - (now - oldestInWindow);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);

    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
      retryAfterSec,
    );
  }

  entry.timestamps.push(now);
  next();
}

// Cleanup stale entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < config.rateLimitWindowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();
