-- CreateEnum
CREATE TYPE "Framework" AS ENUM ('jest', 'playwright', 'cypress');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('passed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('cron', 'event');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('slack', 'webhook');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "framework" "Framework" NOT NULL,
    "sourcePath" VARCHAR(512) NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matrixId" TEXT,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "environmentId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "workerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalTests" INTEGER NOT NULL DEFAULT 0,
    "passedTests" INTEGER NOT NULL DEFAULT 0,
    "failedTests" INTEGER NOT NULL DEFAULT 0,
    "skippedTests" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "status" "TestStatus" NOT NULL,
    "duration" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentConfig" (
    "id" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "runtimeVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentMatrix" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentMatrixEntry" (
    "matrixId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,

    CONSTRAINT "EnvironmentMatrixEntry_pkey" PRIMARY KEY ("matrixId","environmentId")
);

-- CreateTable
CREATE TABLE "ExecutionSchedule" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "type" "ScheduleType" NOT NULL,
    "cronExpression" TEXT,
    "webhookPattern" TEXT,
    "matrixId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlakyTestEntry" (
    "id" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "isFlaky" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlakyTestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestSuite_name_key" ON "TestSuite"("name");

-- CreateIndex
CREATE INDEX "TestRun_suiteId_status_idx" ON "TestRun"("suiteId", "status");

-- CreateIndex
CREATE INDEX "TestRun_status_idx" ON "TestRun"("status");

-- CreateIndex
CREATE INDEX "TestRun_createdAt_idx" ON "TestRun"("createdAt");

-- CreateIndex
CREATE INDEX "TestResult_runId_idx" ON "TestResult"("runId");

-- CreateIndex
CREATE INDEX "TestResult_testName_createdAt_idx" ON "TestResult"("testName", "createdAt");

-- CreateIndex
CREATE INDEX "TestResult_createdAt_idx" ON "TestResult"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentMatrix_name_key" ON "EnvironmentMatrix"("name");

-- CreateIndex
CREATE INDEX "ExecutionSchedule_active_idx" ON "ExecutionSchedule"("active");

-- CreateIndex
CREATE INDEX "FlakyTestEntry_isFlaky_score_idx" ON "FlakyTestEntry"("isFlaky", "score");

-- CreateIndex
CREATE UNIQUE INDEX "FlakyTestEntry_testName_suiteId_key" ON "FlakyTestEntry"("testName", "suiteId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channelId_createdAt_idx" ON "NotificationDelivery"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "EnvironmentMatrix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "EnvironmentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentMatrixEntry" ADD CONSTRAINT "EnvironmentMatrixEntry_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "EnvironmentMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentMatrixEntry" ADD CONSTRAINT "EnvironmentMatrixEntry_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "EnvironmentConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionSchedule" ADD CONSTRAINT "ExecutionSchedule_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
