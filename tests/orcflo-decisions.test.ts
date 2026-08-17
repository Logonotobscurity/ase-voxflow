import { describe, expect, it } from 'vitest';
import { WorkflowSchema, type Workflow, type WorkflowEdge, type WorkflowNode } from '../lib/domain/schemas';
import {
  buildOrcfloHarness,
  orcfloActorContext,
} from './orcflo-helpers';

const NOW = '2026-08-14T09:00:00.000Z';

function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return WorkflowSchema.parse({
    id: 'workflow_orcflo',
    tenantId: orcfloActorContext.tenantId,
    name: 'Decisions test',
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

describe('Persisted decision records', () => {
  it('records condition, router and for_each decisions for a run', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('route', 'router', { routes: [{ key: 'sales' }, { key: 'support' }], pickPath: 'kind', defaultRoute: 'support' }),
        node('check', 'condition', { path: 'value', op: 'gte', value: 1000 }),
        action('escalate'),
        action('close'),
        node('each', 'for_each', { collection: 'items' }),
        action('process'),
        action('finish'),
      ],
      [
        edge('e1', 'start', 'route'),
        edge('e2', 'route', 'check', { sourceHandle: 'sales' }),
        edge('e3', 'check', 'escalate', { condition: true }),
        edge('e4', 'check', 'close', { condition: false }),
        edge('e5', 'escalate', 'each'),
        edge('e6', 'close', 'each'),
        edge('e7', 'each', 'process'),
        edge('e8', 'process', 'each', { loop: true }),
        edge('e9', 'each', 'finish', { loopExit: true }),
      ],
    ));

    const run = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { kind: 'sales', value: 2500, items: ['a', 'b'] },
    });
    expect(run.status).toBe('COMPLETED');

    const decisions = await harness.engine.listRunDecisions(orcfloActorContext, run.id);
    const byKind = (kind: string) => decisions.filter((d) => d.kind === kind);

    // Router: one decision, route = sales.
    const routers = byKind('router');
    expect(routers).toHaveLength(1);
    expect(routers[0].nodeId).toBe('route');
    expect(routers[0].subject).toBe('kind');
    expect(routers[0].result).toMatchObject({ route: 'sales' });

    // Condition: one decision, result true.
    const conditions = byKind('condition');
    expect(conditions).toHaveLength(1);
    expect(conditions[0].nodeId).toBe('check');
    expect(conditions[0].subject).toBe('value');
    expect(conditions[0].result).toMatchObject({ result: true });

    // for_each: 2 item emits + 1 done check = 3 decisions.
    const eachs = byKind('for_each');
    expect(eachs).toHaveLength(3);
    expect(eachs.map((d) => (d.result as { done?: boolean }).done)).toEqual([false, false, true]);
    expect(eachs.map((d) => d.iteration)).toEqual([0, 1, 2]);

    // Order is occurrence order.
    const kinds = decisions.map((d) => d.kind);
    expect(kinds[0]).toBe('router');
    expect(kinds[1]).toBe('condition');
  });

  it('isolates decision records per tenant', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [node('start', 'trigger', { executionMode: 'demo' }), node('check', 'condition', { path: 'x' }), action('after')],
      [
        edge('e1', 'start', 'check'),
        edge('e2', 'check', 'after', { condition: true }),
      ],
    ));
    const run = await harness.engine.startRun({ workflowId: 'workflow_orcflo', context: orcfloActorContext, input: { x: 1 } });
    const decisions = await harness.engine.listRunDecisions(orcfloActorContext, run.id);
    expect(decisions).toHaveLength(1);
    expect((await harness.ports.decisions.listForRun('tenant_other', run.id))).toHaveLength(0);
  });

  it('records decisions across async execution and resumes', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(workflow(
      [
        node('start', 'trigger', { executionMode: 'demo' }),
        node('route', 'router', { routes: [{ key: 'a' }, { key: 'b' }], pickPath: 'kind' }),
        node('approve', 'human_approval', {}),
        action('after'),
      ],
      [
        edge('e1', 'start', 'route'),
        edge('e2', 'route', 'approve', { sourceHandle: 'a' }),
        edge('e3', 'approve', 'after'),
      ],
    ));
    const created = await harness.engine.createRun({
      workflowId: 'workflow_orcflo',
      context: { ...orcfloActorContext, role: 'APPROVER' },
      input: { kind: 'a' },
    });
    await harness.engine.executeRun(created.id);
    const paused = await harness.ports.runs.findById(orcfloActorContext.tenantId, created.id);
    expect(paused?.status).toBe('WAITING_APPROVAL');

    // The router decision was recorded in the first phase.
    let decisions = await harness.engine.listRunDecisions(orcfloActorContext, created.id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].kind).toBe('router');

    // Approve -> resumes; the approval node has no decision but the run completes.
    const resumed = await harness.engine.decideApproval(
      { ...orcfloActorContext, role: 'APPROVER' },
      created.id,
      'APPROVED',
    );
    expect(resumed.status).toBe('COMPLETED');
    decisions = await harness.engine.listRunDecisions(orcfloActorContext, created.id);
    expect(decisions).toHaveLength(1); // still just the router decision
  });
});
