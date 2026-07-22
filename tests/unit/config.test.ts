describe('config module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setRequiredEnvVars() {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.AUTH_SECRET = 'test-secret';
  }

  it('should load config with defaults when only required vars are set', async () => {
    setRequiredEnvVars();
    const { config } = await import('../../src/utils/config.js');

    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe('postgresql://localhost:5432/test');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.authSecret).toBe('test-secret');
    expect(config.rateLimitMax).toBe(100);
    expect(config.rateLimitWindowMs).toBe(60000);
    expect(config.workerConcurrency).toBe(5);
    expect(config.queueMaxDepth).toBe(100);
    expect(config.retentionDays).toBe(90);
    expect(config.passRateThreshold).toBe(80);
  });

  it('should use custom values when environment variables are set', async () => {
    setRequiredEnvVars();
    process.env.PORT = '8080';
    process.env.REDIS_URL = 'redis://redis-host:6380';
    process.env.RATE_LIMIT_MAX = '200';
    process.env.RATE_LIMIT_WINDOW_MS = '120000';
    process.env.WORKER_CONCURRENCY = '10';
    process.env.QUEUE_MAX_DEPTH = '50';
    process.env.RETENTION_DAYS = '180';
    process.env.PASS_RATE_THRESHOLD = '95';

    const { config } = await import('../../src/utils/config.js');

    expect(config.port).toBe(8080);
    expect(config.redisUrl).toBe('redis://redis-host:6380');
    expect(config.rateLimitMax).toBe(200);
    expect(config.rateLimitWindowMs).toBe(120000);
    expect(config.workerConcurrency).toBe(10);
    expect(config.queueMaxDepth).toBe(50);
    expect(config.retentionDays).toBe(180);
    expect(config.passRateThreshold).toBe(95);
  });

  it('should throw when DATABASE_URL is missing', async () => {
    process.env.AUTH_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when AUTH_SECRET is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    delete process.env.AUTH_SECRET;

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when WORKER_CONCURRENCY exceeds max of 20', async () => {
    setRequiredEnvVars();
    process.env.WORKER_CONCURRENCY = '25';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when WORKER_CONCURRENCY is below min of 1', async () => {
    setRequiredEnvVars();
    process.env.WORKER_CONCURRENCY = '0';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when RETENTION_DAYS exceeds max of 365', async () => {
    setRequiredEnvVars();
    process.env.RETENTION_DAYS = '400';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when PASS_RATE_THRESHOLD exceeds max of 100', async () => {
    setRequiredEnvVars();
    process.env.PASS_RATE_THRESHOLD = '101';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should throw when PASS_RATE_THRESHOLD is below min of 1', async () => {
    setRequiredEnvVars();
    process.env.PASS_RATE_THRESHOLD = '0';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });
});
