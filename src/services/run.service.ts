/**
 * Run Service — manages TestRun lifecycle including creation,
 * status transitions, matrix-based multi-run creation, and queue
 * depth enforcement.
 *
 * Validates: Requirements 2.1, 2.3, 2.4, 2.7, 4.3
 */

import { prisma } from '../db/client';
import { config } from '../utils/config';
import { NotFoundError, QueueCapacityError } from '../utils/errors';
import type { PaginatedResult, RunStatus } from '../utils/types';
import type { TestRun } from '@prisma/client';

export interface RunFilters {
  suiteId?: string;
  status?: RunStatus;
}

export class RunService {
  /**
   * Creates a new TestRun in queued status for the given suite.
   * Optionally associates an environment configuration.
   */
  async create(suiteId: string, environmentId?: string): Promise<TestRun> {
    const run = await prisma.testRun.create({
      data: {
        suiteId,
        environmentId: environmentId ?? null,
        status: 'queued',
      },
    });
    return run;
  }

  /**
   * Gets all environment configs from the matrix entry table and
   * creates one TestRun per config. Returns array of created runs.
   */
  async createFromMatrix(suiteId: string, matrixId: string): Promise<TestRun[]> {
    const matrixEntries = await prisma.environmentMatrixEntry.findMany({
      where: { matrixId },
      select: { environmentId: true },
    });

    const runs: TestRun[] = [];
    for (const entry of matrixEntries) {
      const run = await this.create(suiteId, entry.environmentId);
      runs.push(run);
    }

    return runs;
  }

  /**
   * Find a run by ID. Throws NotFoundError if not found.
   */
  async findById(id: string): Promise<TestRun> {
    const run = await prisma.testRun.findUnique({
      where: { id },
    });

    if (!run) {
      throw new NotFoundError(
        `TestRun with id '${id}' not found`,
        'TestRun',
        id,
      );
    }

    return run;
  }

  /**
   * Cursor-based pagination with optional filters for suiteId and status.
   */
  async findAll(
    filters: RunFilters,
    cursor?: string,
    pageSize: number = 20,
  ): Promise<PaginatedResult<TestRun>> {
    const take = Math.min(Math.max(pageSize, 1), 100);

    const where: Record<string, unknown> = {};
    if (filters.suiteId) {
      where['suiteId'] = filters.suiteId;
    }
    if (filters.status) {
      where['status'] = filters.status;
    }

    const totalCount = await prisma.testRun.count({ where });

    const findArgs: {
      where: Record<string, unknown>;
      take: number;
      orderBy: { createdAt: 'asc' };
      skip?: number;
      cursor?: { id: string };
    } = {
      where,
      take: take + 1,
      orderBy: { createdAt: 'asc' as const },
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }

    const items = await prisma.testRun.findMany(findArgs);

    let nextCursor: string | null = null;
    if (items.length > take) {
      const nextItem = items.pop()!;
      nextCursor = nextItem.id;
    }

    return {
      items,
      meta: {
        totalCount,
        pageSize: take,
        nextCursor,
      },
    };
  }

  /**
   * Updates run status. On 'running', sets workerId and startedAt.
   * On 'completed' or 'failed', sets completedAt.
   */
  async updateStatus(
    id: string,
    status: RunStatus,
    workerId?: string,
  ): Promise<TestRun> {
    // Ensure the run exists first
    await this.findById(id);

    const data: Record<string, unknown> = { status };

    if (status === 'running') {
      data['workerId'] = workerId ?? null;
      data['startedAt'] = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      data['completedAt'] = new Date();
    }

    const updatedRun = await prisma.testRun.update({
      where: { id },
      data,
    });

    return updatedRun;
  }

  /**
   * Returns all runs with status 'queued' or 'running'.
   */
  async getActiveRuns(): Promise<TestRun[]> {
    return prisma.testRun.findMany({
      where: {
        status: { in: ['queued', 'running'] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Placeholder that checks queue depth (config.queueMaxDepth).
   * Throws QueueCapacityError if at max.
   * Otherwise just returns (actual Bull queue integration comes later
   * in the worker task).
   */
  async enqueue(run: TestRun): Promise<void> {
    const queuedCount = await prisma.testRun.count({
      where: { status: 'queued' },
    });

    if (queuedCount >= config.queueMaxDepth) {
      throw new QueueCapacityError(
        `Queue capacity reached: ${config.queueMaxDepth} jobs maximum. Cannot enqueue run '${run.id}'.`,
        queuedCount,
      );
    }

    // Actual Bull queue integration will be added in the worker task.
    // For now, this is a no-op beyond the capacity check.
  }
}
