-- Create table for blueprint designer sessions
CREATE TABLE "DesignerSession" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastReply" TEXT,
    "summary" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT FALSE,
    "history" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "notes" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "graph" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "followUps" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignerSession_pkey" PRIMARY KEY ("id")
);

-- Foreign keys tying sessions to spaces and templates
ALTER TABLE "DesignerSession"
    ADD CONSTRAINT "DesignerSession_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesignerSession"
    ADD CONSTRAINT "DesignerSession_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "CoordinationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Helpful indexes for quick lookups
CREATE INDEX "DesignerSession_spaceId_updatedAt_idx"
    ON "DesignerSession"("spaceId", "updatedAt");

CREATE INDEX "DesignerSession_templateId_idx"
    ON "DesignerSession"("templateId");
