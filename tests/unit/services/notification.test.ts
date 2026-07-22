/**
 * Unit tests for the Notification Service.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { NotificationService } from '../../../src/services/notification';
import type { CreateChannelData, NotificationPayload, FlakyTransition } from '../../../src/services/notification';
import { ValidationError, NotFoundError } from '../../../src/utils/errors';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../src/db/client', () => ({
  prisma: {
    notificationChannel: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    notificationDelivery: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    testSuite: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    testResult: {
      findMany: jest.fn(),
    },
    executionSchedule: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/config', () => ({
  config: {
    passRateThreshold: 80,
  },
}));

import { prisma } from '../../../src/db/client';
const mockPrisma = prisma as any;


// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  // ─── createChannel ─────────────────────────────────────────────────────────

  describe('createChannel', () => {
    it('should create a channel with valid HTTPS URL', async () => {
      const data: CreateChannelData = {
        name: 'Test Slack',
        type: 'slack',
        url: 'https://hooks.slack.com/services/T00/B00/xxx',
        events: ['run.failed'],
      };

      const createdChannel = {
        id: 'ch-1',
        ...data,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.notificationChannel.create.mockResolvedValue(createdChannel);

      const result = await service.createChannel(data);

      expect(result).toEqual(createdChannel);
      expect(mockPrisma.notificationChannel.create).toHaveBeenCalledWith({
        data: {
          name: data.name,
          type: data.type,
          url: data.url,
          events: data.events,
          active: true,
        },
      });
    });

    it('should reject a channel with non-HTTPS URL', async () => {
      const data: CreateChannelData = {
        name: 'Bad Channel',
        type: 'webhook',
        url: 'http://insecure.example.com/hook',
        events: ['run.failed'],
      };

      await expect(service.createChannel(data)).rejects.toThrow(ValidationError);
    });

    it('should reject a channel with invalid URL format', async () => {
      const data: CreateChannelData = {
        name: 'Bad Channel',
        type: 'webhook',
        url: 'not-a-url',
        events: ['run.failed'],
      };

      await expect(service.createChannel(data)).rejects.toThrow(ValidationError);
    });
  });

  // ─── validateAndTestChannel ────────────────────────────────────────────────

  describe('validateAndTestChannel', () => {
    it('should return valid:true when URL is HTTPS and test delivery succeeds', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await service.validateAndTestChannel(
        'https://example.com/webhook',
        'webhook',
      );

      expect(result).toEqual({ valid: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should return valid:false for non-HTTPS URL without making a request', async () => {
      const result = await service.validateAndTestChannel(
        'http://example.com/webhook',
        'webhook',
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return valid:false for malformed URL', async () => {
      const result = await service.validateAndTestChannel('bad-url', 'slack');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return valid:false when test delivery returns non-OK status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

      const result = await service.validateAndTestChannel(
        'https://example.com/webhook',
        'webhook',
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('403');
    });

    it('should return valid:false when test delivery throws a network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.validateAndTestChannel(
        'https://example.com/webhook',
        'webhook',
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // ─── sendNotification ──────────────────────────────────────────────────────

  describe('sendNotification', () => {
    const channelId = 'ch-1';
    const mockChannel = {
      id: channelId,
      name: 'Test Channel',
      type: 'webhook',
      url: 'https://example.com/hook',
      events: ['run.failed'],
      active: true,
    };
    const payload: NotificationPayload = {
      event: 'run.failed',
      suiteName: 'My Suite',
      runId: 'run-1',
      details: { failureCount: 3 },
      timestamp: new Date(),
    };

    it('should deliver successfully on first attempt', async () => {
      mockPrisma.notificationChannel.findUnique.mockResolvedValue(mockChannel);
      mockPrisma.notificationDelivery.create.mockResolvedValue({
        id: 'del-1',
        channelId,
        event: payload.event,
        payload,
        status: 'pending',
        attempts: 0,
      });
      mockPrisma.notificationDelivery.update.mockResolvedValue({});
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await service.sendNotification(channelId, payload);

      expect(result.status).toBe('delivered');
      expect(result.attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on second attempt', async () => {
      mockPrisma.notificationChannel.findUnique.mockResolvedValue(mockChannel);
      mockPrisma.notificationDelivery.create.mockResolvedValue({
        id: 'del-2',
        channelId,
        event: payload.event,
        payload,
        status: 'pending',
        attempts: 0,
      });
      mockPrisma.notificationDelivery.update.mockResolvedValue({});

      // First attempt fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      // Mock delay to avoid waiting in tests
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const result = await service.sendNotification(channelId, payload);

      expect(result.status).toBe('delivered');
      expect(result.attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after 3 unsuccessful attempts', async () => {
      mockPrisma.notificationChannel.findUnique.mockResolvedValue(mockChannel);
      mockPrisma.notificationDelivery.create.mockResolvedValue({
        id: 'del-3',
        channelId,
        event: payload.event,
        payload,
        status: 'pending',
        attempts: 0,
      });
      mockPrisma.notificationDelivery.update.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error('Network error'));

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const result = await service.sendNotification(channelId, payload);

      expect(result.status).toBe('failed');
      expect(result.attempts).toBe(3);
      expect(result.lastError).toContain('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw NotFoundError if channel does not exist', async () => {
      mockPrisma.notificationChannel.findUnique.mockResolvedValue(null);

      await expect(
        service.sendNotification('nonexistent', payload),
      ).rejects.toThrow(NotFoundError);
    });

    it('should use exponential backoff delays (1s, 2s)', async () => {
      mockPrisma.notificationChannel.findUnique.mockResolvedValue(mockChannel);
      mockPrisma.notificationDelivery.create.mockResolvedValue({
        id: 'del-4',
        channelId,
        event: payload.event,
        payload,
        status: 'pending',
        attempts: 0,
      });
      mockPrisma.notificationDelivery.update.mockResolvedValue({});
      mockFetch.mockRejectedValue(new Error('fail'));

      const delaySpy = jest
        .spyOn(service as any, 'delay')
        .mockResolvedValue(undefined);

      await service.sendNotification(channelId, payload);

      // After attempt 1 → delay 1000ms, after attempt 2 → delay 2000ms
      expect(delaySpy).toHaveBeenCalledTimes(2);
      expect(delaySpy).toHaveBeenNthCalledWith(1, 1000);
      expect(delaySpy).toHaveBeenNthCalledWith(2, 2000);
    });
  });

  // ─── getDeliveryHistory ────────────────────────────────────────────────────

  describe('getDeliveryHistory', () => {
    it('should return paginated delivery history', async () => {
      const deliveries = [
        { id: 'del-1', channelId: 'ch-1', event: 'run.failed', status: 'delivered', attempts: 1, createdAt: new Date() },
        { id: 'del-2', channelId: 'ch-1', event: 'run.failed', status: 'failed', attempts: 3, createdAt: new Date() },
      ];

      mockPrisma.notificationDelivery.count.mockResolvedValue(2);
      mockPrisma.notificationDelivery.findMany.mockResolvedValue(deliveries);

      const result = await service.getDeliveryHistory('ch-1');

      expect(result.items).toHaveLength(2);
      expect(result.meta.totalCount).toBe(2);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('should return nextCursor when more items exist', async () => {
      // Default pageSize is 20, so we simulate 21 items returned (hasMore)
      const deliveries = Array.from({ length: 21 }, (_, i) => ({
        id: `del-${i}`,
        channelId: 'ch-1',
        event: 'run.failed',
        status: 'delivered',
        attempts: 1,
        createdAt: new Date(),
      }));

      mockPrisma.notificationDelivery.count.mockResolvedValue(50);
      mockPrisma.notificationDelivery.findMany.mockResolvedValue(deliveries);

      const result = await service.getDeliveryHistory('ch-1');

      expect(result.items).toHaveLength(20);
      expect(result.meta.nextCursor).toBe('del-19');
    });

    it('should use cursor for pagination', async () => {
      mockPrisma.notificationDelivery.count.mockResolvedValue(5);
      mockPrisma.notificationDelivery.findMany.mockResolvedValue([]);

      await service.getDeliveryHistory('ch-1', 'del-10', 10);

      expect(mockPrisma.notificationDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'del-10' },
          skip: 1,
          take: 11,
        }),
      );
    });
  });

  // ─── onRunFailed ───────────────────────────────────────────────────────────

  describe('onRunFailed', () => {
    it('should send notification with correct payload including failed test names', async () => {
      const suite = { id: 'suite-1', name: 'API Tests' };
      mockPrisma.testSuite.findUnique.mockResolvedValue(suite);
      mockPrisma.testResult.findMany.mockResolvedValue([
        { testName: 'test login' },
        { testName: 'test signup' },
      ]);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      await service.onRunFailed({
        id: 'run-1',
        suiteId: 'suite-1',
        totalTests: 10,
        failedTests: 2,
      });

      expect(mockPrisma.testSuite.findUnique).toHaveBeenCalledWith({
        where: { id: 'suite-1' },
      });
      expect(mockPrisma.testResult.findMany).toHaveBeenCalledWith({
        where: { runId: 'run-1', status: 'failed' },
        select: { testName: true },
      });
    });

    it('should use provided results instead of querying DB', async () => {
      const suite = { id: 'suite-1', name: 'API Tests' };
      mockPrisma.testSuite.findUnique.mockResolvedValue(suite);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      await service.onRunFailed({
        id: 'run-1',
        suiteId: 'suite-1',
        totalTests: 10,
        failedTests: 1,
        results: [
          { testName: 'test login', status: 'failed' },
          { testName: 'test home', status: 'passed' },
        ],
      });

      expect(mockPrisma.testResult.findMany).not.toHaveBeenCalled();
    });

    it('should not send notification if suite is not found', async () => {
      mockPrisma.testSuite.findUnique.mockResolvedValue(null);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      await service.onRunFailed({
        id: 'run-1',
        suiteId: 'nonexistent',
        totalTests: 5,
        failedTests: 1,
      });

      expect(mockPrisma.notificationChannel.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── onFlakyTransition ─────────────────────────────────────────────────────

  describe('onFlakyTransition', () => {
    it('should send flaky.detected notification when test becomes flaky', async () => {
      const suite = { id: 'suite-1', name: 'Unit Tests' };
      mockPrisma.testSuite.findFirst.mockResolvedValue(suite);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      const transition: FlakyTransition = {
        testName: 'test checkout',
        suiteId: 'suite-1',
        previousState: 'stable',
        newState: 'flaky',
        score: 0.45,
      };

      await service.onFlakyTransition(transition);

      expect(mockPrisma.notificationChannel.findMany).toHaveBeenCalledWith({
        where: { active: true, events: { has: 'flaky.detected' } },
      });
    });

    it('should send flaky.resolved notification when test becomes stable', async () => {
      const suite = { id: 'suite-1', name: 'Unit Tests' };
      mockPrisma.testSuite.findFirst.mockResolvedValue(suite);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      const transition: FlakyTransition = {
        testName: 'test checkout',
        suiteId: 'suite-1',
        previousState: 'flaky',
        newState: 'stable',
        score: 0.0,
      };

      await service.onFlakyTransition(transition);

      expect(mockPrisma.notificationChannel.findMany).toHaveBeenCalledWith({
        where: { active: true, events: { has: 'flaky.resolved' } },
      });
    });
  });

  // ─── onThresholdBreached ───────────────────────────────────────────────────

  describe('onThresholdBreached', () => {
    it('should send threshold.breached notification with correct details', async () => {
      const suite = { id: 'suite-1', name: 'E2E Tests' };
      mockPrisma.testSuite.findUnique.mockResolvedValue(suite);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      await service.onThresholdBreached('suite-1', 65, 80);

      expect(mockPrisma.notificationChannel.findMany).toHaveBeenCalledWith({
        where: { active: true, events: { has: 'threshold.breached' } },
      });
    });
  });

  // ─── onScheduleSkipped ─────────────────────────────────────────────────────

  describe('onScheduleSkipped', () => {
    it('should send schedule.skipped notification', async () => {
      const schedule = {
        id: 'sched-1',
        suiteId: 'suite-1',
        suite: { id: 'suite-1', name: 'Nightly Suite' },
      };
      mockPrisma.executionSchedule.findUnique.mockResolvedValue(schedule);
      mockPrisma.notificationChannel.findMany.mockResolvedValue([]);

      await service.onScheduleSkipped('sched-1', 'Queue at capacity');

      expect(mockPrisma.executionSchedule.findUnique).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
        include: { suite: true },
      });
      expect(mockPrisma.notificationChannel.findMany).toHaveBeenCalledWith({
        where: { active: true, events: { has: 'schedule.skipped' } },
      });
    });
  });
});
