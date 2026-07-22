/**
 * Metrics / Reporting Service for the QA Test Orchestrator.
 *
 * Provides historical report aggregation, top failure ranking,
 * and retention-based cleanup of expired test results.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import prisma from '../db/client.js';
import { config } from '../utils/config.js';
import { ValidationError } from '../utils/errors.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ReportQuery {
  startDate: Date;
  endDate: Date;
  groupBy?: 'day' | 'week' | 'month'; // default: 'day'
}

export interface IntervalData {
  period: string; // ISO date string for start of interval
  passRate: number; // 0-100
  avgDuration: number; // milliseconds
  totalExecutions: number;
  failureCount: number;
}

export interface TopFailure {
  testName: string;
  failureCount: number;
}

export interface ReportSummary {
  intervals: IntervalData[];
  topFailures: TopFailure[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class MetricsService {
  /**
   * Generates a historical report for a test suite over a date range,
   * grouped by the specified interval (day, week, or month).
   *
   * Validates date range: endDate must be after startDate and the range
   * must not exceed the configured retention period.
   *
   * Returns empty dataset with zero-valued aggregates for ranges with no data.
   */
  async getReport(suiteId: string, query: ReportQuery): Promise<ReportSummary> {
    const groupBy = query.groupBy ?? 'day';

    this.validateDateRange(query.startDate, query.endDate);

    // Fetch all test results for the suite within the date range
    const results = await prisma.testResult.findMany({
      where: {
        run: { suiteId },
        createdAt: {
          gte: query.startDate,
          lte: query.endDate,
        },
      },
      select: {
        status: true,
        duration: true,
        createdAt: true,
        testName: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group results into intervals
    const intervals = this.groupByInterval(results, groupBy, query.startDate, query.endDate);

    // Get top failures
    const topFailures = this.computeTopFailures(results, 5);

    return { intervals, topFailures };
  }

  /**
   * Returns the top N test cases with the highest failure count
   * within the specified date range for a suite.
   */
  async getTopFailures(
    suiteId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 5,
  ): Promise<TopFailure[]> {
    const results = await prisma.testResult.groupBy({
      by: ['testName'],
      where: {
        run: { suiteId },
        status: 'failed',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    return results.map((r: { testName: string; _count: { id: number } }) => ({
      testName: r.testName,
      failureCount: r._count.id,
    }));
  }

  /**
   * Deletes TestResults older than the specified retention period.
   * Returns the count of deleted records.
   */
  async cleanupExpiredResults(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.testResult.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validates that the date range is valid:
   * - endDate must be strictly after startDate
   * - Range must not exceed the configured retention period
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    if (endDate <= startDate) {
      throw new ValidationError('Invalid date range', [
        {
          field: 'endDate',
          message: 'End date must be after start date',
          constraint: 'dateRange',
        },
      ]);
    }

    const rangeDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (rangeDays > config.retentionDays) {
      throw new ValidationError('Invalid date range', [
        {
          field: 'dateRange',
          message: `Date range exceeds retention period of ${config.retentionDays} days`,
          constraint: 'retentionPeriod',
        },
      ]);
    }
  }

  /**
   * Groups test results into time intervals and computes aggregates.
   * Returns empty intervals with zero values for periods with no data.
   */
  private groupByInterval(
    results: Array<{ status: string; duration: number; createdAt: Date; testName: string }>,
    groupBy: 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date,
  ): IntervalData[] {
    // Generate all interval boundaries
    const intervalStarts = this.generateIntervalStarts(groupBy, startDate, endDate);

    // Create a map from interval start ISO string to results in that interval
    const intervalMap = new Map<string, Array<{ status: string; duration: number }>>();
    for (const start of intervalStarts) {
      intervalMap.set(start.toISOString(), []);
    }

    // Assign each result to its interval bucket
    for (const result of results) {
      const intervalStart = this.getIntervalStart(result.createdAt, groupBy);
      const key = intervalStart.toISOString();
      const bucket = intervalMap.get(key);
      if (bucket) {
        bucket.push({ status: result.status, duration: result.duration });
      }
    }

    // Compute aggregates for each interval
    return intervalStarts.map((start) => {
      const key = start.toISOString();
      const bucket = intervalMap.get(key) ?? [];

      if (bucket.length === 0) {
        return {
          period: key,
          passRate: 0,
          avgDuration: 0,
          totalExecutions: 0,
          failureCount: 0,
        };
      }

      const total = bucket.length;
      const passed = bucket.filter((r) => r.status === 'passed').length;
      const failed = bucket.filter((r) => r.status === 'failed').length;
      const totalDuration = bucket.reduce((sum, r) => sum + r.duration, 0);

      return {
        period: key,
        passRate: (passed / total) * 100,
        avgDuration: totalDuration / total,
        totalExecutions: total,
        failureCount: failed,
      };
    });
  }

  /**
   * Generates an array of interval start dates covering the full range.
   */
  private generateIntervalStarts(
    groupBy: 'day' | 'week' | 'month',
    startDate: Date,
    endDate: Date,
  ): Date[] {
    const starts: Date[] = [];
    let current = this.getIntervalStart(startDate, groupBy);

    while (current <= endDate) {
      starts.push(new Date(current));
      current = this.advanceInterval(current, groupBy);
    }

    return starts;
  }

  /**
   * Returns the start of the interval containing the given date.
   */
  private getIntervalStart(date: Date, groupBy: 'day' | 'week' | 'month'): Date {
    const d = new Date(date);

    switch (groupBy) {
      case 'day':
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

      case 'week': {
        // Start of week (Monday)
        const dayOfWeek = d.getUTCDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
        return monday;
      }

      case 'month':
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }
  }

  /**
   * Advances the date by one interval unit.
   */
  private advanceInterval(date: Date, groupBy: 'day' | 'week' | 'month'): Date {
    const d = new Date(date);

    switch (groupBy) {
      case 'day':
        d.setUTCDate(d.getUTCDate() + 1);
        return d;

      case 'week':
        d.setUTCDate(d.getUTCDate() + 7);
        return d;

      case 'month':
        d.setUTCMonth(d.getUTCMonth() + 1);
        return d;
    }
  }

  /**
   * Computes the top N test cases with the highest failure count from in-memory results.
   */
  private computeTopFailures(
    results: Array<{ status: string; testName: string }>,
    limit: number,
  ): TopFailure[] {
    const failureCounts = new Map<string, number>();

    for (const result of results) {
      if (result.status === 'failed') {
        failureCounts.set(result.testName, (failureCounts.get(result.testName) ?? 0) + 1);
      }
    }

    return Array.from(failureCounts.entries())
      .map(([testName, failureCount]) => ({ testName, failureCount }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, limit);
  }
}
