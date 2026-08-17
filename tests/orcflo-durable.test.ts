import { describe, expect, it } from 'vitest';
import { OrcfloTriggerService } from '../lib/application/orcflo-triggers';
import { RunDispatcher } from '../lib/application/run-dispatcher';
import { RunEventBus } from '../lib/application/run-event-bus';
import { ScheduleDispatcher } from '../lib/application/schedule-dispatcher';
import { FixedClock } from '../lib/infrastructure/memory-adapters';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
} from './orcflo-helpers';

const APPROVER_CONTEXT = { ...orcfloActorContext, role: 'APPROVER' as const };

function approvalWorkflow() {
  return orcfloWorkflowFixture({}, [
    { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    { id: 'after', type: 'action', label: 'After', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
  ]);
}

describe('Durable execution — async runs (§25/§36)', () => {
  it('creates a PENDING run and the worker executes it to completion', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());

    const created = await harness.engine.createRun({
      workflowId: 'workflow_orcflo',
      input: { q: 1 },
      context: orcfloActorContext,
      maxConcurrency: 2,
    });
    expect(created.status).toBe('PENDING');
    expect(created.actorId).toBe(orcfloActorContext.actorId);
    expect(created.role).toBe('BUILDER');
    expect(created.limits).toMatchObject({ maxConcurrency: 2 });
    // Nothing has executed yet.
    expect((await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, created.id)).length).toBe(0);

    const dispatcher = new RunDispatcher(harness.engine, harness.ports);
    const executed = await dispatcher.tick();
    expect(executed).toHaveLength(1);
    expect(executed[0].id).toBe(created.id);
    expect(executed[0].status).toBe('COMPLETED');

    // Worker idempotency: a second tick over the (now empty) PENDING list is a no-op.
    expect(await dispatcher.tick()).toHaveLength(0);
    const stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, created.id);
    expect(stored?.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'start').length).toBe(1);
  });

  it('executeRun is idempotent on terminal runs', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const created = await harness.engine.createRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext });
    const completed = await harness.engine.executeRun(created.id);
    expect(completed.status).toBe('COMPLETED');
    const again = await harness.engine.executeRun(created.id);
    expect(again.status).toBe('COMPLETED');
    expect(again.id).toBe(created.id);
    expect(harness.handlerCalls.length).toBe(2); // one run, two nodes
  });

  it('publishes run events to the in-process bus during execution', async () => {
    const bus = new RunEventBus();
    const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z', undefined, { runEventBus: bus });
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const received: string[] = [];
    const created = await harness.engine.createRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext });
    const unsub = bus.subscribe(created.id, (event) => received.push(event.eventType));

    await harness.engine.executeRun(created.id);
    unsub();

    expect(received).toEqual(['run.started', 'step.started', 'step.completed', 'step.started', 'step.completed', 'run.completed']);
  });
});

describe('Durable execution — resumable approval (§49)', () => {
  it('pauses at WAITING_APPROVAL, rejects -> CANCELLED, approves -> resumes to completion', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(approvalWorkflow());

    const paused = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: APPROVER_CONTEXT,
      input: { order: 42 },
    });
    expect(paused.status).toBe('WAITING_APPROVAL');
    expect(paused.steps.find((step) => step.nodeId === 'after')).toBeUndefined();

    // Reject path.
    const rejected = await harness.engine.decideApproval(APPROVER_CONTEXT, paused.id, 'REJECTED', 'Policy says no.');
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.approval).toMatchObject({ decision: 'REJECTED', decidedBy: APPROVER_CONTEXT.actorId });
    const cancelledEvents = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, rejected.id);
    expect(cancelledEvents.at(-1)?.eventType).toBe('run.cancelled');

    // Approve path (fresh run).
    const paused2 = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: APPROVER_CONTEXT,
    });
    expect(paused2.status).toBe('WAITING_APPROVAL');
    const resumed = await harness.engine.decideApproval(APPROVER_CONTEXT, paused2.id, 'APPROVED', 'Looks good.');
    expect(resumed.status).toBe('COMPLETED');
    expect(resumed.approval).toMatchObject({ decision: 'APPROVED' });

    // The approval step became COMPLETED and the downstream node ran once.
    const approvalStep = resumed.steps.find((step) => step.nodeId === 'approve');
    expect(approvalStep?.status).toBe('COMPLETED');
    expect(approvalStep?.output).toMatchObject({ approved: true });
    expect(resumed.steps.find((step) => step.nodeId === 'after')?.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'after').length).toBe(1);
    // Completed work was not re-executed.
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'start').length).toBe(2);

    // Stream continues with run.resumed then the tail.
    const events = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, resumed.id);
    const types = events.map((event) => event.eventType);
    expect(types).toContain('run.resumed');
    expect(types.at(-1)).toBe('run.completed');
  });

  it('requires the approval:decide permission', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(approvalWorkflow());
    const paused = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: APPROVER_CONTEXT });
    await expect(harness.engine.decideApproval({ ...orcfloActorContext, role: 'VIEWER' }, paused.id, 'APPROVED'))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('resumes correctly when a parallel branch completed before the pause (merge executes once)', async () => {
    const harness = buildOrcfloHarness();
    const workflow = orcfloWorkflowFixture({}, [
      { id: 'left', type: 'action', label: 'Left', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'merge', type: 'action', label: 'Merge', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]);
    // start -> left and start -> approve; left -> merge; approve -> merge.
    workflow.edges = [
      { id: 'e1', source: 'start', target: 'left', metadata: {} },
      { id: 'e2', source: 'start', target: 'approve', metadata: {} },
      { id: 'e3', source: 'left', target: 'merge', metadata: {} },
      { id: 'e4', source: 'approve', target: 'merge', metadata: {} },
    ];
    await harness.ports.workflows.save(workflow);

    const paused = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: APPROVER_CONTEXT });
    expect(paused.status).toBe('WAITING_APPROVAL');
    // The left branch completed before the pause (same wave pre-check pauses
    // the whole wave, so left may have completed in an earlier wave).
    const resumed = await harness.engine.decideApproval(APPROVER_CONTEXT, paused.id, 'APPROVED');
    expect(resumed.status).toBe('COMPLETED');
    const mergeSteps = resumed.steps.filter((step) => step.nodeId === 'merge' && step.status === 'COMPLETED');
    expect(mergeSteps).toHaveLength(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'merge').length).toBe(1);
  });

  it('resumes from an approval AFTER a completed loop (loop done, not active)', async () => {
    const harness = buildOrcfloHarness();
    const workflow = orcfloWorkflowFixture({}, [
      { id: 'each', type: 'for_each', label: 'Each', configuration: { collection: 'items' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'process', type: 'action', label: 'Process', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'done', type: 'action', label: 'Done', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]);
    workflow.edges = [
      { id: 'e1', source: 'start', target: 'each', metadata: {} },
      { id: 'e2', source: 'each', target: 'process', metadata: {} },
      { id: 'e3', source: 'process', target: 'each', loop: true, metadata: {} },
      { id: 'e4', source: 'each', target: 'approve', loopExit: true, metadata: {} },
      { id: 'e5', source: 'approve', target: 'done', metadata: {} },
    ];
    await harness.ports.workflows.save(workflow);

    const paused = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: APPROVER_CONTEXT,
      input: { items: ['x', 'y'] },
    });
    expect(paused.status).toBe('WAITING_APPROVAL');
    // The loop completed: last for_each step is done:true.
    const eachSteps = paused.steps.filter((step) => step.nodeId === 'each' && step.status === 'COMPLETED');
    expect(eachSteps.at(-1)?.output).toMatchObject({ done: true, processed: 2 });

    const resumed = await harness.engine.decideApproval(APPROVER_CONTEXT, paused.id, 'APPROVED');
    expect(resumed.status).toBe('COMPLETED');
    expect(resumed.steps.find((step) => step.nodeId === 'done')?.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'process').length).toBe(2);
  });

  it('rejects resuming inside an active for_each loop with a clear error', async () => {
    const harness = buildOrcfloHarness();
    const workflow = orcfloWorkflowFixture({}, [
      { id: 'each', type: 'for_each', label: 'Each', configuration: { collection: 'items' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'after', type: 'action', label: 'After', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]);
    workflow.edges = [
      { id: 'e1', source: 'start', target: 'each', metadata: {} },
      { id: 'e2', source: 'each', target: 'approve', metadata: {} },
      { id: 'e3', source: 'approve', target: 'after', metadata: {} },
      { id: 'e4', source: 'after', target: 'each', loop: true, metadata: {} },
      { id: 'e5', source: 'each', target: 'finish', loopExit: true, metadata: {} },
    ];
    workflow.nodes.push({ id: 'finish', type: 'action', label: 'Finish', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} });
    await harness.ports.workflows.save(workflow);

    const paused = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: APPROVER_CONTEXT,
      input: { items: [1, 2] },
    });
    expect(paused.status).toBe('WAITING_APPROVAL');
    await expect(harness.engine.decideApproval(APPROVER_CONTEXT, paused.id, 'APPROVED'))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR', message: expect.stringContaining('active for_each') });
  });
});

describe('Durable execution — schedule worker (§32/§25)', () => {
  function scheduleHarness(fixedNowIso: string) {
    const harness = buildOrcfloHarness(fixedNowIso);
    const clock = new FixedClock(fixedNowIso);
    const triggers = new OrcfloTriggerService(harness.ports, harness.engine, clock);
    const dispatcher = new ScheduleDispatcher(triggers, clock);
    return { ...harness, triggers, dispatcher, clock };
  }

  it('drains due schedules cross-tenant, once per bucket', async () => {
    const harness = scheduleHarness('2026-08-14T10:05:00.000Z');
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Every five',
      kind: 'schedule',
      config: { cron: '*/5 * * * *', timezone: 'UTC' },
    });
    // Second tenant with its own due schedule.
    const otherWorkflow = orcfloWorkflowFixture({ id: 'workflow_other', tenantId: 'tenant_other' });
    await harness.ports.workflows.save(otherWorkflow);
    await harness.triggers.create({ ...orcfloActorContext, tenantId: 'tenant_other' }, {
      workflowId: 'workflow_other',
      name: 'Other every five',
      kind: 'schedule',
      config: { cron: '*/5 * * * *', timezone: 'UTC' },
    });

    const runs = await harness.dispatcher.tick();
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => run.tenantId))).toEqual(new Set(['tenant_orcflo', 'tenant_other']));
    expect(runs.every((run) => run.status === 'COMPLETED')).toBe(true);

    // Same bucket polled again -> no duplicate.
    expect(await harness.dispatcher.tick()).toHaveLength(0);
  });
});
