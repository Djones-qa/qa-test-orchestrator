/**
 * Unit tests for FlakyDetectorService.
 *
 * Uses mocked Prisma client to test the flakiness score algorithm,
 * flag transitions, pagination, and isFlaky checks.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { FlakyDetectorService } from '../../../src/services/flaky-detector';
import { prisma } from '../../../src/db/client';

// Mock the Prisma client
jest.mock('../../../src/db/client', () => ({
  prisma: {
    testResult: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    flakyTestEntry: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('FlakyDetectorService', () => {
  let service: FlakyDetectorService;

  beforeEach(() => {
    service = new FlakyDetectorService();
    jest.clearAllMocks();
  });

  describe('computeFlakinessScore', () => {
    it('should return 0 when there are no results', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      expect(score).toBe(0);
    });

    it('should return 0 when there is only one result', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed' },
      ]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      expect(score).toBe(0);
    });

    it('should return 0 for all-passing results', async () => {
      // Results come in desc order from DB, reversed by service
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
      ]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      expect(score).toBe(0);
    });

    it('should compute correct score for alternating results', async () => {
      // Alternating pass/fail: all adjacent pairs differ
      // After reverse: [P, F, P, F, P, F, P, F, P, F] → 9 transitions / 9 = 1.0
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
      ]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      expect(score).toBe(1.0);
    });

    it('should compute correct score for the design doc example', async () => {
      // Design doc example: [P, F, P, P, F, P, F, F, P, F] → 7 transitions / 9 ≈ 0.778
      // DB returns desc order, we reverse to get chronological
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
      ]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      expect(score).toBeCloseTo(7 / 9, 5);
    });

    it('should use only the most recent 10 results', async () => {
      // Even if we request 10, Prisma takes care of it
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
      ]);

      const score = await service.computeFlakinessScore('test-1', 'suite-1');
      // After reverse: [P, F, P] → 2 transitions / 2 = 1.0
      expect(score).toBe(1.0);
    });

    it('should query with correct parameters', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([]);

      await service.computeFlakinessScore('my-test', 'my-suite');

      expect(mockPrisma.testResult.findMany).toHaveBeenCalledWith({
        where: {
          testName: 'my-test',
          run: { suiteId: 'my-suite' },
          status: { in: ['passed', 'failed'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { status: true },
      });
    });
  });

  describe('processResult', () => {
    it('should create entry and not transition when fewer than 10 results', async () => {
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
      ]);
      (mockPrisma.testResult.count as jest.Mock).mockResolvedValue(3);
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.flakyTestEntry.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.processResult('test-1', 'suite-1', 'passed');

      expect(result).toBeNull();
      expect(mockPrisma.flakyTestEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isFlaky: false,
          }),
          update: expect.objectContaining({
            isFlaky: false,
          }),
        }),
      );
    });

    it('should flag as flaky when score > 0.3 and N >= 10', async () => {
      // Score = 4/9 ≈ 0.44 > 0.3
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
      ]);
      (mockPrisma.testResult.count as jest.Mock).mockResolvedValue(10);
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.flakyTestEntry.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.processResult('test-1', 'suite-1', 'passed');

      expect(result).toEqual({
        testName: 'test-1',
        suiteId: 'suite-1',
        previousState: 'stable',
        newState: 'flaky',
        score: expect.any(Number),
      });
    });

    it('should transition from flaky to stable when score = 0.0 over 10 results', async () => {
      // All same status = score 0.0
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
      ]);
      (mockPrisma.testResult.count as jest.Mock).mockResolvedValue(15);
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        testName: 'test-1',
        suiteId: 'suite-1',
        score: 0.5,
        isFlaky: true,
        lastUpdated: new Date(),
      });
      (mockPrisma.flakyTestEntry.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.processResult('test-1', 'suite-1', 'passed');

      expect(result).toEqual({
        testName: 'test-1',
        suiteId: 'suite-1',
        previousState: 'flaky',
        newState: 'stable',
        score: 0,
      });
    });

    it('should not remove flaky flag if score is not exactly 0.0', async () => {
      // One transition in 10 results = score 1/9 ≈ 0.11 (below threshold but not 0)
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
      ]);
      (mockPrisma.testResult.count as jest.Mock).mockResolvedValue(10);
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        testName: 'test-1',
        suiteId: 'suite-1',
        score: 0.5,
        isFlaky: true,
        lastUpdated: new Date(),
      });
      (mockPrisma.flakyTestEntry.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.processResult('test-1', 'suite-1', 'passed');

      // No transition — still flaky because score isn't 0.0
      expect(result).toBeNull();
      expect(mockPrisma.flakyTestEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            isFlaky: true,
          }),
        }),
      );
    });

    it('should return null when no state change occurs', async () => {
      // Already flaky, still flaky (score > 0.3)
      (mockPrisma.testResult.findMany as jest.Mock).mockResolvedValue([
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
      ]);
      (mockPrisma.testResult.count as jest.Mock).mockResolvedValue(10);
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        testName: 'test-1',
        suiteId: 'suite-1',
        score: 0.8,
        isFlaky: true,
        lastUpdated: new Date(),
      });
      (mockPrisma.flakyTestEntry.upsert as jest.Mock).mockResolvedValue({});

      const result = await service.processResult('test-1', 'suite-1', 'passed');

      expect(result).toBeNull();
    });
  });

  describe('getFlakyTests', () => {
    it('should return paginated flaky tests sorted by score descending', async () => {
      (mockPrisma.flakyTestEntry.count as jest.Mock).mockResolvedValue(2);
      (mockPrisma.flakyTestEntry.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'entry-1',
          testName: 'test-a',
          suiteId: 'suite-1',
          score: 0.9,
          isFlaky: true,
          lastUpdated: new Date('2024-01-01'),
        },
        {
          id: 'entry-2',
          testName: 'test-b',
          suiteId: 'suite-1',
          score: 0.5,
          isFlaky: true,
          lastUpdated: new Date('2024-01-02'),
        },
      ]);

      const result = await service.getFlakyTests();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.score).toBe(0.9);
      expect(result.items[1]!.score).toBe(0.5);
      expect(result.meta.totalCount).toBe(2);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('should handle cursor-based pagination', async () => {
      (mockPrisma.flakyTestEntry.count as jest.Mock).mockResolvedValue(5);
      (mockPrisma.flakyTestEntry.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'entry-3',
          testName: 'test-c',
          suiteId: 'suite-1',
          score: 0.7,
          isFlaky: true,
          lastUpdated: new Date(),
        },
        {
          id: 'entry-4',
          testName: 'test-d',
          suiteId: 'suite-1',
          score: 0.6,
          isFlaky: true,
          lastUpdated: new Date(),
        },
        // Extra item indicating more pages
        {
          id: 'entry-5',
          testName: 'test-e',
          suiteId: 'suite-1',
          score: 0.5,
          isFlaky: true,
          lastUpdated: new Date(),
        },
      ]);

      const result = await service.getFlakyTests('cursor-id', 2);

      expect(result.items).toHaveLength(2);
      expect(result.meta.nextCursor).toBe('entry-4');
      expect(result.meta.pageSize).toBe(2);
    });

    it('should clamp page size to valid range', async () => {
      (mockPrisma.flakyTestEntry.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.flakyTestEntry.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getFlakyTests(undefined, 200);

      expect(result.meta.pageSize).toBe(100);
    });
  });

  describe('isFlaky', () => {
    it('should return true when test is flagged as flaky', async () => {
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        testName: 'test-1',
        suiteId: 'suite-1',
        score: 0.5,
        isFlaky: true,
        lastUpdated: new Date(),
      });

      const result = await service.isFlaky('test-1', 'suite-1');
      expect(result).toBe(true);
    });

    it('should return false when test is not flagged as flaky', async () => {
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'entry-1',
        testName: 'test-1',
        suiteId: 'suite-1',
        score: 0.1,
        isFlaky: false,
        lastUpdated: new Date(),
      });

      const result = await service.isFlaky('test-1', 'suite-1');
      expect(result).toBe(false);
    });

    it('should return false when no entry exists', async () => {
      (mockPrisma.flakyTestEntry.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.isFlaky('test-1', 'suite-1');
      expect(result).toBe(false);
    });
  });
});
