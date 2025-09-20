ALTER TABLE "AiEmbedding"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "AiEmbedding_spaceId_createdAt_idx" ON "AiEmbedding" ("spaceId", "createdAt" DESC);
