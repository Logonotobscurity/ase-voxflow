import type {
  Agent,
  AvatarSessionRef,
  DomainEvent,
  HumanApproval,
  McpServerConfig,
  OutboxMessage,
  ToolDefinition,
  TtsCue,
  Transaction,
  Transcript,
  Workflow,
  WorkflowExecution,
} from '../domain/schemas';

export type { AvatarSessionRef } from '../domain/schemas';

export type ExecutionEvidence = {
  type: 'tool_result' | 'state_change' | 'approval' | 'external_reference';
  summary: string;
  reference?: string;
  data?: Record<string, unknown>;
};

export type ToolInvocation = {
  tenantId: string;
  executionId: string;
  agentId: string;
  tool: ToolDefinition;
  input: Record<string, unknown>;
  signal: AbortSignal;
};

export type ToolResult = {
  output: Record<string, unknown>;
  costMinor: number;
  evidence: ExecutionEvidence[];
};

export interface AgentRepository {
  findById(tenantId: string, id: string): Promise<Agent | null>;
  save(agent: Agent): Promise<void>;
  list(tenantId: string): Promise<Agent[]>;
}

export interface ToolRepository {
  findById(tenantId: string, id: string): Promise<ToolDefinition | null>;
  save(tool: ToolDefinition): Promise<void>;
  list(tenantId: string): Promise<ToolDefinition[]>;
}

export interface WorkflowRepository {
  findById(tenantId: string, id: string): Promise<Workflow | null>;
  save(workflow: Workflow): Promise<void>;
  list(tenantId: string): Promise<Workflow[]>;
}

export interface ExecutionRepository {
  findById(tenantId: string, id: string): Promise<WorkflowExecution | null>;
  save(execution: WorkflowExecution): Promise<void>;
  listForWorkflow(tenantId: string, workflowId: string): Promise<WorkflowExecution[]>;
}

export interface TransactionRepository {
  findById(tenantId: string, id: string): Promise<Transaction | null>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Transaction | null>;
  save(transaction: Transaction): Promise<void>;
}

export interface ApprovalRepository {
  findById(tenantId: string, id: string): Promise<HumanApproval | null>;
  findForResource(tenantId: string, resourceType: string, resourceId: string): Promise<HumanApproval | null>;
  save(approval: HumanApproval): Promise<void>;
}

export interface EventPublisher {
  /** Persist the event and a pending outbox delivery intent. */
  publish(event: DomainEvent): Promise<void>;
}

export interface EventLog {
  /** Append only to the event log; callers normally use publish. */
  append(event: DomainEvent): Promise<void>;
  listByCorrelation(tenantId: string, correlationId: string): Promise<DomainEvent[]>;
}

export interface OutboxRepository {
  findById(tenantId: string, id: string): Promise<OutboxMessage | null>;
  listPending(tenantId: string, limit?: number): Promise<OutboxMessage[]>;
  save(message: OutboxMessage): Promise<void>;
}

export type PersistencePorts = {
  agents: AgentRepository;
  tools: ToolRepository;
  workflows: WorkflowRepository;
  executions: ExecutionRepository;
  transactions: TransactionRepository;
  approvals: ApprovalRepository;
  events: EventPublisher & EventLog;
  outbox: OutboxRepository;
};

export interface UnitOfWork {
  /**
   * Execute all persistence calls through a single atomic boundary. The callback
   * must use the supplied scoped ports rather than captured root repositories.
   */
  run<T>(operation: (ports: PersistencePorts) => Promise<T>): Promise<T>;
}

export interface ToolExecutor {
  execute(invocation: ToolInvocation): Promise<ToolResult>;
}

// --- Capability extension ports (additive, see docs/ARCHITECTURE.md §5) ---

/**
 * Capability 04 — Transcript persistence.
 *
 * Persists an already-transcribed line with session/participant metadata.
 * The associated audit event for a command still excludes raw text per
 * `agent-command-service.ts`; this is a separate durable record so the
 * UI, search, and analytics can re-derive text on demand.
 */
export interface TranscriptRepository {
  save(transcript: Transcript): Promise<void>;
  listBySession(tenantId: string, sessionId: string, limit?: number): Promise<Transcript[]>;
  listByParticipant(tenantId: string, participantId: string, limit?: number): Promise<Transcript[]>;
}

/**
 * Capability 06 — MCP allowlist. The registry returns only the servers
 * a tenant has previously registered as `trusted === true`. A returned
 * server is still subject to `evaluateToolPolicy` and the workflow-node
 * `mcp` policy gate.
 */
export interface McpServerRegistry {
  listAllowedServers(tenantId: string): Promise<McpServerConfig[]>;
  getServer(tenantId: string, serverId: string): Promise<McpServerConfig | null>;
}

/**
 * Capability 10 — Avatar provider adapter (no provider shipped).
 *
 * A future Tavus / Bithuman / LemonSlice adapter implements this
 * interface. A default `no-op` implementation is wired in
 * `lib/server/platform.ts` so the UI can render an "avatar not
 * configured" state without coupling to any vendor.
 */
export type AvatarSendPayload =
  | { kind: 'text'; text: string; tts?: TtsCue }
  | { kind: 'audio'; stream: AsyncIterable<Uint8Array> };

export interface AvatarSessionAdapter {
  createSession(tenantId: string, participantId: string): Promise<AvatarSessionRef>;
  send(ref: AvatarSessionRef, payload: AvatarSendPayload): Promise<void>;
  terminate(ref: AvatarSessionRef): Promise<void>;
}

/**
 * Capability 01 — Clock port.
 *
 * Defaults to `Date.now()` and `new Date().toISOString()`. Tests inject
 * a fixed clock to make bounded-runtime verification reproducible
 * without faking timers. Adding it as a port (not a global) keeps
 * determinism reviewable.
 */
export interface Clock {
  now(): number;
  isoNow(): string;
}

export type PlatformPorts = PersistencePorts & {
  unitOfWork: UnitOfWork;
  toolExecutor: ToolExecutor;
  /**
   * Capability 01 — injectable clock. Optional: when absent, the
   * bounded runtime falls back to `Date.now()`/`new Date().toISOString()`.
   * Tests inject a fixed clock to make verification reproducible.
   */
  clock?: Clock;
};

/**
 * Extension ports are *optional* at the composition root. The memory
 * adapter implements transcripts; the no-op avatar and empty MCP
 * registry are wired by default. The shape below documents the
 * non-persistence capabilities the platform can adopt.
 */
export type PlatformExtensionPorts = {
  transcripts?: TranscriptRepository;
  mcpServers?: McpServerRegistry;
  avatar?: AvatarSessionAdapter;
};

export type ExtendedPlatformPorts = PlatformPorts & PlatformExtensionPorts;
