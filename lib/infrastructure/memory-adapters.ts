import type {
  Agent,
  DomainEvent,
  HumanApproval,
  OutboxMessage,
  ToolDefinition,
  Transaction,
  Transcript,
  Workflow,
  WorkflowExecution,
} from '../domain/schemas';
import { PlatformError } from '../domain/errors';
import { createOutboxMessage } from '../domain/events';
import type {
  AgentRepository,
  ApprovalRepository,
  Clock,
  EventLog,
  EventPublisher,
  ExecutionRepository,
  OutboxRepository,
  PersistencePorts,
  TenantMembership,
  TenantMembershipRepository,
  ToolExecutor,
  ToolInvocation,
  ToolRepository,
  ToolResult,
  TransactionRepository,
  TranscriptRepository,
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
  outbox: Map<string,OutboxMessage>;
  transcripts: Map<string, Transcript>;
  // Audit §1 — tenant memberships. Keyed by `${tenantId}::${actorId}`.
  memberships: Map<string, { tenantId: string; actorId: string; role: 'ADMIN' | 'BUILDER' | 'OPERATOR' | 'APPROVER' | 'VIEWER' }>;
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
    transcripts: new Map(),
    memberships: new Map(),
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

  // Audit §3 — claim/lease semantics. The in-memory adapter uses a
  // simple serial lock so a single process can simulate the
  // FOR UPDATE SKIP LOCKED semantics that the Prisma adapter will
  // use in production.
  private claimQueue: Promise<void> = Promise.resolve();

  async claimBatch(workerId: string, leaseMs: number, limit: number): Promise<OutboxMessage[]> {
    const previous = this.claimQueue;
    let release: () => void = () => {};
    this.claimQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const claimedUntilIso = new Date(nowMs + Math.max(100, Math.trunc(leaseMs))).toISOString();
      const candidates = [...this.store.state.outbox.values()]
        .filter((m) => (
          (m.status === 'PENDING' && Date.parse(m.availableAt) <= nowMs)
          || (m.status === 'CLAIMED' && m.claimedUntil !== undefined && Date.parse(m.claimedUntil) <= nowMs)
        ))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, safeLimit);
      const result: OutboxMessage[] = [];
      for (const candidate of candidates) {
        const next: OutboxMessage = {
          ...copy(candidate),
          status: 'CLAIMED',
          claimedBy: workerId,
          claimedUntil: claimedUntilIso,
          updatedAt: nowIso,
        };
        this.store.state.outbox.set(next.id, copy(next));
        result.push(copy(next));
      }
      return result;
    } finally {
      release();
    }
  }

  async markPublished(id: string, publishedAtIso: string): Promise<void> {
    const value = this.store.state.outbox.get(id);
    if (!value) throw new PlatformError('NOT_FOUND', `Outbox message ${id} was not found.`);
    if (value.status !== 'CLAIMED') {
      throw new PlatformError('CONFLICT', `Outbox message ${id} is not in CLAIMED status.`);
    }
    const updated: OutboxMessage = {
      ...copy(value),
      status: 'PUBLISHED',
      publishedAt: publishedAtIso,
      claimedBy: undefined,
      claimedUntil: undefined,
      lastError: undefined,
      updatedAt: publishedAtIso,
    };
    this.store.state.outbox.set(id, copy(updated));
  }

  async recordAttemptFailure(id: string, lastError: string, availableAtIso: string): Promise<OutboxMessage> {
    const value = this.store.state.outbox.get(id);
    if (!value) throw new PlatformError('NOT_FOUND', `Outbox message ${id} was not found.`);
    if (value.status !== 'CLAIMED') {
      throw new PlatformError('CONFLICT', `Outbox message ${id} is not in CLAIMED status.`);
    }
    const updated: OutboxMessage = {
      ...copy(value),
      status: 'PENDING',
      attempts: value.attempts + 1,
      lastError,
      availableAt: availableAtIso,
      claimedBy: undefined,
      claimedUntil: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.state.outbox.set(id, copy(updated));
    return copy(updated);
  }

  async markDeadLettered(id: string, lastError: string): Promise<void> {
    const value = this.store.state.outbox.get(id);
    if (!value) throw new PlatformError('NOT_FOUND', `Outbox message ${id} was not found.`);
    const nowIso = new Date().toISOString();
    const updated: OutboxMessage = {
      ...copy(value),
      status: 'DEAD_LETTERED',
      lastError,
      claimedBy: undefined,
      claimedUntil: undefined,
      updatedAt: nowIso,
    };
    this.store.state.outbox.set(id, copy(updated));
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
  transcripts: InMemoryTranscriptRepository;
  tenantMembers: InMemoryTenantMembershipRepository;
} {
  const store = new InMemoryPlatformStore();
  const outbox = new InMemoryOutboxRepository(store);
  const transcripts = new InMemoryTranscriptRepository(store);
  const tenantMembers = new InMemoryTenantMembershipRepository(store);
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
  return { store, ports, transcripts, tenantMembers };
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

// --- Audit §1 — In-memory tenant membership repository (additive) ---

export class InMemoryTenantMembershipRepository implements TenantMembershipRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}

  private key(tenantId: string, actorId: string): string {
    return `${tenantId}::${actorId}`;
  }

  async find(tenantId: string, actorId: string) {
    const v = this.store.state.memberships.get(this.key(tenantId, actorId));
    return v ? copy(v) : null;
  }

  async listForActor(actorId: string) {
    return [...this.store.state.memberships.values()]
      .filter((m) => m.actorId === actorId)
      .map(copy);
  }

  async upsert(membership: TenantMembership): Promise<void> {
    this.store.state.memberships.set(this.key(membership.tenantId, membership.actorId), copy(membership));
  }
}

// --- Capability 04 — In-memory transcript repository (additive) ---

export class InMemoryTranscriptRepository implements TranscriptRepository {
  constructor(private readonly store: InMemoryPlatformStore) {}

  async save(transcript: Transcript): Promise<void> {
    assertTenantOwnership(this.store.state.transcripts.get(transcript.id), transcript);
    this.store.state.transcripts.set(transcript.id, copy(transcript));
  }

  async listBySession(tenantId: string, sessionId: string, limit = 100): Promise<Transcript[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    return [...this.store.state.transcripts.values()]
      .filter((t) => t.tenantId === tenantId && t.sessionId === sessionId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, safeLimit)
      .map(copy);
  }

  async listByParticipant(tenantId: string, participantId: string, limit = 100): Promise<Transcript[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    return [...this.store.state.transcripts.values()]
      .filter((t) => t.tenantId === tenantId && t.participantId === participantId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, safeLimit)
      .map(copy);
  }
}

// --- Capability 01 — System clock (default; tests can inject a fixed clock) ---

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  isoNow(): string {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  private currentIso: string;
  constructor(fixedIso: string) {
    this.currentIso = fixedIso;
  }
  now(): number {
    return Date.parse(this.currentIso);
  }
  isoNow(): string {
    return this.currentIso;
  }
  advance(deltaMs: number): void {
    this.currentIso = new Date(Date.parse(this.currentIso) + deltaMs).toISOString();
  }
}
