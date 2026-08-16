import 'server-only';

import type { PlatformPorts } from '../application/ports';
import { AgentCommandService } from '../application/agent-command-service';
import { BoundedAgentRuntime } from '../application/agent-runtime';
import { TransactionService } from '../application/transaction-service';
import { WorkflowRunner, type WorkflowNodeHandler } from '../application/workflow-runner';
import type { WorkflowNode } from '../domain/schemas';
import { PlatformError } from '../domain/errors';
import {
  createInMemoryPersistencePorts,
  DeterministicToolExecutor,
  InMemoryUnitOfWork,
  SystemClock,
} from '../infrastructure/memory-adapters';
import {
  createPrismaPersistencePorts,
  PrismaUnitOfWork,
} from '../infrastructure/prisma-adapters';
import { getPrismaClient } from '../infrastructure/prisma-client';
import { EmptyMcpServerRegistry, NoopAvatarSessionAdapter } from '../infrastructure/extension-adapters';
import {
  BearerTokenIdentityVerifier,
  DemoHeaderIdentityVerifier,
} from '../infrastructure/identity-verifiers';

export type PlatformApplication = {
  ports: PlatformPorts;
  commands: AgentCommandService;
  agents: BoundedAgentRuntime;
  workflows: WorkflowRunner;
  transactions: TransactionService;
  persistence: 'ephemeral-memory' | 'postgresql';
  /** Capability 06 — empty allowlist by default. Wire a real registry to enable MCP. */
  mcpServers: import('../application/ports').McpServerRegistry;
  /** Capability 10 — no-op by default. Wire a real provider to enable avatars. */
  avatar: import('../application/ports').AvatarSessionAdapter;
};

const globalPlatform = globalThis as unknown as { asePlatform?: PlatformApplication };

export function getPlatform(): PlatformApplication {
  if (globalPlatform.asePlatform) return globalPlatform.asePlatform;
  const persistenceMode = process.env.ASE_PERSISTENCE_MODE ?? 'memory';
  const runtimeMode = process.env.ASE_RUNTIME_MODE ?? 'demo';
  const toolExecutor = new DeterministicToolExecutor(new Map());
  const clock = new SystemClock();
  let ports: PlatformPorts;
  let persistence: PlatformApplication['persistence'];

  if (persistenceMode === 'postgres') {
    const prisma = getPrismaClient();
    const persistencePorts = createPrismaPersistencePorts(prisma);
    ports = {
      ...persistencePorts,
      unitOfWork: new PrismaUnitOfWork(prisma),
      toolExecutor,
      clock,
    };
    persistence = 'postgresql';
  } else if (persistenceMode === 'memory') {
    const { store, ports: persistencePorts, tenantMembers } = createInMemoryPersistencePorts();
    ports = {
      ...persistencePorts,
      unitOfWork: new InMemoryUnitOfWork(store, persistencePorts),
      toolExecutor,
      clock,
      tenantMembers,
    };
    persistence = 'ephemeral-memory';
  } else {
    throw new PlatformError('CONFIGURATION_ERROR', `Unsupported ASE_PERSISTENCE_MODE: ${persistenceMode}.`);
  }

  // Audit §1 — identity verifier selection.
  if (runtimeMode === 'demo') {
    ports.identity = new DemoHeaderIdentityVerifier();
  } else {
    const token = process.env.ASE_PROD_BEARER_TOKEN;
    if (!token) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'ASE_PROD_BEARER_TOKEN is required for non-demo runtime modes. Set it in the deployment secret store.',
      );
    }
    ports.identity = new BearerTokenIdentityVerifier(token);
  }

  const handlers = createDemoNodeHandlers();
  const application: PlatformApplication = {
    ports,
    commands: new AgentCommandService(ports),
    agents: new BoundedAgentRuntime(ports),
    workflows: new WorkflowRunner(ports, handlers),
    transactions: new TransactionService(ports),
    persistence,
    mcpServers: new EmptyMcpServerRegistry(),
    avatar: new NoopAvatarSessionAdapter(),
  };
  // Memory mode is process-local and ephemeral, but it must still survive across
  // requests handled by the same process (for example, save then execute).
  // PostgreSQL mode also benefits from reusing the adapter and connection pool.
  globalPlatform.asePlatform = application;
  return application;
}

function createDemoNodeHandlers(): ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler> {
  const deterministic: WorkflowNodeHandler = (node, input, signal) => {
    if (signal.aborted) throw new PlatformError('TIMEOUT', `${node.label} was aborted.`, { retryable: true });
    if (node.configuration.executionMode !== 'demo') {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        `${node.label} has no verified external adapter. Set executionMode to demo only for deterministic simulation.`,
      );
    }
    return {
      output: { nodeId: node.id, mode: 'demo', inputKeys: Object.keys(input) },
      evidence: [{
        type: 'internal_trace',
        summary: `${node.label} completed in the explicitly ephemeral demo runtime.`,
        data: { nodeId: node.id, simulated: true },
      }],
      costMinor: 0,
    };
  };

  // Capability 06 — MCP node handler.
  // Fail-closed: only invokes MCP when the node has been registered as
  // `trusted: true` in the tenant's allowlist; the policy gate in
  // `evaluateWorkflowNodePolicy` already denies untrusted MCP nodes at
  // the runner level. This handler therefore sees only nodes that have
  // already passed the gate, but it re-checks the gate before acting.
  const mcp: WorkflowNodeHandler = (node, _input, _signal) => {
    if (node.configuration.trusted !== true) {
      throw new PlatformError(
        'AUTHORIZATION_DENIED',
        `MCP node ${node.id} is not trusted. Register the server in the tenant allowlist and set configuration.trusted=true.`,
      );
    }
    return {
      output: {
        nodeId: node.id,
        mode: 'mcp-stub',
        reason: 'No MCP transport is configured in this increment. The contract is wired; wire an adapter to execute.',
      },
      evidence: [{
        type: 'internal_trace',
        summary: `MCP node ${node.id} recorded as a stub. No external call was made.`,
        data: { nodeId: node.id, simulated: true, capability: 'mcp' },
      }],
      costMinor: 0,
    };
  };

  // Capability 12 — Handoff node handler.
  // Records the handoff as a deterministic state change. Does not
  // auto-resume downstream nodes; the next workflow run is responsible
  // for picking up the recorded target.
  const handoff: WorkflowNodeHandler = (node, input) => {
    const fromAgentId = typeof input.agentId === 'string' ? input.agentId : undefined;
    const toAgentId = typeof node.configuration.toAgentId === 'string' ? node.configuration.toAgentId : undefined;
    return {
      output: { nodeId: node.id, fromAgentId, toAgentId, recorded: true },
      evidence: [{
        type: 'internal_trace',
        summary: `Handoff recorded at ${node.id}. No side effects were taken; the next execution will pick up ${toAgentId ?? 'unspecified target'}.`,
        data: { nodeId: node.id, fromAgentId, toAgentId, recorded: true },
      }],
      costMinor: 0,
    };
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
    ['handoff', handoff],
  ]);
}
