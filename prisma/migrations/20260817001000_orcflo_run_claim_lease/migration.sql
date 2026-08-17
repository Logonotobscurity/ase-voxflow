-- Orcflo run claim/lease — multi-worker safe draining of PENDING runs.
--
-- Mirrors the outbox claim/lease protocol (Audit §3): a PENDING run
-- claimed by a worker carries claimedBy/claimedUntil; a worker may
-- reclaim rows whose lease has expired (the worker likely crashed).
--
-- Additive and idempotent: safe to re-run.

-- AlterTable
ALTER TABLE "OrcfloRun"
  ADD COLUMN IF NOT EXISTS "claimedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "claimedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrcfloRun_status_claimedBy_claimedUntil_idx"
  ON "OrcfloRun"("status", "claimedBy", "claimedUntil");
