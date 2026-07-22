# Architecture

## System Overview

The QA Test Orchestrator is a backend platform built with Node.js and TypeScript. It follows a layered architecture pattern separating concerns across API, service, and data layers.

## Components

### API Layer (Express.js)
- RESTful endpoints mounted under `/api/v1`
- Middleware chain: CORS → Helmet → Morgan → Auth → Rate Limit → Validation → Handler → Error Handler
- Consistent JSON envelope responses
- Cursor-based pagination for all list endpoints

### Service Layer
- **SuiteService** — Test suite CRUD with validation and uniqueness constraints
- **RunService** — Run lifecycle management, queue depth enforcement, matrix expansion
- **FlakyDetectorService** — Sliding-window transition analysis (window=10, threshold=0.3)
- **MetricsService** — Historical aggregation, top failures, retention cleanup
- **NotificationService** — Channel management, delivery with retry (3 attempts, exponential backoff)

### Worker Layer (BullMQ)
- **ExecutorWorker** — Processes test execution jobs, configurable concurrency (1–20)
- **SchedulerWorker** — Manages cron-based repeatable jobs and webhook triggers
- **ReporterWorker** — Processes results, chains flaky detection → notification → WebSocket broadcast

### Data Layer
- **PostgreSQL** — Primary data store via Prisma ORM
- **Redis** — Job queue backing store (BullMQ), rate limiting state

### Real-Time Layer (Socket.IO)
- WebSocket connections for live dashboard updates
- Broadcasts: test results, run state changes, heartbeat
- Full state sync on connection/reconnection

## Data Flow

### Test Execution Flow
```
1. Client → POST /runs (with suiteId)
2. RunService → creates TestRun in 'queued' status
3. RunService.enqueue() → adds job to BullMQ queue
4. ExecutorWorker picks up job → marks run 'running'
5. Executor spawns framework CLI (jest/playwright/cypress)
6. Results submitted → ReporterWorker processes batch
7. ReporterWorker → persists results, runs flaky detection
8. Notifications sent if thresholds breached
9. WebSocket broadcasts live updates to dashboard
10. Run marked 'completed' or 'failed'
```

### Flaky Detection Flow
```
1. TestResult recorded
2. FlakyDetector fetches last 10 results for test+suite
3. Computes score = transitions / (window_size - 1)
4. If score > 0.3 AND executions >= 10 → flag as flaky
5. If score = 0.0 AND executions >= 10 → remove flaky flag
6. On state transition → emit notification event
```

### Scheduling Flow
```
1. Schedule created with cron expression
2. SchedulerWorker registers BullMQ repeatable job
3. At each cron interval, job fires
4. SchedulerWorker creates TestRun and enqueues
5. If queue at capacity → skip execution, notify, log
```

## Database Schema

Key models and relationships:
- **TestSuite** → has many TestRuns, ExecutionSchedules
- **TestRun** → belongs to TestSuite, has many TestResults
- **TestResult** → belongs to TestRun
- **EnvironmentConfig** → referenced by TestRuns
- **EnvironmentMatrix** → collection of EnvironmentConfigs via join table
- **FlakyTestEntry** → unique per (testName, suiteId)
- **NotificationChannel** → has many NotificationDeliveries

## Security

- Bearer token authentication on all API endpoints
- Rate limiting: 100 requests/minute per client
- Helmet security headers
- Input validation via Zod schemas
- HTTPS-only webhook URLs
- No internal details exposed in error responses

## Scalability Considerations

- Worker concurrency is configurable (1–20)
- Queue depth limits prevent runaway job accumulation
- Cursor-based pagination avoids offset performance issues
- Redis-backed rate limiting supports horizontal scaling
- Stateless API servers can be scaled behind a load balancer
