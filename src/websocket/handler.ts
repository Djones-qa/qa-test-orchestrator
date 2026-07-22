/**
 * WebSocket Handler — provides real-time dashboard connectivity
 * for live test execution monitoring.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.7
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../db/client.js';
import logger from '../utils/logger.js';

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

export class WebSocketHandler {
  private io: Server;
  private heartbeatInterval: NodeJS.Timer | null = null;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      pingInterval: HEARTBEAT_INTERVAL_MS,
      pingTimeout: 10000,
    });

    this.setupHandlers();
    this.startHeartbeat();
  }

  /**
   * Broadcast a test result to all connected clients.
   */
  broadcastResult(data: unknown): void {
    this.io.emit('test:result', data);
  }

  /**
   * Broadcast a run state change to all connected clients.
   */
  broadcastRunStateChange(data: unknown): void {
    this.io.emit('run:stateChange', data);
  }

  /**
   * Generic broadcast function for use by ReporterWorker.
   */
  broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  /**
   * Get the Socket.IO server instance.
   */
  getServer(): Server {
    return this.io;
  }

  /**
   * Clean up resources.
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval as unknown as number);
    }
    this.io.close();
  }

  // --- Private ---

  private setupHandlers(): void {
    this.io.on('connection', async (socket: Socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // Send current state of all active runs on connection
      await this.sendCurrentState(socket);

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });

      // Handle reconnection state request
      socket.on('requestState', async () => {
        await this.sendCurrentState(socket);
      });
    });
  }

  /**
   * Send current state of all active runs to a client for initial
   * connection or reconnection synchronization.
   */
  private async sendCurrentState(socket: Socket): Promise<void> {
    try {
      const activeRuns = await prisma.testRun.findMany({
        where: { status: { in: ['queued', 'running'] } },
        include: { suite: true },
        orderBy: { createdAt: 'asc' },
      });

      const state = activeRuns.map((run) => ({
        runId: run.id,
        suiteId: run.suiteId,
        suiteName: run.suite.name,
        status: run.status,
        totalTests: run.totalTests,
        passedTests: run.passedTests,
        failedTests: run.failedTests,
        passRate: run.totalTests > 0 ? (run.passedTests / run.totalTests) * 100 : 0,
        elapsedTime: run.startedAt
          ? Date.now() - run.startedAt.getTime()
          : 0,
        startedAt: run.startedAt,
        createdAt: run.createdAt,
      }));

      socket.emit('state:current', state);
    } catch (err) {
      logger.error('Failed to send current state', {
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  /**
   * Start heartbeat interval to keep connections alive.
   * Socket.IO handles this natively via pingInterval, but we add
   * an application-level heartbeat for dashboard sync.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.io.emit('heartbeat', { timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }
}
