-- Audit §3 — outbox claim/lease.
--
-- Extends the existing outbox with a CLAIMED lifecycle stage and
-- lease fields, so the dispatcher can implement atomic claim with
-- `FOR UPDATE SKIP LOCKED` and lease expiry.
--
-- This migration is additive and idempotent. The enum extension uses
-- `IF NOT EXISTS` so a partially-applied run is safe to re-run.

-- AlterEnum
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTERED';

-- AlterTable
ALTER TABLE "OutboxMessage"
  ADD COLUMN IF NOT EXISTS "claimedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "claimedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OutboxMessage_status_claimedUntil_idx"
  ON "OutboxMessage"("status", "claimedUntil");
