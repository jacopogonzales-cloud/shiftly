-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MONTATORE', 'ELETTRICISTA', 'RIGGER', 'AUTISTA');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PLANNING', 'CREW_CONFIRMED', 'IN_PROGRESS', 'DONE', 'PAID');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'SENT', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('operator', 'agent', 'paypal');

-- CreateTable
CREATE TABLE "Worker" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "paypalEmail" TEXT NOT NULL,
    "phone" TEXT,
    "reliability" INTEGER NOT NULL DEFAULT 80,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PLANNING',
    "budgetCents" INTEGER NOT NULL,
    "requirementsText" TEXT,
    "requirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "plannedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "reason" TEXT,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" SERIAL NOT NULL,
    "workerId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "senderBatchId" TEXT NOT NULL,
    "paypalBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL,
    "createdBy" "Actor" NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutItem" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "senderItemId" TEXT NOT NULL,
    "paypalItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER,
    "actor" "Actor" NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "companyName" TEXT NOT NULL,
    "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480,
    "overtimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "minRestHours" INTEGER NOT NULL DEFAULT 11,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_paypalEmail_key" ON "Worker"("paypalEmail");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_startsAt_idx" ON "Job"("startsAt");

-- CreateIndex
CREATE INDEX "Shift_jobId_idx" ON "Shift"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_token_key" ON "Assignment"("token");

-- CreateIndex
CREATE INDEX "Assignment_workerId_idx" ON "Assignment"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_shiftId_workerId_key" ON "Assignment"("shiftId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_workerId_date_key" ON "Availability"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_senderBatchId_key" ON "PayoutBatch"("senderBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_paypalBatchId_key" ON "PayoutBatch"("paypalBatchId");

-- CreateIndex
CREATE INDEX "PayoutBatch_jobId_idx" ON "PayoutBatch"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_senderItemId_key" ON "PayoutItem"("senderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_paypalItemId_key" ON "PayoutItem"("paypalItemId");

-- CreateIndex
CREATE INDEX "PayoutItem_workerId_idx" ON "PayoutItem"("workerId");

-- CreateIndex
CREATE INDEX "ActivityLog_jobId_createdAt_idx" ON "ActivityLog"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutBatch" ADD CONSTRAINT "PayoutBatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
