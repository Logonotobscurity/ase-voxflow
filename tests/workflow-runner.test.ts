import { describe, expect, it, vi } from 'vitest';
import { WorkflowRunner, type WorkflowNodeHandler } from '../lib/application/workflow-runner';
import { PlatformError } from '../lib/domain/errors';
import type { WorkflowNode } from '../lib/domain/schemas';
import { actorContext, memoryPorts, workflowFixture } from './helpers';

const completeHandler: WorkflowNodeHandler = (node) => ({
  output: { nodeId: node.id },
  evidence: [{ type: 'state_change', summary: `${node.label} completed.` }],
  costMinor: 0,
});

function runnerSetup(handlers: ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler> = new Map([
  ['trigger', completeHandler],
  ['action', completeHandler],
])) {
  const ports = memoryPorts();
  const runner = new WorkflowRunner(ports, handlers);
  return { ports, runner };
}

describe('WorkflowRunner', () => {
  it('persists an evidenced complete path and correlated events', async () => {
    const { ports, runner } = runnerSetup();
    await ports.workflows.save(workflowFixture());
    const result = await runner.run({ workflowId: 'workflow_test', context: actorContext, input: { vendor: 'Kora' } });

    expect(result.execution.status).toBe('COMPLETED');
    expect(result.execution.nodeResults.map((node) => node.nodeId)).toEqual(['start', 'end']);
    expect(result.evidence).toHaveLength(2);
    expect((await ports.executions.findById(actorContext.tenantId, result.execution.id))?.status).toBe('COMPLETED');
    expect((await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId)).map((event) => event.eventType))
      .toEqual(['workflow.execution.started', 'workflow.execution.completed']);
  });

  it('rejects cyclic workflow graphs before creating an execution', async () => {
    const { ports, runner } = runnerSetup();
    await ports.workflows.save(workflowFixture({
      edges: [
        { id: 'edge_a', source: 'start', target: 'end', metadata: {} },
        { id: 'edge_b', source: 'end', target: 'start', metadata: {} },
      ],
    }));
    await expect(runner.run({ workflowId: 'workflow_test', context: actorContext }))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    expect(await ports.executions.listForWorkflow(actorContext.tenantId, 'workflow_test')).toHaveLength(0);
  });

  it('stops at an explicit human approval state', async () => {
    const { ports, runner } = runnerSetup();
    await ports.workflows.save(workflowFixture({
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 250 }, metadata: {} },
        { id: 'approval', type: 'human_approval', label: 'Finance approval', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 250 }, metadata: {} },
      ],
      edges: [{ id: 'edge_approval', source: 'start', target: 'approval', metadata: {} }],
    }));
    const result = await runner.run({ workflowId: 'workflow_test', context: actorContext });
    expect(result.execution.status).toBe('WAITING_APPROVAL');
    expect(result.execution.nodeResults.at(-1)).toMatchObject({ nodeId: 'approval', status: 'WAITING_APPROVAL' });
  });

  it('retries only retryable failures within the node retry limit', async () => {
    const handler = vi.fn<WorkflowNodeHandler>()
      .mockRejectedValueOnce(new PlatformError('NETWORK_ERROR', 'Temporary failure', { retryable: true }))
      .mockResolvedValue({ output: {}, evidence: [{ type: 'external_reference', summary: 'Recovered.' }] });
    const { ports, runner } = runnerSetup(new Map<WorkflowNode['type'], WorkflowNodeHandler>([['trigger', handler], ['action', completeHandler]]));
    const workflow = workflowFixture();
    workflow.nodes[0].retryPolicy = { maxRetries: 1, backoffMs: 0 };
    await ports.workflows.save(workflow);

    const result = await runner.run({ workflowId: 'workflow_test', context: actorContext });
    expect(result.execution.status).toBe('COMPLETED');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('persists a failed state when a node handler fails', async () => {
    const handler: WorkflowNodeHandler = () => {
      throw new PlatformError('PROVIDER_ERROR', 'Provider unavailable', { retryable: false });
    };
    const { ports, runner } = runnerSetup(new Map<WorkflowNode['type'], WorkflowNodeHandler>([['trigger', handler], ['action', completeHandler]]));
    await ports.workflows.save(workflowFixture());
    await expect(runner.run({ workflowId: 'workflow_test', context: actorContext }))
      .rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    const [execution] = await ports.executions.listForWorkflow(actorContext.tenantId, 'workflow_test');
    expect(execution.status).toBe('FAILED');
    expect(execution.output).toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('enforces a wall-clock deadline when a node ignores cancellation', async () => {
    const neverCompletes: WorkflowNodeHandler = () => new Promise(() => undefined);
    const { ports, runner } = runnerSetup(new Map<WorkflowNode['type'], WorkflowNodeHandler>([
      ['trigger', neverCompletes],
      ['action', completeHandler],
    ]));
    const workflow = workflowFixture();
    workflow.nodes[0].configuration = { timeoutMs: 10 };
    await ports.workflows.save(workflow);

    await expect(runner.run({ workflowId: 'workflow_test', context: actorContext, maxDurationMs: 100 }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    const [execution] = await ports.executions.listForWorkflow(actorContext.tenantId, 'workflow_test');
    expect(execution.status).toBe('FAILED');
    expect(execution.output).toMatchObject({ code: 'TIMEOUT' });
  });
});
