/**
 * Reporter Worker — processes test results, triggers flaky detection,
 * computes pass rates, sends notifications, and broadcasts to WebSocket.
 *
 * Validates: Requirements 2.3, 3.1, 3.6, 6.2, 7.1, 7.2, 7.3
 */

import { prisma } from '../db/client.js';
import { config } from '../utils/config.js';
import { FlakyDetectorService } from '../services/flaky-detector.js';
import { notificationService } from '../services/notification.js';
import logger from '../utils/logger.js';

const flakyDetector = new FlakyDetectorService();

export interface ResultBatch {
  runId: string;
  results: Array<{
    testName: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    errorMessage?: string;
    errorStack?: string;
  }>;
}

export class ReporterWorker {
  private broadcastFn?: (event: string, data: unknown) => void;

  /**
   * Register a broadcast function for WebSocket emissions.
   */
  setBroadcast(fn: (event: string, data: unknown) => void): void {
    this.broadcastFn = fn;
  }

  /**
   * Process a batch of test results:
   * 1. Persist results to database
   * 2. Update run counters
   * 3. Run flaky detection for each result
   * 4. Check pass rate threshold
   * 5. Send notifications if needed
   * 6. Broadcast to WebSocket dashboard
   */
  async processResults(batch: ResultBatch): Promise<void> {
    const { runId, results } = batch;

    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      include: { suite: true },
    });

    if (!run) {
      logger.error(`Reporter: run not found: ${runId}`);
      return;
    }

    // 1. Persist results
    for (const result of results) {
      await prisma.testResult.create({
        data: {
          runId,
          testName: result.testName,
          status: result.status,
          duration: result.duration,
          errorMessage: result.errorMessage ?? null,
          errorStack: result.errorStack ?? null,
        },
      });

      // 2. Broadcast each result to connected dashboard clients
      this.broadcast('test:result', { runId, result });
    }

    // 3. Update run counters
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    await prisma.testRun.update({
      where: { id: runId },
      data: {
        totalTests: { increment: results.length },
        passedTests: { increment: passed },
        failedTests: { increment: failed },
        skippedTests: { increment: skipped },
      },
    });

    // 4. Flaky detection for each pass/fail result
    for (const result of results) {
      if (result.status === 'passed' || result.status === 'failed') {
        const transition = await flakyDetector.processResult(
          result.testName,
          run.suiteId,
          result.status,
        );

        // 5. Notify on flaky transitions
        if (transition) {
          await notificationService.onFlakyTransition(transition);
        }
      }
    }

    // 6. Check pass rate threshold after updating
    const updatedRun = await prisma.testRun.findUnique({ where: { id: runId } });
    if (updatedRun && updatedRun.totalTests > 0) {
      const passRate = (updatedRun.passedTests / updatedRun.totalTests) * 100;

      // Broadcast run state
      this.broadcast('run:update', {
        runId,
        status: updatedRun.status,
        totalTests: updatedRun.totalTests,
        passedTests: updatedRun.passedTests,
        failedTests: updatedRun.failedTests,
        passRate,
      });

      // Threshold breach check on completion
      if (updatedRun.status === 'completed' && passRate < config.passRateThreshold) {
        await notificationService.onThresholdBreached(run.suiteId, passRate, config.passRateThreshold);
      }

      // Notify on failures
      if (updatedRun.status === 'completed' && updatedRun.failedTests > 0) {
        await notificationService.onRunFailed({
          id: runId,
          suiteId: run.suiteId,
          totalTests: updatedRun.totalTests,
          failedTests: updatedRun.failedTests,
        });
      }
    }
  }

  private broadcast(event: string, data: unknown): void {
    if (this.broadcastFn) {
      this.broadcastFn(event, data);
    }
  }
}
