/**
 * Unit tests for the MetricsService.
 *
 * Tests cover: getReport, getTopFailures, cleanupExpiredResults,
 * date range validation, interval grouping, and empty range handling.
 */

import { MetricsService, ReportQuery } from '../../../src/services/metrics';
import { ValidationError } from '../../../src/utils/errors';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../src/db/client', () => ({
  __esModule: true,
  default: {
    testResult: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../../../src/utils/config', () => ({
  config: {
    retentionDays: 90,
    passRateThreshold: 80,
  },
}));

import prisma from '../../../src/db/client';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
    jest.clearAllMocks();
  });

  describe('getReport', () => {
    it('should throw ValidationError when endDate is before startDate', async () => {
      const query: ReportQuery = {
        startDate: new Date('2024-03-15T00:00:00Z'),
        endDate: new Date('2024-03-10T00:00:00Z'),
      };

      await expect(service.getReport('suite-1', query)).rejects.toThrow(ValidationError);
      await expect(service.getReport('suite-1', query)).rejects.toMatchObject({
        fields: [{ field: 'endDate', constraint: 'dateRange' }],
      });
    });

    it('should throw ValidationError when endDate equals startDate', async () => {
      const sameDate = new Date('2024-03-15T00:00:00Z');
      const query: ReportQuery = {
        startDate: sameDate,
        endDate: sameDate,
      };

      await expect(service.getReport('suite-1', query)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when range exceeds retention period', async () => {
      const query: ReportQuery = {
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-07-01T00:00:00Z'), // 182 days > 90
      };

      await expect(service.getReport('suite-1', query)).rejects.toThrow(ValidationError);
      await expect(service.getReport('suite-1', query)).rejects.toMatchObject({
        fields: [{ field: 'dateRange', constraint: 'retentionPeriod' }],
      });
    });

    it('should return empty intervals with zero aggregates when no results exist', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([]);

      const query: ReportQuery = {
        startDate: new Date('2024-03-01T00:00:00Z'),
        endDate: new Date('2024-03-03T00:00:00Z'),
        groupBy: 'day',
      };

      const report = await service.getReport('suite-1', query);

      expect(report.intervals.length).toBeGreaterThan(0);
      for (const interval of report.intervals) {
        expect(interval.passRate).toBe(0);
        expect(interval.avgDuration).toBe(0);
        expect(interval.totalExecutions).toBe(0);
        expect(interval.failureCount).toBe(0);
      }
      expect(report.topFailures).toEqual([]);
    });

    it('should group results by day and compute correct aggregates', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed', duration: 100, createdAt: new Date('2024-03-01T10:00:00Z'), testName: 'test-a' },
        { status: 'passed', duration: 200, createdAt: new Date('2024-03-01T11:00:00Z'), testName: 'test-b' },
        { status: 'failed', duration: 150, createdAt: new Date('2024-03-01T12:00:00Z'), testName: 'test-c' },
        { status: 'passed', duration: 300, createdAt: new Date('2024-03-02T09:00:00Z'), testName: 'test-a' },
        { status: 'failed', duration: 250, createdAt: new Date('2024-03-02T10:00:00Z'), testName: 'test-b' },
      ]);

      const query: ReportQuery = {
        startDate: new Date('2024-03-01T00:00:00Z'),
        endDate: new Date('2024-03-02T23:59:59Z'),
        groupBy: 'day',
      };

      const report = await service.getReport('suite-1', query);

      // Day 1: 2 passed, 1 failed = 66.67% pass rate, avg duration = 150
      const day1 = report.intervals.find((i) => i.period === '2024-03-01T00:00:00.000Z');
      expect(day1).toBeDefined();
      expect(day1!.passRate).toBeCloseTo(66.67, 1);
      expect(day1!.avgDuration).toBeCloseTo(150, 0);
      expect(day1!.totalExecutions).toBe(3);
      expect(day1!.failureCount).toBe(1);

      // Day 2: 1 passed, 1 failed = 50% pass rate, avg duration = 275
      const day2 = report.intervals.find((i) => i.period === '2024-03-02T00:00:00.000Z');
      expect(day2).toBeDefined();
      expect(day2!.passRate).toBe(50);
      expect(day2!.avgDuration).toBe(275);
      expect(day2!.totalExecutions).toBe(2);
      expect(day2!.failureCount).toBe(1);
    });

    it('should group results by week', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed', duration: 100, createdAt: new Date('2024-03-04T10:00:00Z'), testName: 'test-a' },
        { status: 'failed', duration: 200, createdAt: new Date('2024-03-06T10:00:00Z'), testName: 'test-b' },
        { status: 'passed', duration: 150, createdAt: new Date('2024-03-11T10:00:00Z'), testName: 'test-c' },
      ]);

      const query: ReportQuery = {
        startDate: new Date('2024-03-04T00:00:00Z'),
        endDate: new Date('2024-03-15T00:00:00Z'),
        groupBy: 'week',
      };

      const report = await service.getReport('suite-1', query);

      // Should have at least 2 weekly intervals
      expect(report.intervals.length).toBeGreaterThanOrEqual(2);

      // First week (starting March 4, which is a Monday)
      const week1 = report.intervals[0];
      expect(week1.totalExecutions).toBe(2);
      expect(week1.passRate).toBe(50);

      // Second week (starting March 11)
      const week2 = report.intervals[1];
      expect(week2.totalExecutions).toBe(1);
      expect(week2.passRate).toBe(100);
    });

    it('should group results by month', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed', duration: 100, createdAt: new Date('2024-02-15T10:00:00Z'), testName: 'test-a' },
        { status: 'failed', duration: 200, createdAt: new Date('2024-03-10T10:00:00Z'), testName: 'test-b' },
        { status: 'passed', duration: 300, createdAt: new Date('2024-03-20T10:00:00Z'), testName: 'test-c' },
      ]);

      const query: ReportQuery = {
        startDate: new Date('2024-02-01T00:00:00Z'),
        endDate: new Date('2024-03-31T00:00:00Z'),
        groupBy: 'month',
      };

      const report = await service.getReport('suite-1', query);

      const feb = report.intervals.find((i) => i.period === '2024-02-01T00:00:00.000Z');
      expect(feb).toBeDefined();
      expect(feb!.totalExecutions).toBe(1);
      expect(feb!.passRate).toBe(100);

      const mar = report.intervals.find((i) => i.period === '2024-03-01T00:00:00.000Z');
      expect(mar).toBeDefined();
      expect(mar!.totalExecutions).toBe(2);
      expect(mar!.passRate).toBe(50);
    });

    it('should default groupBy to day when not specified', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed', duration: 100, createdAt: new Date('2024-03-01T10:00:00Z'), testName: 'test-a' },
      ]);

      const query: ReportQuery = {
        startDate: new Date('2024-03-01T00:00:00Z'),
        endDate: new Date('2024-03-02T00:00:00Z'),
      };

      const report = await service.getReport('suite-1', query);

      // Should produce daily intervals
      expect(report.intervals.length).toBe(2);
    });

    it('should include topFailures sorted by failure count descending', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T10:00:00Z'), testName: 'test-a' },
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T11:00:00Z'), testName: 'test-a' },
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T12:00:00Z'), testName: 'test-b' },
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T13:00:00Z'), testName: 'test-c' },
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T14:00:00Z'), testName: 'test-c' },
        { status: 'failed', duration: 100, createdAt: new Date('2024-03-01T15:00:00Z'), testName: 'test-c' },
      ]);

      const query: ReportQuery = {
        startDate: new Date('2024-03-01T00:00:00Z'),
        endDate: new Date('2024-03-02T00:00:00Z'),
      };

      const report = await service.getReport('suite-1', query);

      expect(report.topFailures[0]).toEqual({ testName: 'test-c', failureCount: 3 });
      expect(report.topFailures[1]).toEqual({ testName: 'test-a', failureCount: 2 });
      expect(report.topFailures[2]).toEqual({ testName: 'test-b', failureCount: 1 });
    });
  });

  describe('getTopFailures', () => {
    it('should query Prisma groupBy and return top failures', async () => {
      (mockPrisma.testResult.groupBy as jest.Mock).mockResolvedValue([
        { testName: 'test-x', _count: { id: 10 } },
        { testName: 'test-y', _count: { id: 7 } },
        { testName: 'test-z', _count: { id: 3 } },
      ]);

      const result = await service.getTopFailures(
        'suite-1',
        new Date('2024-03-01T00:00:00Z'),
        new Date('2024-03-31T00:00:00Z'),
      );

      expect(result).toEqual([
        { testName: 'test-x', failureCount: 10 },
        { testName: 'test-y', failureCount: 7 },
        { testName: 'test-z', failureCount: 3 },
      ]);

      expect(mockPrisma.testResult.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['testName'],
          where: expect.objectContaining({
            status: 'failed',
          }),
          take: 5,
        }),
      );
    });

    it('should respect the limit parameter', async () => {
      (mockPrisma.testResult.groupBy as jest.Mock).mockResolvedValue([
        { testName: 'test-a', _count: { id: 5 } },
      ]);

      await service.getTopFailures(
        'suite-1',
        new Date('2024-03-01T00:00:00Z'),
        new Date('2024-03-31T00:00:00Z'),
        3,
      );

      expect(mockPrisma.testResult.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });

    it('should default limit to 5', async () => {
      (mockPrisma.testResult.groupBy as jest.Mock).mockResolvedValue([]);

      await service.getTopFailures(
        'suite-1',
        new Date('2024-03-01T00:00:00Z'),
        new Date('2024-03-31T00:00:00Z'),
      );

      expect(mockPrisma.testResult.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('cleanupExpiredResults', () => {
    it('should delete results older than retention period and return count', async () => {
      (mockPrisma.testResult.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });

      const deletedCount = await service.cleanupExpiredResults(90);

      expect(deletedCount).toBe(42);
      expect(mockPrisma.testResult.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should return 0 when no expired results exist', async () => {
      (mockPrisma.testResult.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const deletedCount = await service.cleanupExpiredResults(90);

      expect(deletedCount).toBe(0);
    });

    it('should compute the correct cutoff date', async () => {
      (mockPrisma.testResult.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const now = new Date();
      await service.cleanupExpiredResults(30);

      const call = (mockPrisma.testResult.deleteMany as jest.Mock).mock.calls[0][0];
      const cutoff = call.where.createdAt.lt as Date;

      // The cutoff should be approximately 30 days ago (allow 1 second tolerance)
      const expectedCutoff = new Date(now);
      expectedCutoff.setDate(expectedCutoff.getDate() - 30);

      expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
    });
  });
});
