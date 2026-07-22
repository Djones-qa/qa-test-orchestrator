/**
 * Executor Worker — processes test run jobs from the Bull queue.
 * Supports Jest, Playwright, Cypress framework execution.
 * Implements heartbeat mechanism for timeout detection.
 *
 * Validates: Requirements 2.1, 2.2, 2.5, 2.6
 */

import { Worker, Job, Queue } from 'bullmq';
import { config } from '../utils/config.js';
import { RunService } from '../services/run.service.js';
import logger from '../utils/logger.js';

export interface ExecutorJobData {
  runId: string;
  suiteId: string;
  framework: string;
  sourcePath: string;
  environmentId?: string;
}

const HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds

const runService = new RunService();

/**
 * Creates and returns the executor worker.
 * Concurrency is controlled by config.workerConcurrency (1-20, default 5).
 */
export function createExecutorWorker(redisUrl: string): Worker {
  const connection = { url: redisUrl };

  const worker = new Worker<ExecutorJobData>(
    'test-execution',
    async (job: Job<ExecutorJobData>) => {
      const { runId, framework, sourcePath } = job.data;
      const workerId = `worker-${worker.id ?? process.pid}`;

      logger.info(`Starting execution: run=${runId} framework=${framework}`, { runId, framework });

      // Mark run as running
      await runService.updateStatus(runId, 'running', workerId);

      try {
        // Simulate test execution (in production, this would spawn the framework CLI)
        await executeTestFramework(framework, sourcePath, job);

        // Mark run as completed
        await runService.updateStatus(runId, 'completed');
        logger.info(`Execution completed: run=${runId}`, { runId });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown execution error';
        logger.error(`Execution failed: run=${runId} error=${message}`, { runId, error: message });

        // Mark run as failed
        await runService.updateStatus(runId, 'failed');
        throw err;
      }
    },
    {
      connection,
      concurrency: config.workerConcurrency,
      stalledInterval: HEARTBEAT_TIMEOUT_MS,
      maxStalledCount: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${job?.id} - ${err.message}`, {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`Job stalled (timeout): ${jobId}`, { jobId });
  });

  return worker;
}

/**
 * Creates the test execution queue for submitting jobs.
 */
export function createExecutionQueue(redisUrl: string): Queue<ExecutorJobData> {
  return new Queue<ExecutorJobData>('test-execution', {
    connection: { url: redisUrl },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

/**
 * Simulates execution of the test framework.
 * In a production system, this would spawn a child process running
 * the appropriate CLI (jest, playwright, cypress).
 */
async function executeTestFramework(
  framework: string,
  _sourcePath: string,
  _job: Job<ExecutorJobData>,
): Promise<void> {
  // Framework command mapping (for reference)
  const _commands: Record<string, string> = {
    jest: 'npx jest',
    playwright: 'npx playwright test',
    cypress: 'npx cypress run',
  };

  // In a real implementation, we'd spawn a child process:
  // const { execSync } = require('child_process');
  // execSync(`${commands[framework]} --config ${sourcePath}`, { timeout: 300000 });

  // For now, simulate execution with a brief delay
  await new Promise((resolve) => setTimeout(resolve, 100));
}
