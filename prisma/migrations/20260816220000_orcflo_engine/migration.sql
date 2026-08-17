-- Orcflo engine (additive).
--
-- Adds the run-time half of VOXFLOW: runs, the append-only run stream,
-- the content-hashed step cache, metering records, fail-closed model
-- providers, the four trigger kinds, and reusable blueprints.
--
-- This migration is additive and idempotent: every object uses
-- IF NOT EXISTS so a partially-applied run is safe to re-run.

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "blueprintId" TEXT,
    "triggerId" TEXT,
    "triggerKind" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "stepResults" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcfloRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloRunEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "nodeId" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcfloRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloStepCacheEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3),

    CONSTRAINT "OrcfloStepCacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloMeteringRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT,
    "workflowId" TEXT,
    "nodeId" TEXT,
    "metric" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcfloMeteringRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloModelProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT,
    "endpoint" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcfloModelProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloTrigger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcfloTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloBlueprint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parameters" JSONB NOT NULL,
    "graph" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcfloBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrcfloRun_tenantId_status_idx" ON "OrcfloRun"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "OrcfloRun_tenantId_workflowId_createdAt_idx" ON "OrcfloRun"("tenantId", "workflowId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrcfloRun_tenantId_triggerId_createdAt_idx" ON "OrcfloRun"("tenantId", "triggerId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrcfloRun_correlationId_idx" ON "OrcfloRun"("correlationId");

CREATE UNIQUE INDEX IF NOT EXISTS "OrcfloRunEvent_runId_sequence_key" ON "OrcfloRunEvent"("runId", "sequence");
CREATE INDEX IF NOT EXISTS "OrcfloRunEvent_tenantId_runId_sequence_idx" ON "OrcfloRunEvent"("tenantId", "runId", "sequence");

CREATE UNIQUE INDEX IF NOT EXISTS "OrcfloStepCacheEntry_tenantId_key_key" ON "OrcfloStepCacheEntry"("tenantId", "key");
CREATE INDEX IF NOT EXISTS "OrcfloStepCacheEntry_tenantId_workflowId_nodeId_idx" ON "OrcfloStepCacheEntry"("tenantId", "workflowId", "nodeId");

CREATE INDEX IF NOT EXISTS "OrcfloMeteringRecord_tenantId_metric_recordedAt_idx" ON "OrcfloMeteringRecord"("tenantId", "metric", "recordedAt");
CREATE INDEX IF NOT EXISTS "OrcfloMeteringRecord_tenantId_runId_idx" ON "OrcfloMeteringRecord"("tenantId", "runId");
CREATE INDEX IF NOT EXISTS "OrcfloMeteringRecord_tenantId_workflowId_recordedAt_idx" ON "OrcfloMeteringRecord"("tenantId", "workflowId", "recordedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "OrcfloModelProvider_tenantId_name_key" ON "OrcfloModelProvider"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "OrcfloModelProvider_tenantId_kind_enabled_idx" ON "OrcfloModelProvider"("tenantId", "kind", "enabled");

CREATE INDEX IF NOT EXISTS "OrcfloTrigger_tenantId_kind_enabled_idx" ON "OrcfloTrigger"("tenantId", "kind", "enabled");
CREATE INDEX IF NOT EXISTS "OrcfloTrigger_tenantId_workflowId_idx" ON "OrcfloTrigger"("tenantId", "workflowId");
CREATE INDEX IF NOT EXISTS "OrcfloTrigger_tenantId_kind_name_idx" ON "OrcfloTrigger"("tenantId", "kind", "name");

CREATE INDEX IF NOT EXISTS "OrcfloBlueprint_tenantId_updatedAt_idx" ON "OrcfloBlueprint"("tenantId", "updatedAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloRun_tenantId_fkey') THEN
    ALTER TABLE "OrcfloRun" ADD CONSTRAINT "OrcfloRun_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloRun_workflowId_fkey') THEN
    ALTER TABLE "OrcfloRun" ADD CONSTRAINT "OrcfloRun_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloRunEvent_tenantId_fkey') THEN
    ALTER TABLE "OrcfloRunEvent" ADD CONSTRAINT "OrcfloRunEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloRunEvent_runId_fkey') THEN
    ALTER TABLE "OrcfloRunEvent" ADD CONSTRAINT "OrcfloRunEvent_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "OrcfloRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloStepCacheEntry_tenantId_fkey') THEN
    ALTER TABLE "OrcfloStepCacheEntry" ADD CONSTRAINT "OrcfloStepCacheEntry_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloMeteringRecord_tenantId_fkey') THEN
    ALTER TABLE "OrcfloMeteringRecord" ADD CONSTRAINT "OrcfloMeteringRecord_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloModelProvider_tenantId_fkey') THEN
    ALTER TABLE "OrcfloModelProvider" ADD CONSTRAINT "OrcfloModelProvider_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloTrigger_tenantId_fkey') THEN
    ALTER TABLE "OrcfloTrigger" ADD CONSTRAINT "OrcfloTrigger_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloTrigger_workflowId_fkey') THEN
    ALTER TABLE "OrcfloTrigger" ADD CONSTRAINT "OrcfloTrigger_workflowId_fkey"
      FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloBlueprint_tenantId_fkey') THEN
    ALTER TABLE "OrcfloBlueprint" ADD CONSTRAINT "OrcfloBlueprint_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
