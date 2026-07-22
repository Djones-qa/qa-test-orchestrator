/**
 * Unit tests for Suite Service.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { SuiteService, CreateSuiteData } from '../../../src/services/suite.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../src/utils/errors';

// --- Mock Prisma client ---

const mockTestSuite = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockTestRun = {
  count: jest.fn(),
};

jest.mock('../../../src/db/client', () => ({
  prisma: {
    testSuite: {
      findUnique: (...args: any[]) => mockTestSuite.findUnique(...args),
      findMany: (...args: any[]) => mockTestSuite.findMany(...args),
      count: (...args: any[]) => mockTestSuite.count(...args),
      create: (...args: any[]) => mockTestSuite.create(...args),
      update: (...args: any[]) => mockTestSuite.update(...args),
      delete: (...args: any[]) => mockTestSuite.delete(...args),
    },
    testRun: {
      count: (...args: any[]) => mockTestRun.count(...args),
    },
  },
}));

describe('SuiteService', () => {
  let service: SuiteService;

  beforeEach(() => {
    service = new SuiteService();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validData: CreateSuiteData = {
      name: 'My Test Suite',
      framework: 'jest',
      sourcePath: '/tests/unit',
    };

    it('should create a suite with valid data', async () => {
      mockTestSuite.findUnique.mockResolvedValue(null);
      mockTestSuite.create.mockResolvedValue({
        id: 'uuid-1',
        ...validData,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(validData);

      expect(result.name).toBe(validData.name);
      expect(result.framework).toBe(validData.framework);
      expect(result.sourcePath).toBe(validData.sourcePath);
      expect(mockTestSuite.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictError for duplicate name', async () => {
      mockTestSuite.findUnique.mockResolvedValue({ id: 'existing', name: validData.name });

      await expect(service.create(validData)).rejects.toThrow(ConflictError);
    });

    it('should throw ValidationError for empty name', async () => {
      await expect(service.create({ ...validData, name: '' })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for name exceeding 128 chars', async () => {
      const longName = 'a'.repeat(129);
      await expect(service.create({ ...validData, name: longName })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for unsupported framework', async () => {
      await expect(
        service.create({ ...validData, framework: 'mocha' as any }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for sourcePath exceeding 512 chars', async () => {
      const longPath = '/'.repeat(513);
      await expect(service.create({ ...validData, sourcePath: longPath })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError for config exceeding 10KB', async () => {
      const largeConfig: Record<string, unknown> = {};
      // Create a config that exceeds 10KB
      for (let i = 0; i < 200; i++) {
        largeConfig[`key_${i}`] = 'x'.repeat(100);
      }

      await expect(service.create({ ...validData, config: largeConfig })).rejects.toThrow(
        ValidationError,
      );
    });

    it('should accept config within 10KB', async () => {
      const smallConfig = { key: 'value' };
      mockTestSuite.findUnique.mockResolvedValue(null);
      mockTestSuite.create.mockResolvedValue({
        id: 'uuid-2',
        ...validData,
        config: smallConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create({ ...validData, config: smallConfig });
      expect(result.config).toEqual(smallConfig);
    });
  });

  describe('findById', () => {
    it('should return the suite when found', async () => {
      const suite = { id: 'uuid-1', name: 'Suite A', framework: 'jest' };
      mockTestSuite.findUnique.mockResolvedValue(suite);

      const result = await service.findById('uuid-1');
      expect(result).toEqual(suite);
    });

    it('should throw NotFoundError when not found', async () => {
      mockTestSuite.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findAll', () => {
    it('should return paginated results with default page size', async () => {
      const suites = Array.from({ length: 5 }, (_, i) => ({
        id: `uuid-${i}`,
        name: `Suite ${i}`,
        createdAt: new Date(),
      }));
      mockTestSuite.count.mockResolvedValue(5);
      mockTestSuite.findMany.mockResolvedValue(suites);

      const result = await service.findAll();

      expect(result.items).toHaveLength(5);
      expect(result.meta.totalCount).toBe(5);
      expect(result.meta.pageSize).toBe(20);
      expect(result.meta.nextCursor).toBeNull();
    });

    it('should use cursor for pagination', async () => {
      const suites = Array.from({ length: 3 }, (_, i) => ({
        id: `uuid-${i + 2}`,
        name: `Suite ${i + 2}`,
        createdAt: new Date(),
      }));
      mockTestSuite.count.mockResolvedValue(5);
      mockTestSuite.findMany.mockResolvedValue(suites);

      const result = await service.findAll('uuid-1', 2);

      expect(result.meta.pageSize).toBe(2);
      expect(mockTestSuite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'uuid-1' },
          skip: 1,
        }),
      );
    });

    it('should cap page size at 100', async () => {
      mockTestSuite.count.mockResolvedValue(0);
      mockTestSuite.findMany.mockResolvedValue([]);

      const result = await service.findAll(undefined, 200);

      expect(result.meta.pageSize).toBe(100);
    });

    it('should set minimum page size to 1', async () => {
      mockTestSuite.count.mockResolvedValue(0);
      mockTestSuite.findMany.mockResolvedValue([]);

      const result = await service.findAll(undefined, 0);

      expect(result.meta.pageSize).toBe(1);
    });

    it('should return nextCursor when more results exist', async () => {
      // Request page size 2, return 3 items (indicating more exist)
      const suites = [
        { id: 'uuid-0', name: 'Suite 0', createdAt: new Date() },
        { id: 'uuid-1', name: 'Suite 1', createdAt: new Date() },
        { id: 'uuid-2', name: 'Suite 2', createdAt: new Date() },
      ];
      mockTestSuite.count.mockResolvedValue(5);
      mockTestSuite.findMany.mockResolvedValue(suites);

      const result = await service.findAll(undefined, 2);

      expect(result.items).toHaveLength(2);
      expect(result.meta.nextCursor).toBe('uuid-1');
    });
  });

  describe('update', () => {
    const existingSuite = {
      id: 'uuid-1',
      name: 'Original Name',
      framework: 'jest',
      sourcePath: '/original/path',
      config: null,
    };

    it('should partially update only provided fields', async () => {
      mockTestSuite.findUnique
        .mockResolvedValueOnce(existingSuite) // findById
        .mockResolvedValueOnce(null); // name uniqueness check
      mockTestSuite.update.mockResolvedValue({
        ...existingSuite,
        name: 'New Name',
      });

      const result = await service.update('uuid-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockTestSuite.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { name: 'New Name' },
      });
    });

    it('should throw NotFoundError if suite does not exist', async () => {
      mockTestSuite.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when renaming to an existing name', async () => {
      mockTestSuite.findUnique
        .mockResolvedValueOnce(existingSuite) // findById
        .mockResolvedValueOnce({ id: 'uuid-other', name: 'Taken Name' }); // uniqueness check

      await expect(service.update('uuid-1', { name: 'Taken Name' })).rejects.toThrow(ConflictError);
    });

    it('should allow updating to the same name (no conflict with self)', async () => {
      mockTestSuite.findUnique
        .mockResolvedValueOnce(existingSuite) // findById
        .mockResolvedValueOnce(existingSuite); // same record by name
      mockTestSuite.update.mockResolvedValue(existingSuite);

      await expect(
        service.update('uuid-1', { name: existingSuite.name }),
      ).resolves.not.toThrow();
    });

    it('should validate updated fields', async () => {
      mockTestSuite.findUnique.mockResolvedValueOnce(existingSuite);

      await expect(service.update('uuid-1', { name: '' })).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete suite with no active runs', async () => {
      mockTestSuite.findUnique.mockResolvedValue({ id: 'uuid-1', name: 'Suite' });
      mockTestRun.count.mockResolvedValue(0);
      mockTestSuite.delete.mockResolvedValue(undefined);

      await expect(service.delete('uuid-1')).resolves.toBeUndefined();
      expect(mockTestSuite.delete).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('should throw ConflictError when active runs exist', async () => {
      mockTestSuite.findUnique.mockResolvedValue({ id: 'uuid-1', name: 'Suite' });
      mockTestRun.count.mockResolvedValue(3);

      await expect(service.delete('uuid-1')).rejects.toThrow(ConflictError);
      expect(mockTestSuite.delete).not.toHaveBeenCalled();
    });

    it('should include active run count in conflict error message', async () => {
      mockTestSuite.findUnique.mockResolvedValue({ id: 'uuid-1', name: 'Suite' });
      mockTestRun.count.mockResolvedValue(5);

      try {
        await service.delete('uuid-1');
        fail('Expected ConflictError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictError);
        expect(err.message).toContain('5');
      }
    });

    it('should throw NotFoundError for non-existent suite', async () => {
      mockTestSuite.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('hasActiveRuns', () => {
    it('should return active:false with count 0 when no active runs', async () => {
      mockTestRun.count.mockResolvedValue(0);

      const result = await service.hasActiveRuns('uuid-1');

      expect(result).toEqual({ active: false, count: 0 });
    });

    it('should return active:true with correct count', async () => {
      mockTestRun.count.mockResolvedValue(7);

      const result = await service.hasActiveRuns('uuid-1');

      expect(result).toEqual({ active: true, count: 7 });
    });

    it('should query for queued and running statuses', async () => {
      mockTestRun.count.mockResolvedValue(0);

      await service.hasActiveRuns('suite-id');

      expect(mockTestRun.count).toHaveBeenCalledWith({
        where: {
          suiteId: 'suite-id',
          status: { in: ['queued', 'running'] },
        },
      });
    });
  });
});
