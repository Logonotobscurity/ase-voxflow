-- Orcflo run idempotency (§48 of the workflow directive).
--
-- Adds a stable idempotency key to runs: unique per tenant so duplicate
-- webhook deliveries / event fires / API retries replay the existing run
-- instead of creating a duplicate. PostgreSQL unique indexes treat NULL
-- as distinct, so runs started without a key remain exempt.
--
-- Additive and idempotent: safe to re-run.

-- AlterTable
ALTER TABLE "OrcfloRun"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrcfloRun_tenantId_idempotencyKey_key"
  ON "OrcfloRun"("tenantId", "idempotencyKey");
