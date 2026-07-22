/**
 * Flaky Test Detector Service.
 *
 * Implements a sliding-window transition ratio algorithm to detect flaky tests.
 * A test is considered flaky when its flakiness score exceeds 0.3 over at least
 * 10 executions. The score is computed as the number of pass/fail transitions
 * divided by (window size - 1).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { prisma } from '../db/client';
import { PaginatedResult } from '../utils/types';

// --- Interfaces ---

export interface FlakyTransition {
  testName: string;
  suiteId: string;
  previousState: 'stable' | 'flaky';
  newState: 'stable' | 'flaky';
  score: number;
}

export interface FlakyTest {
  id: string;
  testName: string;
  suiteId: string;
  score: number;
  isFlaky: boolean;
  lastUpdated: Date;
}

// --- Constants ---

const WINDOW_SIZE = 10;
const FLAKY_THRESHOLD = 0.3;

// --- Service ---

export class FlakyDetectorService {
  /**
   * Computes flakiness score for a test case based on the most recent
   * N executions (max 10). Score = transitions / (min(N, 10) - 1).
   * A transition occurs when consecutive results differ (pass→fail or fail→pass).
   */
  async computeFlakinessScore(testName: string, suiteId: string): Promise<number> {
    const results = await this.getRecentResults(testName, suiteId);

    if (results.length <= 1) {
      return 0;
    }

    const windowResults = results.slice(0, Math.min(results.length, WINDOW_SIZE));
    const transitions = this.countTransitions(windowResults);
    const denominator = windowResults.length - 1;

    return transitions / denominator;
  }

  /**
   * Called after each result recording. Updates score and manages
   * flaky flag transitions.
   *
   * Returns a FlakyTransition when the test transitions between
   * stable and flaky states, or null if no transition occurred.
   */
  async processResult(
    testName: string,
    suiteId: string,
    status: 'passed' | 'failed',
  ): Promise<FlakyTransition | null> {
    // Compute the new flakiness score
    const score = await this.computeFlakinessScore(testName, suiteId);

    // Get the total number of results for this test
    const totalResults = await this.getResultCount(testName, suiteId);

    // Determine if the test should be flagged as flaky
    const shouldBeFlaky = score > FLAKY_THRESHOLD && totalResults >= WINDOW_SIZE;

    // Determine if the test should have its flaky flag removed:
    // Score must be exactly 0.0 AND we need 10 consecutive identical results
    const shouldRemoveFlaky = score === 0.0 && totalResults >= WINDOW_SIZE;

    // Get or create the FlakyTestEntry
    const existingEntry = await prisma.flakyTestEntry.findUnique({
      where: { testName_suiteId: { testName, suiteId } },
    });

    const previousState: 'stable' | 'flaky' = existingEntry?.isFlaky ? 'flaky' : 'stable';

    let newIsFlaky: boolean;
    if (shouldBeFlaky) {
      newIsFlaky = true;
    } else if (shouldRemoveFlaky && existingEntry?.isFlaky) {
      newIsFlaky = false;
    } else {
      // Keep current state
      newIsFlaky = existingEntry?.isFlaky ?? false;
    }

    // Upsert the FlakyTestEntry
    await prisma.flakyTestEntry.upsert({
      where: { testName_suiteId: { testName, suiteId } },
      create: {
        testName,
        suiteId,
        score,
        isFlaky: newIsFlaky,
        lastUpdated: new Date(),
      },
      update: {
        score,
        isFlaky: newIsFlaky,
        lastUpdated: new Date(),
      },
    });

    // Determine if a transition occurred
    const newState: 'stable' | 'flaky' = newIsFlaky ? 'flaky' : 'stable';

    if (previousState !== newState) {
      return {
        testName,
        suiteId,
        previousState,
        newState,
        score,
      };
    }

    return null;
  }

  /**
   * Returns paginated list of flagged flaky tests sorted by score descending.
   */
  async getFlakyTests(cursor?: string, pageSize: number = 20): Promise<PaginatedResult<FlakyTest>> {
    const take = Math.min(Math.max(pageSize, 1), 100);

    const totalCount = await prisma.flakyTestEntry.count({
      where: { isFlaky: true },
    });

    const queryOptions: {
      where: { isFlaky: boolean };
      orderBy: { score: 'desc' };
      take: number;
      skip?: number;
      cursor?: { id: string };
    } = {
      where: { isFlaky: true },
      orderBy: { score: 'desc' as const },
      take: take + 1, // Fetch one extra to determine if there's a next page
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1; // Skip the cursor item itself
    }

    const entries = await prisma.flakyTestEntry.findMany(queryOptions);

    const hasNextPage = entries.length > take;
    const items = entries.slice(0, take);
    const nextCursor = hasNextPage ? items[items.length - 1]!.id : null;

    return {
      items: items.map((entry) => ({
        id: entry.id,
        testName: entry.testName,
        suiteId: entry.suiteId,
        score: entry.score,
        isFlaky: entry.isFlaky,
        lastUpdated: entry.lastUpdated,
      })),
      meta: {
        totalCount,
        pageSize: take,
        nextCursor,
      },
    };
  }

  /**
   * Returns whether a test is currently flagged as flaky.
   */
  async isFlaky(testName: string, suiteId: string): Promise<boolean> {
    const entry = await prisma.flakyTestEntry.findUnique({
      where: { testName_suiteId: { testName, suiteId } },
    });

    return entry?.isFlaky ?? false;
  }

  // --- Private Helpers ---

  /**
   * Fetches the most recent test results for a given test+suite,
   * limited to the window size (10), ordered chronologically (oldest first).
   */
  private async getRecentResults(
    testName: string,
    suiteId: string,
  ): Promise<{ status: string }[]> {
    // Get the most recent results ordered by createdAt descending, then reverse
    // to get chronological order for transition counting
    const results = await prisma.testResult.findMany({
      where: {
        testName,
        run: { suiteId },
        status: { in: ['passed', 'failed'] }, // Skip 'skipped' results for flakiness
      },
      orderBy: { createdAt: 'desc' },
      take: WINDOW_SIZE,
      select: { status: true },
    });

    // Reverse to get chronological order (oldest first)
    return results.reverse();
  }

  /**
   * Gets the total count of relevant results for a test+suite.
   */
  private async getResultCount(testName: string, suiteId: string): Promise<number> {
    return prisma.testResult.count({
      where: {
        testName,
        run: { suiteId },
        status: { in: ['passed', 'failed'] },
      },
    });
  }

  /**
   * Counts transitions in an ordered sequence of results.
   * A transition is when adjacent results differ in status.
   */
  private countTransitions(results: { status: string }[]): number {
    let transitions = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i]!.status !== results[i - 1]!.status) {
        transitions++;
      }
    }
    return transitions;
  }
}
