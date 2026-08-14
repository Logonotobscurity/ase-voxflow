import type {
  Agent,
  DomainEvent,
  HumanApproval,
  OutboxMessage,
  ToolDefinition,
  Transaction,
  Workflow,
  WorkflowExecution,
} from '../domain/schemas';
import { PlatformError } from '../domain/errors';
import { createOutboxMessage } from '../domain/events';
import type {
  AgentRepository,
  ApprovalRepository,
  EventLog,
  EventPublisher,
  ExecutionRepository,
  OutboxRepository,
  PersistencePorts,
  ToolExecutor,
  ToolInvocation,
  ToolRepository,
  ToolResult,
  TransactionRepository,
  UnitOfWork,
  WorkflowRepository,
} from '../application/ports';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function assertTenantOwnership<T extends { tenantId: string }>(existing: T | undefined, next: T): void {
  if (existing && existing.tenantId !== next.tenantId) {
    throw new PlatformError('AUTHORIZATION_DENIED', 'Resource identifier is not available to this tenant.');
  }
}

type InMemoryState = {
  agents: Map<string, Agent>;
  tools: Map<string, ToolDefinition>;
  workflows: Map<string, Workflow>;
  executions: Map<string, WorkflowExecution>;
  transactions: Map<string, Transaction>;
  approvals: Map<string, HumanApproval>;
  events: Map<string, DomainEvent>;
  outbox: Map<string, OutboxMessage>;
};

function emptyState(): InMemoryState {
  return {
    agents: new Map(),
    tools: new Map(),
    workflows: new Map(),
    executions: new Map(),
    transactions: new Map(),
    approvals: new Map(),
    events: new Map(),
    outbox: new Map(),
  };
}

/** Shared process-local state used by all memory repositories in one composition root. */
export class InMemoryPlatformStore {
  state = emptyState();

  snapshot(): InMemoryState {
    return copy(this.state);
  }

  restore(snapshot: InMemoryState): void {
    this.state = copy(snapshot);
  }
}

export class InMemoryAgentRepository implements AgentRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.agents.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async save(value: Agent) {
    assertTenantOwnership(this.store.state.agents.get(value.id), value);
    this.store.state.agents.set(value.id, copy(value));
  }
  async list(tenantId: string) { return [...this.store.state.agents.values()].filter((value) => value.tenantId === tenantId).map(copy); }
}

export class InMemoryToolRepository implements ToolRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.tools.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async save(value: ToolDefinition) {
    assertTenantOwnership(this.store.state.tools.get(value.id), value);
    this.store.state.tools.set(value.id, copy(value));
  }
  async list(tenantId: string) { return [...this.store.state.tools.values()].filter((value) => value.tenantId === tenantId).map(copy); }
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.workflows.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async save(value: Workflow) {
    assertTenantOwnership(this.store.state.workflows.get(value.id), value);
    this.store.state.workflows.set(value.id, copy(value));
  }
  async list(tenantId: string) { return [...this.store.state.workflows.values()].filter((value) => value.tenantId === tenantId).map(copy); }
}

export class InMemoryExecutionRepository implements ExecutionRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.executions.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async save(value: WorkflowExecution) {
    assertTenantOwnership(this.store.state.executions.get(value.id), value);
    this.store.state.executions.set(value.id, copy(value));
  }
  async listForWorkflow(tenantId: string, workflowId: string) {
    return [...this.store.state.executions.values()]
      .filter((value) => value.tenantId === tenantId && value.workflowId === workflowId)
      .map(copy);
  }
}

export class InMemoryTransactionRepository implements TransactionRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.transactions.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const value = [...this.store.state.transactions.values()]
      .find((record) => record.tenantId === tenantId && record.idempotencyKey === idempotencyKey);
    return value ? copy(value) : null;
  }
  async save(value: Transaction) {
    assertTenantOwnership(this.store.state.transactions.get(value.id), value);
    const collision = [...this.store.state.transactions.values()].find((record) => (
      record.id !== value.id
      && record.tenantId === value.tenantId
      && record.idempotencyKey === value.idempotencyKey
    ));
    if (collision) throw new PlatformError('CONFLICT', 'Transaction idempotency key is already in use.');
    this.store.state.transactions.set(value.id, copy(value));
  }
}

export class InMemoryApprovalRepository implements ApprovalRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) { const value = this.store.state.approvals.get(id); return value?.tenantId === tenantId ? copy(value) : null; }
  async findForResource(tenantId: string, resourceType: string, resourceId: string) {
    const value = [...this.store.state.approvals.values()].find((record) => (
      record.tenantId === tenantId
      && record.resourceType === resourceType
      && record.resourceId === resourceId
    ));
    return value ? copy(value) : null;
  }
  async save(value: HumanApproval) {
    assertTenantOwnership(this.store.state.approvals.get(value.id), value);
    this.store.state.approvals.set(value.id, copy(value));
  }
}

export class InMemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}
  async findById(tenantId: string, id: string) {
    const value = this.store.state.outbox.get(id);
    return value?.tenantId === tenantId ? copy(value) : null;
  }
  async listPending(tenantId: string, limit = 100) {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const now = Date.now();
    return [...this.store.state.outbox.values()]
      .filter((message) => (
        message.tenantId === tenantId
        && message.status === 'PENDING'
        && Date.parse(message.availableAt) <= now
      ))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, safeLimit)
      .map(copy);
  }
  async save(value: OutboxMessage) {
    assertTenantOwnership(this.store.state.outbox.get(value.id), value);
    const collision = [...this.store.state.outbox.values()].find((message) => (
      message.id !== value.id && message.eventId === value.eventId
    ));
    if (collision) throw new PlatformError('CONFLICT', 'An outbox message already exists for this event.');
    this.store.state.outbox.set(value.id, copy(value));
  }
}

export class InMemoryEventBus implements EventPublisher, EventLog {
  constructor(
    private readonly store: InMemoryPlatformStore,
    private readonly outbox: OutboxRepository,
  ) {}

  async publish(event: DomainEvent) {
    await this.append(event);
    await this.outbox.save(createOutboxMessage(event));
  }

  async append(event: DomainEvent) {
    const existing = this.store.state.events.get(event.id);
    assertTenantOwnership(existing, event);
    if (existing) throw new PlatformError('CONFLICT', `Event ${event.id} already exists.`);
    this.store.state.events.set(event.id, copy(event));
  }

  async listByCorrelation(tenantId: string, correlationId: string) {
    return [...this.store.state.events.values()]
      .filter((event) => event.tenantId === tenantId && event.correlationId === correlationId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map(copy);
  }
}

/**
 * Serial execution prevents one failed demo transaction from restoring a
 * snapshot over an unrelated concurrent transaction in the same process.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: InMemoryPlatformStore,
    private readonly ports: PersistencePorts,
  ) {}

  async run<T>(operation: (ports: PersistencePorts) => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = this.store.snapshot();
    try {
      return await operation(this.ports);
    } catch (error) {
      this.store.restore(snapshot);
      throw error;
    } finally {
      release();
    }
  }
}

export function createInMemoryPersistencePorts(): {
  store: InMemoryPlatformStore;
  ports: PersistencePorts;
} {
  const store = new InMemoryPlatformStore();
  const outbox = new InMemoryOutboxRepository(store);
  const ports: PersistencePorts = {
    agents: new InMemoryAgentRepository(store),
    tools: new InMemoryToolRepository(store),
    workflows: new InMemoryWorkflowRepository(store),
    executions: new InMemoryExecutionRepository(store),
    transactions: new InMemoryTransactionRepository(store),
    approvals: new InMemoryApprovalRepository(store),
    events: new InMemoryEventBus(store, outbox),
    outbox,
  };
  return { store, ports };
}

export type ToolHandler = (invocation: ToolInvocation) => Promise<ToolResult> | ToolResult;

export class DeterministicToolExecutor implements ToolExecutor {
  constructor(private readonly handlers: ReadonlyMap<string, ToolHandler>) {}

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const handler = this.handlers.get(invocation.tool.id) ?? this.handlers.get(invocation.tool.name);
    if (!handler) {
      throw new PlatformError('TOOL_EXECUTION_FAILED', `No executor is registered for ${invocation.tool.name}.`);
    }
    if (invocation.signal.aborted) {
      throw new PlatformError('TIMEOUT', `Tool ${invocation.tool.name} was aborted.`, { retryable: true });
    }
    return handler(invocation);
  }
}
