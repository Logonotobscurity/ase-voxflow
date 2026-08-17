import { describe, expect, it } from 'vitest';
import { RunDispatcher } from '../lib/application/run-dispatcher';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
} from './orcflo-helpers';

async function seedPendingRuns(harness: ReturnType<typeof buildOrcfloHarness>, count: number): Promise<string[]> {
  await harness.ports.workflows.save(orcfloWorkflowFixture());
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const run = await harness.engine.createRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { i },
    });
    ids.push(run.id);
  }
  return ids;
}

describe('Run claim/lease — multi-worker safe draining', () => {
  it('claims a batch for one worker and excludes it from another while the lease is live', async () => {
    const harness = buildOrcfloHarness();
    const ids = await seedPendingRuns(harness, 5);

    const claimedA = await harness.ports.runs.claimBatch('worker-a', 60_000, 10);
    expect(claimedA.map((run) => run.id).sort()).toEqual([...ids].sort());
    expect(claimedA.every((run) => run.claimedBy === 'worker-a')).toBe(true);
    expect(claimedA.every((run) => run.claimedUntil !== undefined)).toBe(true);

    // Worker B cannot claim anything while A's lease is live.
    const claimedB = await harness.ports.runs.claimBatch('worker-b', 60_000, 10);
    expect(claimedB).toHaveLength(0);
  });

  it('lets a worker reclaim a run whose lease has expired', async () => {
    const harness = buildOrcfloHarness();
    await seedPendingRuns(harness, 1);

    const claimedA = await harness.ports.runs.claimBatch('worker-a', 100, 10);
    expect(claimedA).toHaveLength(1);

    // Live lease -> no reclaim.
    expect(await harness.ports.runs.claimBatch('worker-b', 100, 10)).toHaveLength(0);

    // Wait past the lease, then B can reclaim.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const reclaimed = await harness.ports.runs.claimBatch('worker-b', 100, 10);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0].id).toBe(claimedA[0].id);
    expect(reclaimed[0].claimedBy).toBe('worker-b');
  });

  it('releaseClaim clears only the owning worker claim', async () => {
    const harness = buildOrcfloHarness();
    const [id] = await seedPendingRuns(harness, 1);
    await harness.ports.runs.claimBatch('worker-a', 60_000, 10);

    // Another worker cannot release A's claim.
    await harness.ports.runs.releaseClaim(id, 'worker-b');
    let stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, id);
    expect(stored?.claimedBy).toBe('worker-a');

    // A releases its own claim -> the row is claimable again.
    await harness.ports.runs.releaseClaim(id, 'worker-a');
    stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, id);
    expect(stored?.claimedBy).toBeUndefined();
    expect(await harness.ports.runs.claimBatch('worker-b', 60_000, 10)).toHaveLength(1);
  });

  it('the dispatcher claims, executes, and releases the claim', async () => {
    const harness = buildOrcfloHarness();
    const [id] = await seedPendingRuns(harness, 1);
    const dispatcher = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-test', leaseMs: 60_000 });

    const executed = await dispatcher.tick();
    expect(executed).toHaveLength(1);
    expect(executed[0].status).toBe('COMPLETED');

    // The claim is released after terminal execution.
    const stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, id);
    expect(stored?.claimedBy).toBeUndefined();
    expect(stored?.claimedUntil).toBeUndefined();
  });

  it('the dispatcher releases the claim when a run pauses at approval', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    const created = await harness.engine.createRun({
      workflowId: 'workflow_orcflo',
      context: { ...orcfloActorContext, role: 'APPROVER' },
    });
    const dispatcher = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-pause', leaseMs: 60_000 });
    const executed = await dispatcher.tick();
    expect(executed[0].status).toBe('WAITING_APPROVAL');
    const stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, created.id);
    expect(stored?.claimedBy).toBeUndefined();
  });

  it('executeRun leaves a run claimed by another live worker untouched', async () => {
    const harness = buildOrcfloHarness();
    const [id] = await seedPendingRuns(harness, 1);
    await harness.ports.runs.claimBatch('worker-a', 60_000, 10);

    // A second worker tries to execute without owning the claim -> skipped.
    const second = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-b', leaseMs: 60_000 });
    const executed = await second.tick();
    expect(executed).toHaveLength(0);

    // The owning worker may execute its own claim (guard passes).
    const run = await harness.engine.executeRun(id, { workerId: 'worker-a' });
    expect(run.status).toBe('COMPLETED');

    // A dispatcher for worker-a can now claim-and-execute the released run.
    const owner = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-a', leaseMs: 60_000 });
    expect(await owner.tick()).toHaveLength(0); // already terminal, claim released
    void id;
  });

  it('two workers drain disjoint batches concurrently', async () => {
    const harness = buildOrcfloHarness();
    await seedPendingRuns(harness, 4);
    const a = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-a', leaseMs: 60_000, limit: 2 });
    const b = new RunDispatcher(harness.engine, harness.ports, undefined, { workerId: 'worker-b', leaseMs: 60_000, limit: 2 });

    const [ra, rb] = await Promise.all([a.tick(), b.tick()]);
    expect(ra).toHaveLength(2);
    expect(rb).toHaveLength(2);
    const ids = [...ra, ...rb].map((run) => run.id);
    expect(new Set(ids).size).toBe(4); // disjoint — no run executed twice
    expect(ra.every((run) => run.status === 'COMPLETED')).toBe(true);
    expect(rb.every((run) => run.status === 'COMPLETED')).toBe(true);
  });
});

describe('Run claim/lease — error surface', () => {
  it('releaseClaim on a missing run throws NOT_FOUND', async () => {
    const harness = buildOrcfloHarness();
    await expect(harness.ports.runs.releaseClaim('run_missing', 'worker-a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
