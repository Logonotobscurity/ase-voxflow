import { describe, expect, it } from 'vitest';
import type { WorkflowNodeHandler } from '../lib/application/orcflo-engine';
import { WorkflowSchema, type Workflow, type WorkflowEdge, type WorkflowNode } from '../lib/domain/schemas';
import {
  buildOrcfloHarness,
  demoNodeHandlers,
  orcfloActorContext,
} from './orcflo-helpers';

const NOW = '2026-08-14T09:00:00.000Z';

function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[], id = 'workflow_orcflo'): Workflow {
  return WorkflowSchema.parse({
    id,
    tenantId: orcfloActorContext.tenantId,
    name: 'Parallel test',
    description: '',
    status: 'READY',
    version: 1,
    nodes,
    edges,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function node(id: string, type: WorkflowNode['type'], configuration: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, label: id, configuration, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} };
}

function edge(id: string, source: string, target: string, extra: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return { id, source, target, metadata: {}, ...extra };
}

const action = (id: string) => node(id, 'action', { executionMode: 'demo' });

/** Handler that tracks how many invocations overlap in time. */
function trackingActionHandler(active: { value: number; max: number }, delayMs = 50) {
  const handler: WorkflowNodeHandler = async () => {
    active.value += 1;
    active.max = Math.max(active.max, active.value);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    active.value -= 1;
    return {
      output: { ok: true },
      evidence: [{ type: 'internal_trace', summary: 'tracked parallel execution' }],
      costMinor: 0,
    };
  };
  return handler;
}

describe('Parallel execution (§47)', () => {
  it('executes independent nodes concurrently up to the concurrency cap', async () => {
    const active = { value: 0, max: 0 };
    const handlers = new Map<WorkflowNode['type'], WorkflowNodeHandler>([
      ...demoNodeHandlers([]),
      ['action', trackingActionHandler(active, 60)],
    ]);
    const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z', handlers);
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('a1'), action('a2'), action('a3'), action('a4')],
      [
        edge('e1', 'start', 'a1'),
        edge('e2', 'start', 'a2'),
        edge('e3', 'start', 'a3'),
        edge('e4', 'start', 'a4'),
      ],
    ));
    const run = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      maxConcurrency: 2,
    });
    expect(run.status).toBe('COMPLETED');
    expect(active.max).toBe(2); // never exceeded the cap, but did overlap
    expect(run.steps.filter((step) => step.nodeId.startsWith('a') && step.status === 'COMPLETED').length).toBe(4);
  });

  it('behaves sequentially when maxConcurrency is 1', async () => {
    const active = { value: 0, max: 0 };
    const handlers = new Map<WorkflowNode['type'], WorkflowNodeHandler>([
      ...demoNodeHandlers([]),
      ['action', trackingActionHandler(active, 40)],
    ]);
    const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z', handlers);
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('a1'), action('a2'), action('a3')],
      [
        edge('e1', 'start', 'a1'),
        edge('e2', 'start', 'a2'),
        edge('e3', 'start', 'a3'),
      ],
    ));
    const run = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      maxConcurrency: 1,
    });
    expect(run.status).toBe('COMPLETED');
    expect(active.max).toBe(1);
  });

  it('keeps step/event ordering deterministic (topological within the wave)', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('left'), action('right')],
      [
        edge('e1', 'start', 'left'),
        edge('e2', 'start', 'right'),
      ],
    ));
    const run = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext, maxConcurrency: 8 });
    const events = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, run.id);
    const types = events.map((event) => event.eventType);
    expect(types).toEqual([
      'run.started',
      'step.started', // start
      'step.completed',
      'step.started', // left
      'step.started', // right  (both started before either completes)
      'step.completed', // left
      'step.completed', // right
      'run.completed',
    ]);
    // Steps recorded in topological order.
    expect(run.steps.map((step) => step.nodeId)).toEqual(['start', 'left', 'right']);
  });

  it('fails the run deterministically when a parallel branch fails', async () => {
    // demoNodeHandlers throw on configuration.failWith, so 'bad' fails
    // while 'good' completes — both run concurrently in the same wave.
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), node('bad', 'action', { failWith: 'exploded' }), action('good')],
      [
        edge('e1', 'start', 'bad'),
        edge('e2', 'start', 'good'),
      ],
    ));
    await expect(harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      maxConcurrency: 4,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR', message: 'exploded' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
    const events = await harness.ports.runEvents.listForRun(orcfloActorContext.tenantId, runs[0].id);
    const failed = events.find((event) => event.eventType === 'step.failed');
    expect(failed?.nodeId).toBe('bad');
    expect(events.some((event) => event.eventType === 'run.failed')).toBe(true);
  });

  it('executes a merged node exactly once when parallel branches converge', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('left'), action('right'), action('merge')],
      [
        edge('e1', 'start', 'left'),
        edge('e2', 'start', 'right'),
        edge('e3', 'left', 'merge'),
        edge('e4', 'right', 'merge'),
      ],
    ));
    const run = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext, maxConcurrency: 8 });
    expect(run.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'merge').length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'left').length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'right').length).toBe(1);
  });

  it('caches parallel cacheable nodes correctly across runs', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('c1', 'action', { executionMode: 'demo', cacheable: true }),
        node('c2', 'action', { executionMode: 'demo', cacheable: true }),
      ],
      [
        edge('e1', 'start', 'c1'),
        edge('e2', 'start', 'c2'),
      ],
    ));
    const first = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext, maxConcurrency: 4, input: { q: 1 } });
    expect(first.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'c1' || call.nodeId === 'c2').length).toBe(2);

    const second = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext, maxConcurrency: 4, input: { q: 1 } });
    expect(second.status).toBe('COMPLETED');
    const cached = second.steps.filter((step) => step.status === 'CACHED');
    expect(cached.map((step) => step.nodeId).sort()).toEqual(['c1', 'c2']);
    // Handlers did not run again.
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'c1' || call.nodeId === 'c2').length).toBe(2);

    const summary = await harness.engine.meteringSummary(orcfloActorContext);
    expect(summary.cacheMisses).toBe(2);
    expect(summary.cacheHits).toBe(2);
  });

  it('clamps an oversized concurrency request without failing', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('a1'), action('a2')],
      [edge('e1', 'start', 'a1'), edge('e2', 'start', 'a2')],
    ));
    const run = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      maxConcurrency: 10_000,
    });
    expect(run.status).toBe('COMPLETED');
  });
});
