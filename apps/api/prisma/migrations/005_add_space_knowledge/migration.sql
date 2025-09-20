CREATE TYPE "KnowledgeEntryType" AS ENUM ('fact', 'behavior', 'workflow');

CREATE TABLE "SpaceKnowledge" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "spaceId" TEXT NOT NULL,
  "type" "KnowledgeEntryType" NOT NULL,
  "title" TEXT NOT NULL,
  "canonicalText" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "metadata" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE "SpaceKnowledge"
  ADD CONSTRAINT "SpaceKnowledge_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE;

CREATE INDEX "SpaceKnowledge_spaceId_type_idx"
  ON "SpaceKnowledge" ("spaceId", "type");

CREATE INDEX "SpaceKnowledge_spaceId_createdAt_idx"
  ON "SpaceKnowledge" ("spaceId", "createdAt" DESC);
