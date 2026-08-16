import { describe, expect, it } from 'vitest';
import { PlatformError } from '../lib/domain/errors';
import { validateWorkflowGraph } from '../lib/domain/workflow-graph';
import type { WorkflowNodeHandler } from '../lib/application/orcflo-engine';
import { WorkflowSchema, type Workflow, type WorkflowEdge, type WorkflowNode } from '../lib/domain/schemas';
import { WorkflowRunner } from '../lib/application/workflow-runner';
import { buildOrcfloHarness, orcfloActorContext, runWithFixture } from './orcflo-helpers';

const NOW = '2026-08-14T09:00:00.000Z';

function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[], id = 'workflow_orcflo'): Workflow {
  return WorkflowSchema.parse({
    id,
    tenantId: orcfloActorContext.tenantId,
    name: 'Control flow test',
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

describe('Conditional edges (§12)', () => {
  it('fires only the matching branch and records the other as SKIPPED', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), node('check', 'condition', { path: 'score', op: 'gt', value: 10 }), action('yes'), action('no')],
      [
        edge('e1', 'start', 'check'),
        edge('e2', 'check', 'yes', { condition: true }),
        edge('e3', 'check', 'no', { condition: false }),
      ],
    ));
    const run = await runWithFixture(harness, { score: 15 });
    expect(run.status).toBe('COMPLETED');

    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('start')).toBe('COMPLETED');
    expect(byNode.get('check')).toBe('COMPLETED');
    expect(byNode.get('yes')).toBe('COMPLETED');
    expect(byNode.get('no')).toBe('SKIPPED');
    // The yes handler ran; the no handler did not.
    expect(harness.handlerCalls.some((call) => call.nodeId === 'yes')).toBe(true);
    expect(harness.handlerCalls.some((call) => call.nodeId === 'no')).toBe(false);
  });

  it('takes the false branch when the condition fails', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), node('check', 'condition', { path: 'score', op: 'gte', value: 10 }), action('yes'), action('no')],
      [
        edge('e1', 'start', 'check'),
        edge('e2', 'check', 'yes', { condition: true }),
        edge('e3', 'check', 'no', { condition: false }),
      ],
    ));
    const run = await runWithFixture(harness, { score: 3 });
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('yes')).toBe('SKIPPED');
    expect(byNode.get('no')).toBe('COMPLETED');
    expect(harness.handlerCalls.some((call) => call.nodeId === 'no')).toBe(true);
  });

  it('evaluates conditions against previous node outputs', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), node('check', 'condition', { path: 'outputs.start.flag', op: 'eq', value: true }), action('then')],
      [
        edge('e1', 'start', 'check'),
        edge('e2', 'check', 'then', { condition: true }),
      ],
    ));
    // The demo trigger handler outputs { nodeId: 'start', mode: 'demo', ... } — no flag.
    const run = await runWithFixture(harness);
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('then')).toBe('SKIPPED');
  });

  it('supports edge conditions on structured handler output (result field)', async () => {
    const flagged: WorkflowNodeHandler = () => ({
      output: { result: true, note: 'flagged' },
      evidence: [{ type: 'internal_trace', summary: 'flagged' }],
      costMinor: 0,
    });
    const { demoNodeHandlers } = await import('./orcflo-helpers');
    const flaggedHarness = buildOrcfloHarness(
      '2026-08-14T10:00:00.000Z',
      new Map([...demoNodeHandlers([]), ['action', flagged]]),
    );
    await flaggedHarness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), action('decide'), action('next')],
      [
        edge('e1', 'start', 'decide'),
        edge('e2', 'decide', 'next', { condition: true }),
      ],
    ));
    const run = await flaggedHarness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext });
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('decide')).toBe('COMPLETED');
    expect(byNode.get('next')).toBe('COMPLETED');
  });
});

describe('Router nodes (§13)', () => {
  const routerWorkflow = () => workflow(
    [
      node('start', 'trigger', { executionMode: 'demo' }),
      node('route', 'router', {
        routes: [{ key: 'support', label: 'Support' }, { key: 'sales', label: 'Sales' }],
        pickPath: 'ticket.type',
        defaultRoute: 'support',
      }),
      action('support_agent'),
      action('sales_agent'),
    ],
    [
      edge('e1', 'start', 'route'),
      edge('e2', 'route', 'support_agent', { sourceHandle: 'support' }),
      edge('e3', 'route', 'sales_agent', { sourceHandle: 'sales' }),
    ],
  );

  it('fires the edge matching the chosen route and skips the others', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(routerWorkflow());
    const run = await runWithFixture(harness, { ticket: { type: 'sales' } });
    expect(run.status).toBe('COMPLETED');
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('sales_agent')).toBe('COMPLETED');
    expect(byNode.get('support_agent')).toBe('SKIPPED');
    const routeStep = run.steps.find((step) => step.nodeId === 'route');
    expect(routeStep?.output).toMatchObject({ route: 'sales' });
  });

  it('falls back to the default route', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(routerWorkflow());
    const run = await runWithFixture(harness, { ticket: { type: 'billing' } });
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('support_agent')).toBe('COMPLETED');
    expect(byNode.get('sales_agent')).toBe('SKIPPED');
  });

  it('fails the run with a machine-readable reason when no route matches', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('route', 'router', { routes: [{ key: 'a' }], pickPath: 'kind' }),
        action('a_agent'),
      ],
      [edge('e1', 'start', 'route'), edge('e2', 'route', 'a_agent', { sourceHandle: 'a' })],
    ));
    await expect(runWithFixture(harness, { kind: 'b' }))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
    expect(String((runs[0].output as { message?: unknown } | undefined)?.message)).toContain('no defaultRoute');
  });

  it('fails when the chosen route has no outgoing edge', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('route', 'router', { routes: [{ key: 'a' }, { key: 'b' }], pickPath: 'kind' }),
        action('a_agent'),
      ],
      [edge('e1', 'start', 'route'), edge('e2', 'route', 'a_agent', { sourceHandle: 'a' })],
    ));
    await expect(runWithFixture(harness, { kind: 'b' })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
  });
});

describe('Bounded loops (§14)', () => {
  const loopWorkflow = (extra: Partial<WorkflowNode['configuration']> = {}) => workflow(
    [
      node('start', 'trigger', { executionMode: 'demo' }),
      node('each', 'for_each', { collection: 'items', ...extra }),
      action('process'),
      action('finish'),
    ],
    [
      edge('e1', 'start', 'each'),
      edge('e2', 'each', 'process'),
      edge('e3', 'process', 'each', { loop: true }),
      edge('e4', 'each', 'finish', { loopExit: true }),
    ],
    'workflow_orcflo',
  );

  it('iterates once per item and then takes the exit path', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(loopWorkflow());
    const run = await runWithFixture(harness, { items: ['a', 'b', 'c'] });
    expect(run.status).toBe('COMPLETED');

    const processed = harness.handlerCalls.filter((call) => call.nodeId === 'process');
    expect(processed.map((call) => call.input.item)).toEqual(['a', 'b', 'c']);
    expect(processed.map((call) => call.input.index)).toEqual([0, 1, 2]);

    const byNode = new Map<string, number>();
    for (const step of run.steps) byNode.set(step.nodeId, (byNode.get(step.nodeId) ?? 0) + 1);
    // Head visits: 3 items + 1 done check. process: 3. finish: 1.
    expect(byNode.get('each')).toBe(4);
    expect(byNode.get('process')).toBe(3);
    expect(byNode.get('finish')).toBe(1);
    expect(harness.handlerCalls.some((call) => call.nodeId === 'finish')).toBe(true);

    // The final head step reports done.
    const headSteps = run.steps.filter((step) => step.nodeId === 'each');
    expect(headSteps.at(-1)?.output).toMatchObject({ done: true, count: 3, processed: 3 });
    expect(headSteps.at(0)?.output).toMatchObject({ item: 'a', index: 0, done: false });
  });

  it('skips the body entirely for an empty collection', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(loopWorkflow());
    const run = await runWithFixture(harness, { items: [] });
    expect(run.status).toBe('COMPLETED');
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('each')).toBe('COMPLETED');
    expect(byNode.get('process')).toBe('SKIPPED');
    expect(byNode.get('finish')).toBe('COMPLETED');
    expect(harness.handlerCalls.some((call) => call.nodeId === 'process')).toBe(false);
  });

  it('fails when the collection exceeds maxItems', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(loopWorkflow({ maxItems: 2 }));
    await expect(runWithFixture(harness, { items: [1, 2, 3] }))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
    expect(String((runs[0].output as { message?: unknown } | undefined)?.message)).toContain('item limit');
  });

  it('fails when maxIterations is reached with items remaining', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(loopWorkflow({ maxIterations: 2 }));
    await expect(runWithFixture(harness, { items: [1, 2, 3, 4] }))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(String((runs[0].output as { message?: unknown } | undefined)?.message)).toContain('iteration limit');
  });

  it('enforces the global node execution cap', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(loopWorkflow());
    await expect(harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { items: [1, 2, 3, 4, 5] },
      maxNodeExecutions: 6,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
  });

  it('supports a condition inside the loop body consuming the item', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('each', 'for_each', { collection: 'items' }),
        node('check', 'condition', { path: 'item', op: 'gt', value: 1 }),
        action('big'),
        action('small'),
        action('finish'),
      ],
      [
        edge('e1', 'start', 'each'),
        edge('e2', 'each', 'check'),
        edge('e3', 'check', 'big', { condition: true }),
        edge('e4', 'check', 'small', { condition: false }),
        edge('e5', 'check', 'each', { loop: true }),
        edge('e6', 'each', 'finish', { loopExit: true }),
      ],
    ));
    const run = await runWithFixture(harness, { items: [1, 5, 0] });
    expect(run.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'big').length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'small').length).toBe(2);
  });
});

describe('Graph validation (§45)', () => {
  it('rejects a plain cycle with no loop edge', () => {
    expect(() => validateWorkflowGraph(workflow(
      [action('a'), action('b')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
    ))).toThrow(PlatformError);
  });

  it('rejects a loop edge that does not target a for_each node', () => {
    expect(() => validateWorkflowGraph(workflow(
      [action('a'), action('b')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a', { loop: true })],
    ))).toThrow(/for_each/);
  });

  it('rejects a for_each loop head without an exit edge', () => {
    expect(() => validateWorkflowGraph(workflow(
      [node('each', 'for_each', { collection: 'items' }), action('body'), action('after')],
      [
        edge('e1', 'each', 'body'),
        edge('e2', 'body', 'each', { loop: true }),
        edge('e3', 'each', 'after'),
      ],
    ))).toThrow(/loopExit/);
  });

  it('rejects a loopExit edge not originating from for_each', () => {
    expect(() => validateWorkflowGraph(workflow(
      [action('a'), action('b')],
      [edge('e1', 'a', 'b', { loopExit: true })],
    ))).toThrow(/for_each/);
  });

  it('rejects nested loops', () => {
    expect(() => validateWorkflowGraph(workflow(
      [
        node('outer', 'for_each', { collection: 'a' }),
        node('inner', 'for_each', { collection: 'b' }),
        action('body'),
        action('after'),
      ],
      [
        edge('e1', 'outer', 'inner'),
        edge('e2', 'inner', 'body'),
        edge('e3', 'body', 'inner', { loop: true }),
        edge('e4', 'inner', 'outer', { loop: true }),
        edge('e5', 'outer', 'after', { loopExit: true }),
        edge('e6', 'inner', 'after', { loopExit: true }),
      ],
    ))).toThrow(/Nested/);
  });

  it('rejects a router edge whose sourceHandle matches no route', () => {
    expect(() => validateWorkflowGraph(workflow(
      [node('route', 'router', { routes: [{ key: 'a' }] }), action('x')],
      [edge('e1', 'route', 'x', { sourceHandle: 'nope' })],
    ))).toThrow(/sourceHandle/);
  });

  it('accepts a valid bounded loop graph', () => {
    expect(() => validateWorkflowGraph(workflow(
      [node('each', 'for_each', { collection: 'items' }), action('body'), action('after')],
      [
        edge('e1', 'each', 'body'),
        edge('e2', 'body', 'each', { loop: true }),
        edge('e3', 'each', 'after', { loopExit: true }),
      ],
    ))).not.toThrow();
  });

  it('rejects loop workflows in the legacy linear runner', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('each', 'for_each', { collection: 'items' }), action('body'), action('after')],
      [
        edge('e1', 'each', 'body'),
        edge('e2', 'body', 'each', { loop: true }),
        edge('e3', 'each', 'after', { loopExit: true }),
      ],
    ));
    const runner = new WorkflowRunner(harness.ports, new Map());
    await expect(runner.run({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { items: [1] },
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('Merge and traversal invariants', () => {
  it('executes a merged node exactly once when two branches fire', async () => {
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
    const run = await runWithFixture(harness);
    expect(run.status).toBe('COMPLETED');
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'merge').length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'left').length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'right').length).toBe(1);
  });

  it('starts from every entry node even when they are disconnected', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('a', 'trigger', { executionMode: 'demo' }), action('b'), node('c', 'trigger', { executionMode: 'demo' }), action('d')],
      [edge('e1', 'a', 'b'), edge('e2', 'c', 'd')],
    ));
    const run = await runWithFixture(harness);
    expect(run.status).toBe('COMPLETED');
    const byNode = new Map(run.steps.map((step) => [step.nodeId, step.status]));
    expect(byNode.get('a')).toBe('COMPLETED');
    expect(byNode.get('b')).toBe('COMPLETED');
    expect(byNode.get('c')).toBe('COMPLETED');
    expect(byNode.get('d')).toBe('COMPLETED');
  });
});
