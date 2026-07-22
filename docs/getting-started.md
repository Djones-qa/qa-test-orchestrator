# Getting Started

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional, for containerized setup)

## Installation

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/Djones-qa/qa-test-orchestrator.git
cd qa-test-orchestrator
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

The API will be available at `http://localhost:3000`.

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your database and Redis connection details

# Run database migrations
npx prisma migrate dev

# Start the development server
npm run dev
```

## Configuration

All configuration is managed through environment variables. See `.env.example` for a complete list.

Key settings:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `AUTH_SECRET` — The Bearer token required for API authentication

## First Run

### 1. Create a Test Suite

```bash
curl -X POST http://localhost:3000/api/v1/suites \
  -H "Authorization: Bearer your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Jest Suite",
    "framework": "jest",
    "sourcePath": "./tests"
  }'
```

### 2. Start a Test Run

```bash
curl -X POST http://localhost:3000/api/v1/runs \
  -H "Authorization: Bearer your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "suiteId": "<suite-id-from-step-1>"
  }'
```

### 3. Submit Test Results

```bash
curl -X POST http://localhost:3000/api/v1/results \
  -H "Authorization: Bearer your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "<run-id-from-step-2>",
    "results": [
      { "testName": "should add numbers", "status": "passed", "duration": 50 },
      { "testName": "should handle errors", "status": "failed", "duration": 120, "errorMessage": "Expected 5, got 3" }
    ]
  }'
```

### 4. View Flaky Tests

```bash
curl http://localhost:3000/api/v1/flaky \
  -H "Authorization: Bearer your-secret-key-here"
```

## WebSocket Dashboard

Connect to the WebSocket endpoint for real-time updates:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('state:current', (runs) => {
  console.log('Active runs:', runs);
});

socket.on('test:result', (data) => {
  console.log('New result:', data);
});

socket.on('run:stateChange', (data) => {
  console.log('Run state changed:', data);
});
```
