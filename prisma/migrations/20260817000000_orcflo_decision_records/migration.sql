-- Orcflo persisted decision records (branch coverage / audit).
--
-- One row per deterministic control-node decision (condition / router /
-- for_each) made during a run; `result` carries the decision value so
-- "why did the run go this way" is reconstructible after the fact.
--
-- Additive and idempotent: safe to re-run.

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrcfloDecisionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcfloDecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrcfloDecisionRecord_tenantId_runId_occurredAt_idx"
  ON "OrcfloDecisionRecord"("tenantId", "runId", "occurredAt");
CREATE INDEX IF NOT EXISTS "OrcfloDecisionRecord_tenantId_workflowId_nodeId_idx"
  ON "OrcfloDecisionRecord"("tenantId", "workflowId", "nodeId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcfloDecisionRecord_tenantId_fkey') THEN
    ALTER TABLE "OrcfloDecisionRecord" ADD CONSTRAINT "OrcfloDecisionRecord_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
