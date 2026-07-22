describe('Configuration module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setRequiredEnv() {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.AUTH_SECRET = 'test-secret';
  }

  it('should load config with all defaults when only required vars are set', async () => {
    setRequiredEnv();

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

  it('should read custom values from environment variables', async () => {
    setRequiredEnv();
    process.env.PORT = '8080';
    process.env.RATE_LIMIT_MAX = '200';
    process.env.RATE_LIMIT_WINDOW_MS = '120000';
    process.env.WORKER_CONCURRENCY = '10';
    process.env.QUEUE_MAX_DEPTH = '50';
    process.env.RETENTION_DAYS = '180';
    process.env.PASS_RATE_THRESHOLD = '95';

    const { config } = await import('../../src/utils/config.js');

    expect(config.port).toBe(8080);
    expect(config.rateLimitMax).toBe(200);
    expect(config.rateLimitWindowMs).toBe(120000);
    expect(config.workerConcurrency).toBe(10);
    expect(config.queueMaxDepth).toBe(50);
    expect(config.retentionDays).toBe(180);
    expect(config.passRateThreshold).toBe(95);
  });

  it('should throw when DATABASE_URL is missing', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.AUTH_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should use default REDIS_URL when not provided', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.AUTH_SECRET = 'test-secret';
    delete process.env.REDIS_URL;

    const { config } = await import('../../src/utils/config.js');
    expect(config.redisUrl).toBe('redis://localhost:6379');
  });

  it('should throw when AUTH_SECRET is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.AUTH_SECRET;

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should enforce WORKER_CONCURRENCY max of 20', async () => {
    setRequiredEnv();
    process.env.WORKER_CONCURRENCY = '25';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should enforce RETENTION_DAYS max of 365', async () => {
    setRequiredEnv();
    process.env.RETENTION_DAYS = '400';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should enforce PASS_RATE_THRESHOLD max of 100', async () => {
    setRequiredEnv();
    process.env.PASS_RATE_THRESHOLD = '150';

    await expect(import('../../src/utils/config.js')).rejects.toThrow(
      'Invalid environment configuration'
    );
  });

  it('should coerce string env values to numbers', async () => {
    setRequiredEnv();
    process.env.PORT = '4000';
    process.env.WORKER_CONCURRENCY = '3';

    const { config } = await import('../../src/utils/config.js');

    expect(typeof config.port).toBe('number');
    expect(config.port).toBe(4000);
    expect(typeof config.workerConcurrency).toBe('number');
    expect(config.workerConcurrency).toBe(3);
  });
});
