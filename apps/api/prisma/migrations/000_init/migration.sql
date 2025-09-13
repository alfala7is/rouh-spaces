-- Create enums
CREATE TYPE "Role" AS ENUM ('seeker', 'provider', 'operator', 'admin');
CREATE TYPE "MemberStatus" AS ENUM ('active', 'invited', 'suspended');
CREATE TYPE "SourceType" AS ENUM ('api', 'csv', 'form', 'manual');
CREATE TYPE "SourceStatus" AS ENUM ('ok', 'error', 'paused');
CREATE TYPE "ActionType" AS ENUM ('contact', 'inquiry', 'hold', 'book', 'intro');
CREATE TYPE "ActionStatus" AS ENUM ('pending', 'done', 'refunded');

-- Tables
CREATE TABLE "Space" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "template" text,
  "configJson" jsonb,
  "ownerId" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "Member" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "role" "Role" NOT NULL,
  "status" "MemberStatus" NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX "member_user_space_unique" ON "Member"("userId", "spaceId");
CREATE INDEX "member_space_idx" ON "Member"("spaceId");

CREATE TABLE "Source" (
  "id" text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "type" "SourceType" NOT NULL,
  "authJson" jsonb,
  "status" "SourceStatus" NOT NULL DEFAULT 'ok',
  "lastSyncAt" timestamp with time zone
);
CREATE INDEX "source_space_idx" ON "Source"("spaceId");

CREATE TABLE "Item" (
  "id" text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "canonicalJson" jsonb NOT NULL,
  "lastSeenAt" timestamp with time zone,
  "ttlAt" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "item_space_idx" ON "Item"("spaceId");
CREATE INDEX "item_ttl_idx" ON "Item"("ttlAt");

CREATE TABLE "Action" (
  "id" text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "userId" text,
  "itemId" text REFERENCES "Item"("id") ON DELETE SET NULL,
  "type" "ActionType" NOT NULL,
  "status" "ActionStatus" NOT NULL DEFAULT 'pending',
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "action_space_idx" ON "Action"("spaceId");

CREATE TABLE "Lead" (
  "id" text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "itemId" text NOT NULL REFERENCES "Item"("id") ON DELETE CASCADE,
  "providerId" text,
  "seekerId" text,
  "qualified" boolean NOT NULL DEFAULT false,
  "refunded" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "lead_space_idx" ON "Lead"("spaceId");

CREATE TABLE "LedgerEvent" (
  "id" text PRIMARY KEY,
  "ts" timestamp with time zone DEFAULT now() NOT NULL,
  "actorId" text,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "entity" text NOT NULL,
  "eventType" text NOT NULL,
  "payloadJson" jsonb
);
CREATE INDEX "ledger_space_idx" ON "LedgerEvent"("spaceId");

CREATE TABLE "AiEmbedding" (
  "id" text PRIMARY KEY,
  "spaceId" text NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "itemId" text REFERENCES "Item"("id") ON DELETE SET NULL,
  "text" text NOT NULL,
  "embeddingBytes" bytea
);
CREATE INDEX "ai_space_idx" ON "AiEmbedding"("spaceId");
