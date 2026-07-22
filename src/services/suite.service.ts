/**
 * Suite Service — manages TestSuite CRUD operations with validation,
 * cursor-based pagination, and active-run protection on deletion.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { prisma } from '../db/client';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import type { FieldError, PaginatedResult } from '../utils/types';

// --- Input types ---

export interface CreateSuiteData {
  name: string;
  framework: 'jest' | 'playwright' | 'cypress';
  sourcePath: string;
  config?: Record<string, unknown> | null;
}

export type UpdateSuiteData = Partial<CreateSuiteData>;

// --- Validation helpers ---

const SUPPORTED_FRAMEWORKS = ['jest', 'playwright', 'cypress'] as const;
const MAX_NAME_LENGTH = 128;
const MAX_SOURCE_PATH_LENGTH = 512;
const MAX_CONFIG_SIZE_BYTES = 10 * 1024; // 10KB

function validateSuiteData(data: CreateSuiteData | UpdateSuiteData, isUpdate = false): void {
  const errors: FieldError[] = [];

  if (!isUpdate) {
    // Required fields check for creation
    if (!('name' in data) || data.name === undefined || data.name === null) {
      errors.push({ field: 'name', message: 'Name is required', constraint: 'required' });
    }
    if (!('framework' in data) || data.framework === undefined || data.framework === null) {
      errors.push({ field: 'framework', message: 'Framework is required', constraint: 'required' });
    }
    if (!('sourcePath' in data) || data.sourcePath === undefined || data.sourcePath === null) {
      errors.push({ field: 'sourcePath', message: 'Source path is required', constraint: 'required' });
    }
  }

  // Validate name if provided
  if (data.name !== undefined && data.name !== null) {
    if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > MAX_NAME_LENGTH) {
      errors.push({
        field: 'name',
        message: `Name must be between 1 and ${MAX_NAME_LENGTH} characters`,
        constraint: 'length',
      });
    }
  }

  // Validate framework if provided
  if (data.framework !== undefined && data.framework !== null) {
    if (!SUPPORTED_FRAMEWORKS.includes(data.framework as any)) {
      errors.push({
        field: 'framework',
        message: `Framework must be one of: ${SUPPORTED_FRAMEWORKS.join(', ')}`,
        constraint: 'enum',
      });
    }
  }

  // Validate sourcePath if provided
  if (data.sourcePath !== undefined && data.sourcePath !== null) {
    if (typeof data.sourcePath !== 'string' || data.sourcePath.length > MAX_SOURCE_PATH_LENGTH) {
      errors.push({
        field: 'sourcePath',
        message: `Source path must not exceed ${MAX_SOURCE_PATH_LENGTH} characters`,
        constraint: 'maxLength',
      });
    }
  }

  // Validate config size if provided
  if (data.config !== undefined && data.config !== null) {
    const configSize = Buffer.byteLength(JSON.stringify(data.config), 'utf-8');
    if (configSize > MAX_CONFIG_SIZE_BYTES) {
      errors.push({
        field: 'config',
        message: `Config must not exceed ${MAX_CONFIG_SIZE_BYTES} bytes (10KB)`,
        constraint: 'maxSize',
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

// --- Service class ---

export class SuiteService {
  /**
   * Creates a new TestSuite. Enforces name uniqueness and field constraints.
   */
  async create(data: CreateSuiteData): Promise<any> {
    validateSuiteData(data, false);

    // Check name uniqueness
    const existing = await (prisma as any).testSuite.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictError(`A test suite with name "${data.name}" already exists`, 'TestSuite', data.name);
    }

    const suite = await (prisma as any).testSuite.create({
      data: {
        name: data.name,
        framework: data.framework,
        sourcePath: data.sourcePath,
        config: data.config ?? undefined,
      },
    });

    return suite;
  }

  /**
   * Find a single TestSuite by ID. Throws NotFoundError if not found.
   */
  async findById(id: string): Promise<any> {
    const suite = await (prisma as any).testSuite.findUnique({
      where: { id },
    });

    if (!suite) {
      throw new NotFoundError(`Test suite with id "${id}" not found`, 'TestSuite', id);
    }

    return suite;
  }

  /**
   * List all TestSuites with cursor-based pagination.
   * Default page size is 20, maximum is 100.
   */
  async findAll(cursor?: string, pageSize?: number): Promise<PaginatedResult<any>> {
    const effectivePageSize = Math.min(Math.max(pageSize ?? 20, 1), 100);

    const totalCount = await (prisma as any).testSuite.count();

    const queryArgs: any = {
      take: effectivePageSize + 1, // Fetch one extra to determine if there's a next page
      orderBy: { createdAt: 'asc' },
    };

    if (cursor) {
      queryArgs.cursor = { id: cursor };
      queryArgs.skip = 1; // Skip the cursor item itself
    }

    const suites = await (prisma as any).testSuite.findMany(queryArgs);

    const hasMore = suites.length > effectivePageSize;
    const items = hasMore ? suites.slice(0, effectivePageSize) : suites;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items,
      meta: {
        totalCount,
        pageSize: effectivePageSize,
        nextCursor,
      },
    };
  }

  /**
   * Partially updates a TestSuite. Only modifies provided fields.
   * Validates the same rules as creation.
   */
  async update(id: string, data: UpdateSuiteData): Promise<any> {
    // Ensure suite exists
    await this.findById(id);

    // Validate provided fields
    validateSuiteData(data, true);

    // If name is being changed, check uniqueness
    if (data.name !== undefined) {
      const existing = await (prisma as any).testSuite.findUnique({
        where: { name: data.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictError(`A test suite with name "${data.name}" already exists`, 'TestSuite', data.name);
      }
    }

    // Build update payload with only provided fields
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.framework !== undefined) updateData.framework = data.framework;
    if (data.sourcePath !== undefined) updateData.sourcePath = data.sourcePath;
    if (data.config !== undefined) updateData.config = data.config;

    const updated = await (prisma as any).testSuite.update({
      where: { id },
      data: updateData,
    });

    return updated;
  }

  /**
   * Deletes a TestSuite. Rejects if active runs exist (queued or running status).
   * Otherwise performs cascade delete of the suite and all related data.
   */
  async delete(id: string): Promise<void> {
    // Ensure suite exists
    await this.findById(id);

    // Check for active runs
    const { active, count } = await this.hasActiveRuns(id);

    if (active) {
      throw new ConflictError(
        `Cannot delete test suite: ${count} active run(s) (queued or running) exist`,
        'TestSuite',
        id,
      );
    }

    // Cascade delete — Prisma's onDelete: Cascade handles TestRun → TestResult
    await (prisma as any).testSuite.delete({
      where: { id },
    });
  }

  /**
   * Checks whether a suite has active runs (queued or running).
   * Returns the active status and the count.
   */
  async hasActiveRuns(id: string): Promise<{ active: boolean; count: number }> {
    const count = await (prisma as any).testRun.count({
      where: {
        suiteId: id,
        status: { in: ['queued', 'running'] },
      },
    });

    return { active: count > 0, count };
  }
}

// Export a default singleton instance
export const suiteService = new SuiteService();
