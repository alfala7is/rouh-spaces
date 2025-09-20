-- Add text-based embedding column for now (can upgrade to vector type later)
-- OpenAI text-embedding-3-small produces 1536-dimensional vectors as JSON array string
ALTER TABLE "AiEmbedding" ADD COLUMN IF NOT EXISTS embedding TEXT;

-- Create index for space-based embedding lookup
CREATE INDEX IF NOT EXISTS "AiEmbedding_spaceId_embedding_idx" ON "AiEmbedding" ("spaceId") WHERE embedding IS NOT NULL;