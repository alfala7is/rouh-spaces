-- Align enums used by code
DO $$ BEGIN
  ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'order';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'schedule';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'submit';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'queued';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'executing';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'completed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "ActionStatus" ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New enums
DO $$ BEGIN
  CREATE TYPE "HandlerType" AS ENUM ('api','webhook','email','form','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExecutionStatus" AS ENUM ('queued','executing','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReceiptStatus" AS ENUM ('pending','confirmed','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables required for execution engine
CREATE TABLE IF NOT EXISTS "Handler" (
  "id" text PRIMARY KEY,
  "name" text UNIQUE NOT NULL,
  "type" "HandlerType" NOT NULL,
  "description" text,
  "configJson" jsonb NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "priority" integer NOT NULL DEFAULT 100,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handler_type_idx ON "Handler"("type");
CREATE INDEX IF NOT EXISTS handler_active_idx ON "Handler"("isActive");

CREATE TABLE IF NOT EXISTS "ActionExecution" (
  "id" text PRIMARY KEY,
  "actionId" text NOT NULL REFERENCES "Action"("id") ON DELETE CASCADE,
  "handlerType" "HandlerType" NOT NULL,
  "handlerName" text NOT NULL,
  "status" "ExecutionStatus" NOT NULL DEFAULT 'queued',
  "attempt" integer NOT NULL DEFAULT 1,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "executedAt" timestamptz,
  "completedAt" timestamptz,
  "failedAt" timestamptz,
  "nextRetryAt" timestamptz,
  "errorMessage" text,
  "externalRef" text,
  "externalData" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_execution_action_idx ON "ActionExecution"("actionId");
CREATE INDEX IF NOT EXISTS action_execution_status_idx ON "ActionExecution"("status");
CREATE INDEX IF NOT EXISTS action_execution_next_retry_idx ON "ActionExecution"("nextRetryAt");

CREATE TABLE IF NOT EXISTS "Receipt" (
  "id" text PRIMARY KEY,
  "actionId" text NOT NULL REFERENCES "Action"("id") ON DELETE CASCADE,
  "receiptNumber" text UNIQUE NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'pending',
  "data" jsonb NOT NULL,
  "externalProof" jsonb,
  "providerName" text,
  "totalAmount" numeric,
  "currency" text,
  "externalRef" text,
  "confirmedAt" timestamptz,
  "cancelledAt" timestamptz,
  "refundedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_action_idx ON "Receipt"("actionId");
CREATE INDEX IF NOT EXISTS receipt_number_idx ON "Receipt"("receiptNumber");
CREATE INDEX IF NOT EXISTS receipt_status_idx ON "Receipt"("status");

CREATE TABLE IF NOT EXISTS "ActionStatusUpdate" (
  "id" text PRIMARY KEY,
  "actionId" text NOT NULL,
  "status" text NOT NULL,
  "message" text,
  "data" jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_status_update_action_idx ON "ActionStatusUpdate"("actionId");
CREATE INDEX IF NOT EXISTS action_status_update_ts_idx ON "ActionStatusUpdate"("timestamp");

