# QA Test Orchestrator

[![CI](https://github.com/Djones-qa/qa-test-orchestrator/actions/workflows/ci.yaml/badge.svg)](https://github.com/Djones-qa/qa-test-orchestrator/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A test orchestration platform that manages, schedules, and reports on automated test suites across multiple environments. Built for QA engineers who need visibility into test health, flaky test detection, and parallel execution management.

## Author

**Darrius Jones**
- GitHub: [@Djones-qa](https://github.com/Djones-qa)
- LinkedIn: [darrius-jones-28226b350](https://linkedin.com/in/darrius-jones-28226b350)

## Features

- **Test Suite Management** — Register and manage Jest, Playwright, and Cypress test suites with full CRUD API
- **Parallel Execution** — Run tests concurrently across multiple workers with configurable concurrency (1–20 workers)
- **Flaky Test Detection** — Automatic detection using sliding-window transition analysis with configurable thresholds
- **Environment Matrix** — Define target environments (browser, OS, runtime) and run suites across all combinations
- **Execution Scheduling** — Cron-based and webhook-triggered automatic test execution
- **Real-Time Dashboard** — WebSocket-powered live updates of test execution progress
- **Notifications** — Slack and webhook alerts for failures, flaky tests, and threshold breaches with retry logic
- **Historical Reporting** — Time-series analytics with pass rate trends, duration metrics, and top failure ranking

## Tech Stack

- **Runtime:** Node.js 20, TypeScript (strict mode)
- **Framework:** Express.js
- **Database:** PostgreSQL 15 (Prisma ORM)
- **Queue:** Bull/BullMQ with Redis 7
- **WebSocket:** Socket.IO
- **Validation:** Zod
- **Testing:** Jest, fast-check (property-based)
- **CI/CD:** GitHub Actions
- **Containerization:** Docker + Docker Compose

## Quick Start (Docker Compose)

```bash
# Clone the repository
git clone https://github.com/Djones-qa/qa-test-orchestrator.git
cd qa-test-orchestrator

# Start all services (app + PostgreSQL + Redis)
docker compose up -d

# Run database migrations
docker compose exec app npx prisma migrate deploy

# The API is now available at http://localhost:3000/api/v1
```

## Development Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start PostgreSQL and Redis (via Docker)
docker compose up postgres redis -d

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

## API Overview

All endpoints are prefixed with `/api/v1` and require Bearer token authentication.

| Resource | Endpoints |
|----------|-----------|
| Test Suites | `POST/GET/PUT/DELETE /suites` |
| Test Runs | `POST/GET /runs` |
| Test Results | `POST/GET /results` |
| Environments | `POST/GET/PUT/DELETE /environments` |
| Env Matrices | `POST/GET/DELETE /environments/matrix` |
| Schedules | `POST/GET/PUT/DELETE /schedules` |
| Notifications | `POST/GET/PUT/DELETE /notifications/channels` |
| Reports | `GET /reports/suites/:id/summary` |
| Flaky Tests | `GET /flaky` |
| Health | `GET /health` (no auth) |

### Response Envelope

All responses follow a consistent structure:

```json
{
  "status": "success",
  "data": { ... },
  "error": null,
  "meta": { "totalCount": 50, "pageSize": 20, "nextCursor": "..." }
}
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Clients                         │
│  (CI/CD, Dashboard, Webhooks)                    │
└──────────┬───────────────────────┬───────────────┘
           │ REST API              │ WebSocket
           ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│   Express.js     │    │   Socket.IO      │
│   /api/v1/*      │    │   Real-time      │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────────────────────────────┐
│           Service Layer                   │
│  Suite │ Run │ Flaky │ Metrics │ Notify  │
└────────┬─────────────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌────────────────────┐
│ Prisma │  │ BullMQ / Redis     │
│ (PG)   │  │ Job Queue          │
└────────┘  └────────┬───────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Worker Pool    │
            │ (Executor,     │
            │  Scheduler,    │
            │  Reporter)     │
            └────────────────┘
```

## Testing

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | redis://localhost:6379 | Redis connection string |
| `AUTH_SECRET` | — | Bearer token secret |
| `WORKER_CONCURRENCY` | 5 | Max parallel workers (1–20) |
| `QUEUE_MAX_DEPTH` | 100 | Max queued jobs |
| `RETENTION_DAYS` | 90 | Data retention period (1–365) |
| `PASS_RATE_THRESHOLD` | 80 | Pass rate alert threshold (%) |
| `RATE_LIMIT_MAX` | 100 | Requests per window |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate limit window (ms) |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT © 2026 Darrius Jones
