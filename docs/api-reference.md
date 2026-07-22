# API Reference

Base URL: `/api/v1`

All endpoints require Bearer token authentication via the `Authorization` header.

## Authentication

```
Authorization: Bearer <AUTH_SECRET>
```

## Response Format

All responses use a consistent envelope:

```json
{
  "status": "success" | "error",
  "data": <payload> | null,
  "error": { "message": "...", "code": "...", "fields": [...] } | null,
  "meta": { "totalCount": N, "pageSize": N, "nextCursor": "..." }
}
```

## Pagination

List endpoints support cursor-based pagination:
- `?pageSize=20` — Items per page (1–100, default 20)
- `?cursor=<id>` — Cursor from previous response's `meta.nextCursor`

---

## Test Suites

### POST /suites
Create a new test suite.

**Body:**
```json
{
  "name": "string (1-128 chars, unique)",
  "framework": "jest" | "playwright" | "cypress",
  "sourcePath": "string (max 512 chars)",
  "config": {} // optional, max 10KB
}
```

### GET /suites
List all test suites (paginated).

### GET /suites/:id
Get a single test suite.

### PUT /suites/:id
Update a test suite (partial update).

### DELETE /suites/:id
Delete a test suite. Fails if active runs exist.

---

## Test Runs

### POST /runs
Create and enqueue a test run.

**Body:**
```json
{
  "suiteId": "uuid",
  "environmentId": "uuid (optional)",
  "matrixId": "uuid (optional, creates one run per env)"
}
```

### GET /runs
List runs. Filterable by `?suiteId=` and `?status=`.

### GET /runs/:id
Get a single run.

---

## Test Results

### POST /results
Submit a batch of test results.

**Body:**
```json
{
  "runId": "uuid",
  "results": [
    {
      "testName": "string",
      "status": "passed" | "failed" | "skipped",
      "duration": 123,
      "errorMessage": "optional",
      "errorStack": "optional"
    }
  ]
}
```

### GET /results
List results. Filter by `?runId=`.

---

## Environments

### POST /environments
Create an environment config. At least one field required.

**Body:**
```json
{
  "browser": "chrome (optional)",
  "os": "linux (optional)",
  "runtimeVersion": "20.x (optional)"
}
```

### GET/PUT/DELETE /environments/:id

### POST /environments/matrix
Create an environment matrix.

**Body:**
```json
{
  "name": "string",
  "environmentIds": ["uuid", ...] // 1-50 items
}
```

### GET/DELETE /environments/matrix/:id

---

## Schedules

### POST /schedules
Create an execution schedule.

**Body:**
```json
{
  "suiteId": "uuid",
  "type": "cron" | "event",
  "cronExpression": "*/5 * * * * (5-field, min 1min interval)",
  "webhookPattern": "string (for event type)",
  "matrixId": "uuid (optional)"
}
```

### GET /schedules/:id
### PUT /schedules/:id
### POST /schedules/:id/pause
### POST /schedules/:id/resume
### DELETE /schedules/:id

---

## Notifications

### POST /notifications/channels
Create a notification channel. Validates HTTPS URL and performs test delivery.

**Body:**
```json
{
  "name": "string",
  "type": "slack" | "webhook",
  "url": "https://...",
  "events": ["run.failed", "flaky.detected", "flaky.resolved", "threshold.breached", "schedule.skipped"]
}
```

### GET /notifications/channels
### GET /notifications/channels/:id
### PUT /notifications/channels/:id
### DELETE /notifications/channels/:id
### GET /notifications/channels/:id/history

---

## Reports

### GET /reports/suites/:suiteId/summary
Get historical report for a suite.

**Query params:**
- `startDate` — ISO date string
- `endDate` — ISO date string
- `groupBy` — `day` | `week` | `month` (default: `day`)

---

## Flaky Tests

### GET /flaky
Get currently flagged flaky tests, sorted by score descending. Paginated.

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| VALIDATION_ERROR | 422 | Request validation failed |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | State conflict |
| AUTHENTICATION_ERROR | 401 | Auth failed |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| QUEUE_CAPACITY_EXCEEDED | 503 | Job queue full |
| INTERNAL_ERROR | 500 | Server error |
