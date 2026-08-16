import { describe, expect, it } from 'vitest';
import {
  WorkflowAsToolExecutor,
  WorkflowAsToolService,
  WORKFLOW_TOOL_DEPTH_KEY,
  WORKFLOW_TOOL_PARENT_KEY,
  workflowToolId,
} from '../lib/application/workflow-as-tool';
import { OrcfloEngine } from '../lib/application/orcflo-engine';
import { DemoModelProviderGateway } from '../lib/application/model-providers';
import type { OrcfloRuntimePorts } from '../lib/application/ports';
import {
  DeterministicToolExecutor,
  FixedClock,
  InMemoryUnitOfWork,
  createInMemoryPersistencePorts,
} from '../lib/infrastructure/memory-adapters';
import { agentFixture, toolFixture } from './helpers';
import {
  buildOrcfloHarness,
  demoNodeHandlers,
  orcfloActorContext,
  orcfloWorkflowFixture,
  runWithFixture,
} from './orcflo-helpers';

describe('Workflow-as-Tool — AGENT → WORKFLOW bridge', () => {
  it('registers a READY workflow as a first-class tool in the canonical registry', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const tool = await service.register(orcfloActorContext, 'workflow_orcflo');

    expect(tool.id).toBe(workflowToolId('workflow_orcflo'));
    expect(tool.name).toContain('workflow_');
    expect(tool.availability).toBe('AVAILABLE');
    expect(tool.metadata).toMatchObject({ orcfloTool: true, workflowId: 'workflow_orcflo' });
    // Persisted through the canonical tool repository.
    expect(await harness.ports.tools.findById(orcfloActorContext.tenantId, tool.id)).toEqual(tool);
  });

  it('refuses to register a workflow that is not READY', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({ status: 'DRAFT' }));
    const service = new WorkflowAsToolService(harness.ports);
    await expect(service.register(orcfloActorContext, 'workflow_orcflo'))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('describes without persisting and requires workflow:write to register', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const described = await service.describe(orcfloActorContext, 'workflow_orcflo');
    expect(described.metadata.orcfloTool).toBe(true);
    expect(await harness.ports.tools.findById(orcfloActorContext.tenantId, described.id)).toBeNull();

    await expect(service.register({ ...orcfloActorContext, role: 'VIEWER' }, 'workflow_orcflo'))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('soft-unregisters by flipping availability so the policy gate denies it', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    await service.register(orcfloActorContext, 'workflow_orcflo');
    const disabled = await service.unregister(orcfloActorContext, 'workflow_orcflo');
    expect(disabled.availability).toBe('UNAVAILABLE');

    const executor = new WorkflowAsToolExecutor(() => harness.engine);
    const tool = await harness.ports.tools.findById(orcfloActorContext.tenantId, workflowToolId('workflow_orcflo'));
    await expect(executor.execute({
      tenantId: orcfloActorContext.tenantId,
      executionId: 'exec_1',
      agentId: 'agent_1',
      tool: tool!,
      input: {},
      signal: new AbortController().signal,
      context: orcfloActorContext,
    })).rejects.toMatchObject({ code: 'TOOL_EXECUTION_FAILED' });
  });

  it('executes the workflow through the engine when an agent invokes the tool', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const tool = await service.register(orcfloActorContext, 'workflow_orcflo');

    // Route workflow tools to the engine, everything else to the base executor.
    const workflowExecutor = new WorkflowAsToolExecutor(() => harness.engine, { maxDepth: 3 });
    const base = harness.ports.toolExecutor;
    harness.ports.toolExecutor = {
      execute: async (invocation) => (
        invocation.tool.metadata?.orcfloTool === true
          ? workflowExecutor.execute(invocation)
          : base.execute(invocation)
      ),
    };

    const agent = agentFixture({
      id: 'agent_workflow_caller',
      tenantId: orcfloActorContext.tenantId,
      status: 'READY',
      toolIds: [tool.id],
    });
    await harness.ports.agents.save(agent);

    const result = await harness.agentRuntime.run({
      agentId: agent.id,
      executionId: 'exec_workflow_caller',
      objective: 'Run the vendor workflow.',
      input: { customer: 'Ada' },
      context: orcfloActorContext,
      planner: async (state) => {
        if (state.iteration === 1 && state.observations.length === 0) {
          return { action: 'invoke_tool', toolId: tool.id, input: { customer: 'Ada' } };
        }
        return { action: 'complete', summary: 'Workflow completed.' };
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.toolCalls).toBe(1);
    expect(result.evidence.some((evidence) => evidence.reference?.startsWith('run:'))).toBe(true);

    // The nested workflow run exists and completed; the reserved keys
    // carry depth and the parent agent execution id for traceability.
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('COMPLETED');
    expect(runs[0].input).toMatchObject({ customer: 'Ada', [WORKFLOW_TOOL_DEPTH_KEY]: 1, [WORKFLOW_TOOL_PARENT_KEY]: 'exec_workflow_caller' });
  });

  it('fails closed when the caller context is missing', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const tool = await service.register(orcfloActorContext, 'workflow_orcflo');
    const executor = new WorkflowAsToolExecutor(() => harness.engine);
    await expect(executor.execute({
      tenantId: orcfloActorContext.tenantId,
      executionId: 'exec_1',
      agentId: 'agent_1',
      tool,
      input: {},
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('enforces the recursion depth limit with a machine-readable error', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const tool = await service.register(orcfloActorContext, 'workflow_orcflo');
    const executor = new WorkflowAsToolExecutor(() => harness.engine, { maxDepth: 2 });
    await expect(executor.execute({
      tenantId: orcfloActorContext.tenantId,
      executionId: 'exec_1',
      agentId: 'agent_1',
      tool,
      input: { [WORKFLOW_TOOL_DEPTH_KEY]: 2 },
      signal: new AbortController().signal,
      context: orcfloActorContext,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    // Nothing was started for the refused call.
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(0);
  });

  it('routes only workflow tools to the engine through the composite executor', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const service = new WorkflowAsToolService(harness.ports);
    const tool = await service.register(orcfloActorContext, 'workflow_orcflo');
    const workflowExecutor = new WorkflowAsToolExecutor(() => harness.engine);
    const { WorkflowAwareToolExecutor } = await import('../lib/application/workflow-as-tool');
    const composite = new WorkflowAwareToolExecutor(harness.ports.toolExecutor, workflowExecutor);
    await expect(composite.execute({
      tenantId: orcfloActorContext.tenantId,
      executionId: 'exec_1',
      agentId: 'agent_1',
      tool,
      input: { [WORKFLOW_TOOL_DEPTH_KEY]: 5 },
      signal: new AbortController().signal,
      context: orcfloActorContext,
    })).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
  });
});

describe('Agent-as-Node — WORKFLOW → AGENT bridge', () => {
  function seedToolExecutor(harness: ReturnType<typeof buildOrcfloHarness>) {
    harness.ports.toolExecutor = new DeterministicToolExecutor(new Map([
      ['tool_lookup', async () => ({
        output: { found: true, vendor: 'Alpha' },
        costMinor: 20,
        evidence: [{ type: 'tool_result', summary: 'Vendor looked up deterministically.' }],
      })],
    ]));
    // The canonical runtime resolves tools through the tool repository.
    return toolFixture({ tenantId: orcfloActorContext.tenantId });
  }

  it('executes an agent node through the canonical BoundedAgentRuntime', async () => {
    const harness = buildOrcfloHarness();
    const tool = seedToolExecutor(harness);
    await harness.ports.tools.save(tool);
    const agent = agentFixture({ id: 'agent_node', tenantId: orcfloActorContext.tenantId, status: 'READY', toolIds: ['tool_lookup'] });
    await harness.ports.agents.save(agent);
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      {
        id: 'agent-step',
        type: 'agent',
        label: 'Research vendor',
        configuration: { agentId: agent.id, toolId: 'tool_lookup' },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]));

    const run = await runWithFixture(harness, { vendor: 'Alpha' });
    expect(run.status).toBe('COMPLETED');
    const step = run.steps.find((candidate) => candidate.nodeId === 'agent-step');
    expect(step?.status).toBe('COMPLETED');
    expect(step?.output).toMatchObject({ agentId: agent.id, toolCalls: 1 });
    expect(step?.costMinor).toBe(20);

    // The canonical lifecycle advanced the agent: READY → RUNNING → COMPLETED.
    const stored = await harness.ports.agents.findById(orcfloActorContext.tenantId, agent.id);
    expect(stored?.status).toBe('COMPLETED');
  });

  it('fails closed when the agent node has no agentId', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'agent-step', type: 'agent', label: 'No agent', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    await expect(runWithFixture(harness)).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('fails closed when the engine has no canonical agent runtime wired', async () => {
    const { store, ports, orcflo } = createInMemoryPersistencePorts();
    const runtimePorts: OrcfloRuntimePorts = {
      ...ports,
      ...orcflo,
      unitOfWork: new InMemoryUnitOfWork(store, ports),
      toolExecutor: new DeterministicToolExecutor(new Map()),
    };
    const clock = new FixedClock('2026-08-14T10:00:00.000Z');
    // No agentRuntime option -> agent nodes must not run at all.
    const engine = new OrcfloEngine(runtimePorts, demoNodeHandlers([]), new DemoModelProviderGateway(), clock);
    const agent = agentFixture({ id: 'agent_no_runtime', tenantId: orcfloActorContext.tenantId, status: 'READY', toolIds: [] });
    await runtimePorts.agents.save(agent);
    await runtimePorts.workflows.save(orcfloWorkflowFixture({}, [
      {
        id: 'agent-step',
        type: 'agent',
        label: 'Unwired agent',
        configuration: { agentId: agent.id },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]));
    await expect(engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('fails the run when the agent requires approval (resumable approval is not yet wired)', async () => {
    const harness = buildOrcfloHarness();
    const tool = seedToolExecutor(harness);
    await harness.ports.tools.save(tool);
    const agent = agentFixture({
      id: 'agent_approval',
      tenantId: orcfloActorContext.tenantId,
      status: 'READY',
      toolIds: ['tool_lookup'],
      policies: { ...agentFixture().policies, requireApprovalFor: ['vendor_lookup'] },
    });
    await harness.ports.agents.save(agent);
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      {
        id: 'agent-step',
        type: 'agent',
        label: 'Approval-bound agent',
        configuration: { agentId: agent.id, toolId: 'tool_lookup' },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]));
    await expect(runWithFixture(harness)).rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
  });
});
