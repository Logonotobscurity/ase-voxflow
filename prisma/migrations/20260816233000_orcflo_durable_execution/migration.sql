-- Orcflo durable execution (§25/§32/§36/§49 of the workflow directive and
-- EXECUTION_KERNEL_SPEC §36).
--
-- Adds the fields a background worker needs to execute a PENDING run and
-- the resumable-approval decision:
--   actorId / role / environment — caller context captured at creation so
--     the worker reconstructs the exact ActorContext for policy, metering
--     and events;
--   limits — execution bounds (duration/cost/node-executions/concurrency)
--     captured at creation for the worker to enforce;
--   approval — the human decision (APPROVED/REJECTED + decidedBy/reason/
--     decidedAt) for a run paused at WAITING_APPROVAL.
--
-- Additive and idempotent: safe to re-run.

-- AlterTable
ALTER TABLE "OrcfloRun"
  ADD COLUMN IF NOT EXISTS "actorId" TEXT,
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "environment" TEXT,
  ADD COLUMN IF NOT EXISTS "limits" JSONB,
  ADD COLUMN IF NOT EXISTS "approval" JSONB;
