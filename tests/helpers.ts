import type { PlatformPorts } from '../lib/application/ports';
import {
  AgentSchema,
  ToolDefinitionSchema,
  WorkflowSchema,
  type Agent,
  type ToolDefinition,
  type Workflow,
} from '../lib/domain/schemas';
import {
  createInMemoryPersistencePorts,
  DeterministicToolExecutor,
  InMemoryUnitOfWork,
  type ToolHandler,
} from '../lib/infrastructure/memory-adapters';

export const actorContext = {
  tenantId: 'tenant_test',
  actorId: 'actor_builder',
  role: 'BUILDER' as const,
  correlationId: 'corr_test',
  environment: 'demo' as const,
};

export function memoryPorts(toolHandlers: ReadonlyMap<string, ToolHandler> = new Map()): PlatformPorts {
  const { store, ports } = createInMemoryPersistencePorts();
  return {
    ...ports,
    unitOfWork: new InMemoryUnitOfWork(store, ports),
    toolExecutor: new DeterministicToolExecutor(toolHandlers),
  };
}

export function agentFixture(patch: Partial<Agent> = {}): Agent {
  const now = new Date('2026-08-14T12:00:00.000Z').toISOString();
  return AgentSchema.parse({
    id: 'agent_test',
    tenantId: actorContext.tenantId,
    name: 'Vendor operations agent',
    description: 'Coordinates vendor checks.',
    role: 'operator',
    status: 'READY',
    goals: ['Verify a vendor record'],
    instructions: 'Use only assigned deterministic tools.',
    toolIds: ['tool_lookup'],
    capabilities: ['vendor_lookup'],
    permissions: ['vendor:read'],
    policies: {
      limits: {
        maxIterations: 4,
        maxDurationMs: 5_000,
        maxToolCalls: 2,
        maxBudgetMinor: 1_000,
        maxNoProgressIterations: 2,
      },
      requireApprovalFor: [],
      allowedEnvironments: ['demo'],
      dataClassification: 'INTERNAL',
      retentionDays: 30,
    },
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}

export function toolFixture(patch: Partial<ToolDefinition> = {}): ToolDefinition {
  const now = new Date('2026-08-14T12:00:00.000Z').toISOString();
  return ToolDefinitionSchema.parse({
    id: 'tool_lookup',
    tenantId: actorContext.tenantId,
    name: 'vendor_lookup',
    description: 'Looks up a seeded vendor.',
    inputSchema: { type: 'object' },
    permissions: ['vendor:read'],
    riskLevel: 'LOW',
    timeoutMs: 1_000,
    cost: { currency: 'NGN', amountMinor: 20 },
    availability: 'AVAILABLE',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}

export function workflowFixture(patch: Partial<Workflow> = {}): Workflow {
  const now = new Date('2026-08-14T12:00:00.000Z').toISOString();
  return WorkflowSchema.parse({
    id: 'workflow_test',
    tenantId: actorContext.tenantId,
    name: 'Vendor onboarding',
    description: 'Test workflow',
    status: 'READY',
    version: 1,
    nodes: [
      { id: 'start', type: 'trigger', label: 'Start', configuration: {}, retryPolicy: {}, metadata: {} },
      { id: 'end', type: 'action', label: 'End', configuration: {}, retryPolicy: {}, metadata: {} },
    ],
    edges: [{ id: 'edge_start_end', source: 'start', target: 'end', metadata: {} }],
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}
