import { z } from 'zod';

const configSchema = z.object({
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z
    .string()
    .optional()
    .default('redis://localhost:6379'),

  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),

  RATE_LIMIT_MAX: z
    .string()
    .optional()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .default('60000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  WORKER_CONCURRENCY: z
    .string()
    .optional()
    .default('5')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(20)),

  QUEUE_MAX_DEPTH: z
    .string()
    .optional()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  RETENTION_DAYS: z
    .string()
    .optional()
    .default('90')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(365)),

  PASS_RATE_THRESHOLD: z
    .string()
    .optional()
    .default('80')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100)),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = {
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  authSecret: parsed.data.AUTH_SECRET,
  rateLimitMax: parsed.data.RATE_LIMIT_MAX,
  rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
  workerConcurrency: parsed.data.WORKER_CONCURRENCY,
  queueMaxDepth: parsed.data.QUEUE_MAX_DEPTH,
  retentionDays: parsed.data.RETENTION_DAYS,
  passRateThreshold: parsed.data.PASS_RATE_THRESHOLD,
} as const;

export type Config = typeof config;
