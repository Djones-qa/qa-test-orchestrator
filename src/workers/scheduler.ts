/**
 * Scheduler Worker — manages cron-based and event-driven test execution.
 * Uses Bull repeatable jobs for cron scheduling.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { Queue } from 'bullmq';
import { prisma } from '../db/client.js';
import { RunService } from '../services/run.service.js';
import { notificationService } from '../services/notification.js';
import { QueueCapacityError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import type { ExecutorJobData } from './executor.js';

const runService = new RunService();

export class SchedulerWorker {
  private executionQueue: Queue<ExecutorJobData>;

  constructor(executionQueue: Queue<ExecutorJobData>) {
    this.executionQueue = executionQueue;
  }

  /**
   * Initialize all active cron schedules by registering them as
   * repeatable Bull jobs.
   */
  async initialize(): Promise<void> {
    const schedules = await prisma.executionSchedule.findMany({
      where: { active: true, type: 'cron' },
      include: { suite: true },
    });

    for (const schedule of schedules) {
      if (schedule.cronExpression) {
        await this.registerCronJob(schedule.id, schedule.cronExpression, schedule.suiteId);
      }
    }

    logger.info(`Scheduler initialized with ${schedules.length} active cron schedules`);
  }

  /**
   * Register a cron job for a schedule.
   */
  async registerCronJob(scheduleId: string, cronExpression: string, suiteId: string): Promise<void> {
    await this.executionQueue.add(
      `schedule-${scheduleId}`,
      { runId: '', suiteId, framework: '', sourcePath: '' },
      {
        repeat: { pattern: cronExpression },
        jobId: `schedule-${scheduleId}`,
      },
    );
  }

  /**
   * Create a schedule and register its cron job if type is cron.
   */
  async createSchedule(scheduleId: string, cronExpression: string | null, suiteId: string): Promise<void> {
    if (cronExpression) {
      await this.registerCronJob(scheduleId, cronExpression, suiteId);
    }
  }

  /**
   * Pause a schedule by removing its repeatable job.
   */
  async pauseSchedule(scheduleId: string): Promise<void> {
    await this.executionQueue.removeRepeatableByKey(`schedule-${scheduleId}`);
    logger.info(`Schedule paused: ${scheduleId}`);
  }

  /**
   * Resume a schedule by re-registering its repeatable job.
   */
  async resumeSchedule(scheduleId: string): Promise<void> {
    const schedule = await prisma.executionSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (schedule?.cronExpression) {
      await this.registerCronJob(scheduleId, schedule.cronExpression, schedule.suiteId);
      logger.info(`Schedule resumed: ${scheduleId}`);
    }
  }

  /**
   * Delete a schedule and remove its repeatable job.
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.executionQueue.removeRepeatableByKey(`schedule-${scheduleId}`);
    logger.info(`Schedule deleted: ${scheduleId}`);
  }

  /**
   * Handle an incoming webhook event. Finds matching event-driven schedules
   * and triggers their test runs.
   */
  async handleWebhookEvent(pattern: string): Promise<void> {
    const schedules = await prisma.executionSchedule.findMany({
      where: {
        active: true,
        type: 'event',
        webhookPattern: pattern,
      },
      include: { suite: true },
    });

    for (const schedule of schedules) {
      await this.triggerScheduledRun(schedule.id, schedule.suiteId, schedule.matrixId);
    }
  }

  /**
   * Trigger a scheduled test run. Handles queue capacity errors
   * by skipping and notifying.
   */
  private async triggerScheduledRun(
    scheduleId: string,
    suiteId: string,
    matrixId: string | null,
  ): Promise<void> {
    try {
      if (matrixId) {
        const runs = await runService.createFromMatrix(suiteId, matrixId);
        for (const run of runs) {
          await runService.enqueue(run);
        }
      } else {
        const run = await runService.create(suiteId);
        await runService.enqueue(run);
      }

      // Update last triggered time
      await prisma.executionSchedule.update({
        where: { id: scheduleId },
        data: { lastTriggeredAt: new Date() },
      });
    } catch (err) {
      if (err instanceof QueueCapacityError) {
        logger.warn(`Scheduled run skipped due to queue capacity: schedule=${scheduleId}`);
        await notificationService.onScheduleSkipped(scheduleId, 'Queue capacity reached');
      } else {
        throw err;
      }
    }
  }
}
