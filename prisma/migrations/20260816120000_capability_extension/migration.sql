-- Capability extension migration.
--
-- Adds:
--   1. `ToolDefinition.source` and `ToolDefinition.trusted` for capability 05 / 06.
--   2. `Transcript` table for capability 04.
--   3. `McpServer` allowlist table for capability 06.
--
-- IMPORTANT: this migration was hand-authored because the sandbox cannot
-- reach `binaries.prisma.sh` to run `prisma migrate dev`. It mirrors the
-- Prisma-generated DDL for the schema diff. Before applying, the
-- migration MUST be diffed against `prisma/schema.prisma` with
-- `prisma migrate diff --from-migrations ... --to-schema-datamodel ...`
-- and any drift corrected per `docs/ARCHITECTURE.md` §9.

-- AlterTable
ALTER TABLE "ToolDefinition"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'static',
  ADD COLUMN "trusted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ToolDefinition_tenantId_source_trusted_idx"
  ON "ToolDefinition"("tenantId", "source", "trusted");

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT NOT NULL DEFAULT 'en',
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "final" BOOLEAN NOT NULL DEFAULT true,
    "intent" TEXT,
    "riskLevel" TEXT,
    "requiresConfirmation" BOOLEAN,
    "commandId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transcript_tenantId_sessionId_occurredAt_idx"
  ON "Transcript"("tenantId", "sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transcript_tenantId_participantId_occurredAt_idx"
  ON "Transcript"("tenantId", "participantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transcript_tenantId_commandId_idx"
  ON "Transcript"("tenantId", "commandId");

-- AddForeignKey
ALTER TABLE "Transcript"
  ADD CONSTRAINT "Transcript_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "identityRef" TEXT NOT NULL,
    "allowedTools" JSONB NOT NULL DEFAULT '[]',
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_tenantId_name_key"
  ON "McpServer"("tenantId", "name");

-- CreateIndex
CREATE INDEX "McpServer_tenantId_trusted_idx"
  ON "McpServer"("tenantId", "trusted");

-- AddForeignKey
ALTER TABLE "McpServer"
  ADD CONSTRAINT "McpServer_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
