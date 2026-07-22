/**
 * Shared types and response envelope for the QA Test Orchestrator API.
 *
 * Validates: Requirements 9.2
 */

// --- Response Envelope ---

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T | null;
  error: ApiError | null;
  meta?: PaginationMeta;
}

export interface ApiError {
  message: string;
  code: string;
  fields?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
  constraint: string;
}

export interface PaginationMeta {
  totalCount: number;
  pageSize: number;
  nextCursor: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

// --- Helper Functions ---

/**
 * Build a successful API response envelope.
 */
export function successResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    status: 'success',
    data,
    error: null,
    ...(meta !== undefined ? { meta } : {}),
  };
}

/**
 * Build an error API response envelope.
 */
export function errorResponse(
  message: string,
  code: string,
  fields?: FieldError[],
): ApiResponse<never> {
  const apiError: ApiError = {
    message,
    code,
    ...(fields !== undefined ? { fields } : {}),
  };

  return {
    status: 'error',
    data: null,
    error: apiError,
  };
}

// --- Shared Domain Type Aliases ---

export type Framework = 'jest' | 'playwright' | 'cypress';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type TestStatus = 'passed' | 'failed' | 'skipped';

export type ScheduleType = 'cron' | 'event';

export type ChannelType = 'slack' | 'webhook';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export type NotificationEvent =
  | 'run.failed'
  | 'flaky.detected'
  | 'flaky.resolved'
  | 'threshold.breached'
  | 'schedule.skipped';
