import { describe, expect, it } from 'vitest';
import type { WorkflowNodeHandler } from '../lib/application/orcflo-engine';
import { WorkflowSchema } from '../lib/domain/schemas';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
  runWithFixture,
} from './orcflo-helpers';

describe('Orcflo engine — runs', () => {
  it('completes a READY workflow and records step results in topological order', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const run = await runWithFixture(harness, { recipient: 'Lagos' });

    expect(run.status).toBe('COMPLETED');
    expect(run.steps.map((step) => step.status)).toEqual(['COMPLETED', 'COMPLETED']);
    expect(run.output).toMatchObject({ stepCount: 2 });
    expect(run.triggerId).toBeUndefined();
  });

  it('threads completed step outputs into downstream step inputs', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const run = await runWithFixture(harness, { name: 'Ada' });

    expect(run.status).toBe('COMPLETED');
    // The second step (end) receives the first step's output merged into its
    // input under the completed node's id.
    const endCall = harness.handlerCalls.find((call) => call.nodeId === 'end');
    expect(endCall?.input).toMatchObject({ name: 'Ada', start: { nodeId: 'start' } });
  });

  it('refuses to run a workflow that is not READY', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({ status: 'DRAFT' }));
    await expect(runWithFixture(harness)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('denies execution to roles without workflow:execute', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await expect(
      harness.engine.startRun({
        workflowId: 'workflow_orcflo',
        context: { ...orcfloActorContext, role: 'VIEWER' },
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('fails the run when no observable evidence is produced', async () => {
    // A node handler that returns output but no evidence must fail the run.
    const noEvidenceHandler: WorkflowNodeHandler = (node) => ({
      output: { nodeId: node.id },
      evidence: [],
      costMinor: 0,
    });
    const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z', new Map([['action', noEvidenceHandler]]));
    const noEvidence = {
      id: 'workflow_no_evidence',
      tenantId: orcfloActorContext.tenantId,
      name: 'No evidence',
      description: '',
      status: 'READY' as const,
      version: 1,
      nodes: [
        { id: 'only', type: 'action' as const, label: 'Only', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      ],
      edges: [],
      metadata: {},
      createdAt: '2026-08-14T09:00:00.000Z',
      updatedAt: '2026-08-14T09:00:00.000Z',
    };
    await harness.ports.workflows.save(WorkflowSchema.parse(noEvidence));
    await expect(harness.engine.startRun({
      workflowId: 'workflow_no_evidence',
      context: orcfloActorContext,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
  });

  it('records a failed run with step.failed and run.failed events when a handler throws', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'boom', type: 'action', label: 'Boom', configuration: { failWith: 'exploded' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    await expect(runWithFixture(harness)).rejects.toMatchObject({ code: 'WORKFLOW_ERROR', message: 'exploded' });

    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
    const events = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, runs[0].id);
    const types = events.map((event) => event.eventType);
    expect(types).toContain('step.failed');
    expect(types).toContain('run.failed');
  });

  it('enforces the run cost limit', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'costly', type: 'action', label: 'Costly', configuration: { costMinor: 500 }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    await expect(runWithFixture(harness, {}, { maxCostMinor: 100 })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
  });

  it('pauses at a human approval node with WAITING_APPROVAL status', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    const run = await runWithFixture(harness);
    expect(run.status).toBe('WAITING_APPROVAL');
    expect(run.steps.at(-1)?.status).toBe('WAITING_APPROVAL');
  });

  it('isolates runs by tenant', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const run = await runWithFixture(harness);
    expect(await harness.ports.runs.findById('tenant_other', run.id)).toBeNull();
    expect((await harness.ports.runs.list('tenant_other')).length).toBe(0);
    expect((await harness.ports.runEvents.listForRun('tenant_other', run.id)).length).toBe(0);
  });
});

describe('Orcflo engine — run stream', () => {
  it('emits a monotonic replayable event sequence', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const run = await runWithFixture(harness);
    const events = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, run.id);

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.map((event) => event.eventType)).toEqual([
      'run.started',
      'step.started',
      'step.completed',
      'step.started',
      'step.completed',
      'run.completed',
    ]);
    expect(events[1].nodeId).toBe('start');
    expect(events[2].payload).toMatchObject({ nodeId: 'start' });
  });
});

describe('Orcflo engine — metering', () => {
  it('records runs, steps and duration, and summarizes them', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await runWithFixture(harness);
    const summary = await harness.engine.meteringSummary(orcfloActorContext);

    expect(summary.runs).toBe(1);
    expect(summary.steps).toBe(2);
    expect(summary.cacheHits).toBe(0);
    expect(summary.cacheMisses).toBe(0);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.costMinor).toBe(0);

    const records = await harness.ports.metering.list(orcfloActorContext.tenantId);
    const metrics = records.map((record) => record.metric);
    expect(metrics).toContain('run.count');
    expect(metrics).toContain('run.duration_ms');
    expect(metrics).toContain('step.count');
    expect(metrics.filter((metric) => metric === 'step.count')).toHaveLength(2);
  });
});

describe('Orcflo engine — step cache', () => {
  function cacheableWorkflow() {
    return orcfloWorkflowFixture({}, [
      {
        id: 'memo',
        type: 'action',
        label: 'Memoized',
        configuration: { cacheable: true },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]);
  }

  it('misses on first run and hits on an identical second run without re-executing', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(cacheableWorkflow());

    const first = await runWithFixture(harness, { q: 'same' });
    expect(first.steps.find((step) => step.nodeId === 'memo')?.status).toBe('COMPLETED');
    expect(first.steps.find((step) => step.nodeId === 'memo')?.cacheKey).toBeTruthy();
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'memo').length).toBe(1);

    const second = await runWithFixture(harness, { q: 'same' });
    const memoStep = second.steps.find((step) => step.nodeId === 'memo');
    expect(memoStep?.status).toBe('CACHED');
    expect(memoStep?.cacheHit).toBe(true);
    expect(memoStep?.output).toEqual(first.steps.find((step) => step.nodeId === 'memo')?.output);
    // The handler must not have been invoked a second time.
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'memo').length).toBe(1);

    const summary = await harness.engine.meteringSummary(orcfloActorContext);
    expect(summary.cacheMisses).toBe(1);
    expect(summary.cacheHits).toBe(1);
  });

  it('misses again when the input differs', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(cacheableWorkflow());
    await runWithFixture(harness, { q: 'one' });
    await runWithFixture(harness, { q: 'two' });
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'memo').length).toBe(2);
    const summary = await harness.engine.meteringSummary(orcfloActorContext);
    expect(summary.cacheMisses).toBe(2);
    expect(summary.cacheHits).toBe(0);
  });

  it('never caches nodes that are not explicitly cacheable', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await runWithFixture(harness, { q: 'same' });
    await runWithFixture(harness, { q: 'same' });
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'start').length).toBe(2);
    const entries = await harness.ports.stepCache.findByKey(orcfloActorContext.tenantId, 'anything');
    expect(entries).toBeNull();
  });
});

describe('Orcflo engine — model providers', () => {
  async function saveDemoProvider(harness: ReturnType<typeof buildOrcfloHarness>) {
    return harness.engine.saveModelProvider(orcfloActorContext, {
      name: 'demo-echo',
      kind: 'demo',
      model: 'demo-model-1',
    });
  }

  it('serves deterministic demo model calls and meters tokens', async () => {
    const harness = buildOrcfloHarness();
    const provider = await saveDemoProvider(harness);
    const result = await harness.engine.callModel(orcfloActorContext, {
      providerId: provider.id,
      prompt: 'Summarize the Lagos vendor queue.',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.text).toContain('demo-echo');
    expect(result.tokensIn).toBeGreaterThan(0);
    expect(result.tokensOut).toBeGreaterThan(0);

    const summary = await harness.engine.meteringSummary(orcfloActorContext);
    expect(summary.modelCalls).toBe(1);
    expect(summary.tokensIn).toBe(result.tokensIn);
    expect(summary.tokensOut).toBe(result.tokensOut);
  });

  it('refuses external and noop providers through the demo gateway', async () => {
    const harness = buildOrcfloHarness();
    const external = await harness.engine.saveModelProvider(orcfloActorContext, {
      name: 'external-vendor',
      kind: 'external',
      model: 'vendor-1',
      endpoint: 'https://example.invalid/v1',
    });
    await expect(harness.engine.callModel(orcfloActorContext, {
      providerId: external.id,
      prompt: 'hi',
    })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });

    const noop = await harness.engine.saveModelProvider(orcfloActorContext, { name: 'noop-box', kind: 'noop' });
    await expect(harness.engine.callModel(orcfloActorContext, {
      providerId: noop.id,
      prompt: 'hi',
    })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('requires an endpoint for external providers and rejects unknown providers', async () => {
    const harness = buildOrcfloHarness();
    await expect(harness.engine.saveModelProvider(orcfloActorContext, {
      name: 'bad-external',
      kind: 'external',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(harness.engine.callModel(orcfloActorContext, {
      providerId: 'model_missing',
      prompt: 'hi',
      maxTokens: 256,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('runs an agent node through a configured model provider', async () => {
    const harness = buildOrcfloHarness();
    const provider = await saveDemoProvider(harness);
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      {
        id: 'agent-step',
        type: 'agent',
        label: 'Draft summary',
        configuration: { modelProviderId: provider.id, promptTemplate: 'Summarize' },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]));
    const run = await runWithFixture(harness, { vendor: 'Alpha' });

    expect(run.status).toBe('COMPLETED');
    const agentStep = run.steps.find((step) => step.nodeId === 'agent-step');
    expect(agentStep?.status).toBe('COMPLETED');
    expect((agentStep?.output as Record<string, unknown>)?.response).toContain('demo-echo');
    const summary = await harness.engine.meteringSummary(orcfloActorContext);
    expect(summary.modelCalls).toBe(1);
  });

  it('fails closed when an agent node has no model provider configured', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'agent-step', type: 'agent', label: 'No model', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    await expect(runWithFixture(harness)).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});
