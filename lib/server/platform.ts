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
} from '../infrastructure/memory-adapters';
import {
  createPrismaPersistencePorts,
  PrismaUnitOfWork,
} from '../infrastructure/prisma-adapters';
import { getPrismaClient } from '../infrastructure/prisma-client';

export type PlatformApplication = {
  ports: PlatformPorts;
  commands: AgentCommandService;
  agents: BoundedAgentRuntime;
  workflows: WorkflowRunner;
  transactions: TransactionService;
  persistence: 'ephemeral-memory' | 'postgresql';
};

const globalPlatform = globalThis as unknown as { asePlatform?: PlatformApplication };

export function getPlatform(): PlatformApplication {
  if (globalPlatform.asePlatform) return globalPlatform.asePlatform;
  const persistenceMode = process.env.ASE_PERSISTENCE_MODE ?? 'memory';
  const toolExecutor = new DeterministicToolExecutor(new Map());
  let ports: PlatformPorts;
  let persistence: PlatformApplication['persistence'];

  if (persistenceMode === 'postgres') {
    const prisma = getPrismaClient();
    const persistencePorts = createPrismaPersistencePorts(prisma);
    ports = {
      ...persistencePorts,
      unitOfWork: new PrismaUnitOfWork(prisma),
      toolExecutor,
    };
    persistence = 'postgresql';
  } else if (persistenceMode === 'memory') {
    const { store, ports: persistencePorts } = createInMemoryPersistencePorts();
    ports = {
      ...persistencePorts,
      unitOfWork: new InMemoryUnitOfWork(store, persistencePorts),
      toolExecutor,
    };
    persistence = 'ephemeral-memory';
  } else {
    throw new PlatformError('CONFIGURATION_ERROR', `Unsupported ASE_PERSISTENCE_MODE: ${persistenceMode}.`);
  }

  const handlers = createDemoNodeHandlers();
  const application: PlatformApplication = {
    ports,
    commands: new AgentCommandService(ports),
    agents: new BoundedAgentRuntime(ports),
    workflows: new WorkflowRunner(ports, handlers),
    transactions: new TransactionService(ports),
    persistence,
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
        type: 'state_change',
        summary: `${node.label} completed in the explicitly ephemeral demo runtime.`,
        data: { nodeId: node.id, simulated: true },
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
  ]);
}
