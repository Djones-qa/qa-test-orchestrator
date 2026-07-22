/**
 * Notification Service for the QA Test Orchestrator.
 *
 * Manages notification channels (Slack/webhook), delivery with retry logic,
 * and event-driven notifications for run failures, flaky tests, threshold
 * breaches, and schedule skips.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { prisma } from '../db/client';
import { config } from '../utils/config';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { ChannelType, NotificationEvent, PaginatedResult } from '../utils/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CreateChannelData {
  name: string;
  type: ChannelType;
  url: string;
  events: NotificationEvent[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface NotificationPayload {
  event: NotificationEvent;
  suiteName: string;
  runId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface DeliveryResult {
  id: string;
  status: 'delivered' | 'failed';
  attempts: number;
  lastError?: string;
}

export interface FlakyTransition {
  testName: string;
  suiteId: string;
  previousState: 'stable' | 'flaky';
  newState: 'stable' | 'flaky';
  score: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class NotificationService {
  /**
   * Create a new NotificationChannel record.
   * Validates that the URL is well-formed HTTPS before persisting.
   */
  async createChannel(data: CreateChannelData) {
    const validationResult = this.validateUrl(data.url);
    if (!validationResult.valid) {
      throw new ValidationError('Invalid channel configuration', [
        { field: 'url', message: validationResult.error!, constraint: 'https_url' },
      ]);
    }

    const channel = await prisma.notificationChannel.create({
      data: {
        name: data.name,
        type: data.type,
        url: data.url,
        events: data.events,
        active: true,
      },
    });

    return channel;
  }

  /**
   * Validate that the URL is well-formed HTTPS and perform a test POST delivery.
   * Returns { valid: true } on success or { valid: false, error: string } on failure.
   */
  async validateAndTestChannel(
    url: string,
    _type: ChannelType,
  ): Promise<ValidationResult> {
    const urlValidation = this.validateUrl(url);
    if (!urlValidation.valid) {
      return urlValidation;
    }

    try {
      const testPayload = {
        text: 'QA Test Orchestrator: Channel connectivity test',
        event: 'test',
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `Test delivery failed with status ${response.status}`,
        };
      }

      return { valid: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown delivery error';
      return { valid: false, error: `Test delivery failed: ${message}` };
    }
  }

  /**
   * Send a notification to the specified channel with retry logic.
   * Retries up to 3 attempts with exponential backoff (1s, 2s, 4s).
   * Records each attempt in the NotificationDelivery table.
   */
  async sendNotification(
    channelId: string,
    payload: NotificationPayload,
  ): Promise<DeliveryResult> {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundError(
        `Notification channel not found: ${channelId}`,
        'NotificationChannel',
        channelId,
      );
    }

    // Create initial delivery record
    const delivery = await prisma.notificationDelivery.create({
      data: {
        channelId,
        event: payload.event,
        payload: payload as unknown as Record<string, unknown>,
        status: 'pending',
        attempts: 0,
      },
    });

    const maxAttempts = 3;
    const backoffDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(channel.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          // Mark as delivered
          await prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: 'delivered', attempts: attempt },
          });

          return {
            id: delivery.id,
            status: 'delivered',
            attempts: attempt,
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : 'Unknown delivery error';
      }

      // Update attempt count
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { attempts: attempt, lastError },
      });

      // Wait before retry (skip delay after last attempt)
      if (attempt < maxAttempts) {
        await this.delay(backoffDelays[attempt - 1]!);
      }
    }

    // All attempts failed — mark as failed
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', attempts: maxAttempts, lastError },
    });

    return {
      id: delivery.id,
      status: 'failed',
      attempts: maxAttempts,
      lastError,
    };
  }

  /**
   * Get paginated delivery history for a notification channel.
   */
  async getDeliveryHistory(
    channelId: string,
    cursor?: string,
    pageSize: number = 20,
  ): Promise<PaginatedResult<typeof deliveries[number]>> {
    type deliveries = Awaited<ReturnType<typeof prisma.notificationDelivery.findMany>>;

    const effectivePageSize = Math.min(Math.max(pageSize, 1), 100);

    const [totalCount, deliveries] = await Promise.all([
      prisma.notificationDelivery.count({ where: { channelId } }),
      prisma.notificationDelivery.findMany({
        where: { channelId },
        orderBy: { createdAt: 'desc' },
        take: effectivePageSize + 1,
        ...(cursor
          ? { cursor: { id: cursor }, skip: 1 }
          : {}),
      }),
    ]);

    const hasMore = deliveries.length > effectivePageSize;
    const items = hasMore ? deliveries.slice(0, effectivePageSize) : deliveries;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return {
      items,
      meta: {
        totalCount,
        pageSize: effectivePageSize,
        nextCursor,
      },
    };
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────────

  /**
   * Handle a failed test run. Send notification to channels subscribed to 'run.failed'.
   * Payload includes suite name, run ID, total tests, failure count, and failed test names.
   */
  async onRunFailed(run: {
    id: string;
    suiteId: string;
    totalTests: number;
    failedTests: number;
    results?: Array<{ testName: string; status: string }>;
  }): Promise<void> {
    const suite = await prisma.testSuite.findUnique({
      where: { id: run.suiteId },
    });

    if (!suite) return;

    // Get failed test names from results if not provided
    let failedTestNames: string[] = [];
    if (run.results) {
      failedTestNames = run.results
        .filter((r) => r.status === 'failed')
        .map((r) => r.testName);
    } else {
      const failedResults = await prisma.testResult.findMany({
        where: { runId: run.id, status: 'failed' },
        select: { testName: true },
      });
      failedTestNames = failedResults.map((r) => r.testName);
    }

    const payload: NotificationPayload = {
      event: 'run.failed',
      suiteName: suite.name,
      runId: run.id,
      details: {
        totalTests: run.totalTests,
        failureCount: run.failedTests,
        failedTestNames,
      },
      timestamp: new Date(),
    };

    await this.sendToSubscribedChannels('run.failed', payload);
  }

  /**
   * Handle a flaky test state transition. Send to channels subscribed
   * to 'flaky.detected' or 'flaky.resolved'.
   */
  async onFlakyTransition(transition: FlakyTransition): Promise<void> {
    const suite = await prisma.testSuite.findFirst({
      where: { id: transition.suiteId },
    });

    const suiteName = suite?.name ?? 'Unknown Suite';
    const event: NotificationEvent =
      transition.newState === 'flaky' ? 'flaky.detected' : 'flaky.resolved';

    const payload: NotificationPayload = {
      event,
      suiteName,
      details: {
        testName: transition.testName,
        suiteId: transition.suiteId,
        previousState: transition.previousState,
        newState: transition.newState,
        flakinessScore: transition.score,
      },
      timestamp: new Date(),
    };

    await this.sendToSubscribedChannels(event, payload);
  }

  /**
   * Handle a pass rate threshold breach. Send to channels subscribed
   * to 'threshold.breached'.
   */
  async onThresholdBreached(
    suiteId: string,
    passRate: number,
    threshold: number,
  ): Promise<void> {
    const suite = await prisma.testSuite.findUnique({
      where: { id: suiteId },
    });

    const suiteName = suite?.name ?? 'Unknown Suite';

    const payload: NotificationPayload = {
      event: 'threshold.breached',
      suiteName,
      details: {
        suiteId,
        passRate,
        threshold,
        configuredThreshold: config.passRateThreshold,
      },
      timestamp: new Date(),
    };

    await this.sendToSubscribedChannels('threshold.breached', payload);
  }

  /**
   * Handle a skipped schedule execution. Send to channels subscribed
   * to 'schedule.skipped'.
   */
  async onScheduleSkipped(scheduleId: string, reason: string): Promise<void> {
    // Fetch the schedule to get the suite name
    const schedule = await prisma.executionSchedule.findUnique({
      where: { id: scheduleId },
      include: { suite: true },
    });

    const suiteName = schedule?.suite?.name ?? 'Unknown Suite';

    const payload: NotificationPayload = {
      event: 'schedule.skipped',
      suiteName,
      details: {
        scheduleId,
        reason,
      },
      timestamp: new Date(),
    };

    await this.sendToSubscribedChannels('schedule.skipped', payload);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validate a URL is well-formed HTTPS.
   */
  private validateUrl(url: string): ValidationResult {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { valid: false, error: 'URL must use HTTPS protocol' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Send a notification payload to all active channels subscribed to the given event.
   */
  private async sendToSubscribedChannels(
    event: NotificationEvent,
    payload: NotificationPayload,
  ): Promise<void> {
    const channels = await prisma.notificationChannel.findMany({
      where: {
        active: true,
        events: { has: event },
      },
    });

    const deliveryPromises = channels.map((channel) =>
      this.sendNotification(channel.id, payload).catch(() => {
        // Individual delivery failures are recorded in the delivery table;
        // we don't want one channel failure to prevent others from receiving.
      }),
    );

    await Promise.all(deliveryPromises);
  }

  /**
   * Async delay helper for exponential backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const notificationService = new NotificationService();
