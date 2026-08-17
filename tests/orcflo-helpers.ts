import type { OrcfloRuntimePorts } from '../lib/application/ports';
import { BoundedAgentRuntime } from '../lib/application/agent-runtime';
import { OrcfloEngine, type WorkflowNodeHandler } from '../lib/application/orcflo-engine';
import { DemoModelProviderGateway } from '../lib/application/model-providers';
import { PlatformError } from '../lib/domain/errors';
import { WorkflowSchema, type Workflow, type WorkflowNode } from '../lib/domain/schemas';
import type { ActorContext } from '../lib/domain/policy';
import {
  createInMemoryPersistencePorts,
  DeterministicToolExecutor,
  FixedClock,
  InMemoryUnitOfWork,
} from '../lib/infrastructure/memory-adapters';

export const orcfloActorContext: ActorContext = {
  tenantId: 'tenant_orcflo',
  actorId: 'actor_builder',
  role: 'BUILDER',
  correlationId: 'corr_orcflo',
  environment: 'demo',
};

export type OrcfloTestHarness = {
  ports: OrcfloRuntimePorts;
  engine: OrcfloEngine;
  /** Canonical agent runtime wired to the engine for `agent` nodes. */
  agentRuntime: BoundedAgentRuntime;
  clock: FixedClock;
  handlerCalls: Array<{ nodeId: string; input: Record<string, unknown> }>;
  runWith: typeof runWithFixture;
};

/** Deterministic demo node handlers mirroring the platform composition root. */
export function demoNodeHandlers(calls: Array<{ nodeId: string; input: Record<string, unknown> }>): ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler> {
  const deterministic: WorkflowNodeHandler = (node, input, signal) => {
    if (signal.aborted) throw new PlatformError('TIMEOUT', `${node.label} was aborted.`, { retryable: true });
    calls.push({ nodeId: node.id, input });
    if (node.configuration.failWith) {
      throw new PlatformError('WORKFLOW_ERROR', String(node.configuration.failWith));
    }
    return {
      output: { nodeId: node.id, mode: 'demo', inputKeys: Object.keys(input), seen: input.seen ?? null },
      evidence: [{
        type: 'internal_trace',
        summary: `${node.label} completed in the demo runtime.`,
        data: { nodeId: node.id, simulated: true },
      }],
      costMinor: typeof node.configuration.costMinor === 'number' ? node.configuration.costMinor : 0,
    };
  };
  const mcp: WorkflowNodeHandler = (node) => {
    if (node.configuration.trusted !== true) {
      throw new PlatformError('AUTHORIZATION_DENIED', `MCP node ${node.id} is not trusted.`);
    }
    return deterministic(node, {}, new AbortController().signal);
  };
  return new Map<WorkflowNode['type'], WorkflowNodeHandler>([
    ['trigger', deterministic],
    ['action', deterministic],
    ['condition', deterministic],
    ['voice_command', deterministic],
    ['schedule', deterministic],
    ['tool', deterministic],
    ['webhook', deterministic],
    ['mcp', mcp],
    ['handoff', deterministic],
  ]);
}

export function buildOrcfloHarness(
  fixedNowIso = '2026-08-14T10:00:00.000Z',
  handlers?: ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler>,
  engineOptions: { runEventBus?: import('../lib/application/run-event-bus').RunEventBus } = {},
): OrcfloTestHarness {
  const { store, ports, orcflo } = createInMemoryPersistencePorts();
  const runtimePorts: OrcfloRuntimePorts = {
    ...ports,
    ...orcflo,
    unitOfWork: new InMemoryUnitOfWork(store, ports),
    toolExecutor: new DeterministicToolExecutor(new Map()),
    tenantMembers: undefined,
  };
  const clock = new FixedClock(fixedNowIso);
  const handlerCalls: Array<{ nodeId: string; input: Record<string, unknown> }> = [];
  // Canonical agent runtime — shared by direct agent runs and `agent`
  // workflow nodes, mirroring the platform composition root. Tests may
  // swap `ports.toolExecutor` before running to supply tool handlers;
  // the runtime reads the executor from the same ports object.
  const agentRuntime = new BoundedAgentRuntime(runtimePorts);
  const engine = new OrcfloEngine(
    runtimePorts,
    handlers ?? demoNodeHandlers(handlerCalls),
    new DemoModelProviderGateway(),
    clock,
    { agentRuntime, runEventBus: engineOptions.runEventBus },
  );
  return {
    ports: runtimePorts,
    engine,
    agentRuntime,
    clock,
    handlerCalls,
    runWith: runWithFixture,
  };
}

export function orcfloWorkflowFixture(patch: Partial<Workflow> = {}, extraNodes: WorkflowNode[] = []): Workflow {
  const now = '2026-08-14T09:00:00.000Z';
  const nodes = [
    { id: 'start', type: 'trigger' as const, label: 'Start', configuration: {}, retryPolicy: {}, metadata: {} },
    ...extraNodes,
    { id: 'end', type: 'action' as const, label: 'End', configuration: {}, retryPolicy: {}, metadata: {} },
  ];
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge_${index}`,
    source: index === 0 ? 'start' : nodes[index].id,
    target: node.id,
    metadata: {},
  }));
  return WorkflowSchema.parse({
    id: 'workflow_orcflo',
    tenantId: orcfloActorContext.tenantId,
    name: 'Orcflo test workflow',
    description: 'Deterministic engine test fixture.',
    status: 'READY',
    version: 1,
    nodes,
    edges,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}

export async function runWithFixture(
  harness: OrcfloTestHarness,
  input: Record<string, unknown> = {},
  options: { workflowId?: string; maxCostMinor?: number } = {},
) {
  return harness.engine.startRun({
    workflowId: options.workflowId ?? 'workflow_orcflo',
    input,
    context: orcfloActorContext,
    maxCostMinor: options.maxCostMinor,
  });
}
