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
import type {
  ModelCallResult,
  OrcfloBlueprint,
  OrcfloDecisionRecord,
  OrcfloMeteringRecord,
  OrcfloModelProvider,
  OrcfloRun,
  OrcfloRunEvent,
  OrcfloStepCacheEntry,
  OrcfloTrigger,
} from '../domain/orcflo';

export type { AvatarSessionRef } from '../domain/schemas';

export type ExecutionEvidence = {
  // Audit §8 — the four kinds are now named to make their source
  // explicit. `internal_trace` is what the in-process handlers and
  // simulated demo flows produce; `external_reference` is the only
  // kind that counts as "evidence" in the audit sense — a pointer to
  // something outside the process that was actually observed.
  type: 'tool_result' | 'internal_trace' | 'approval' | 'external_reference';
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
  /**
   * Orcflo bridge — the actor context of the caller. Present when the
   * invocation originates from the canonical agent runtime; the
   * workflow-as-tool executor requires it to start an Orcflo run with
   * full tenancy, role, and correlation.
   */
  context?: import('../domain/policy').ActorContext;
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
  /**
   * Audit trail — recent tenant events in reverse-chronological order
   * (the authoritative source /app/audit consumes; not UI-owned state).
   */
  listByTenant(tenantId: string, options?: { limit?: number }): Promise<DomainEvent[]>;
}

export interface OutboxRepository {
  findById(tenantId: string, id: string): Promise<OutboxMessage | null>;
  listPending(tenantId: string, limit?: number): Promise<OutboxMessage[]>;
  save(message: OutboxMessage): Promise<void>;
  /**
   * Audit §3 — atomically claim a batch of PENDING or expired-lease
   * outbox messages for this worker. The implementation must be safe
   * under concurrent workers: a row is given to exactly one worker.
   * Returns the rows the worker now owns, each with `status =
   * 'CLAIMED'`, `claimedBy = workerId`, and `claimedUntil = now +
   * leaseMs`. The repository MUST also reclaim rows whose
   * `claimedUntil` is in the past, even if their previous status
   * is `CLAIMED`.
   */
  claimBatch(workerId: string, leaseMs: number, limit: number): Promise<OutboxMessage[]>;
  /**
   * Audit §3 — mark a claimed row as published. Sets `status =
   * 'PUBLISHED'`, `publishedAt = now`, and clears claim fields.
   */
  markPublished(id: string, publishedAtIso: string): Promise<void>;
  /**
   * Audit §3 — record a failed attempt. Increments `attempts`,
   * records `lastError`, and reschedules `availableAt` per the
   * worker's retry policy. The caller decides whether the row is
   * still retriable (status stays `PENDING`) or dead-lettered.
   */
  recordAttemptFailure(id: string, lastError: string, availableAtIso: string): Promise<OutboxMessage>;
  /**
   * Audit §3 — dead-letter a row that exceeded the maximum attempts.
   * Sets `status = 'DEAD_LETTERED'`, records `lastError`.
   */
  markDeadLettered(id: string, lastError: string): Promise<void>;
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
 * Audit §1 — Tenant membership.
 *
 * The audit found that the only thing stopping a request from one
 * tenant reaching another tenant's data was a string match in the
 * request headers. `TenantMembershipRepository` is the durable
 * authority: it returns the role a given actor actually has in a
 * given tenant, as provisioned by the tenant administrator. The
 * identity layer calls it after the verifier identifies the actor.
 */
export type MembershipRole = Exclude<import('../domain/schemas').TenantRole, 'PUBLIC'>;

export interface TenantMembership {
  tenantId: string;
  actorId: string;
  /** PUBLIC is a synthetic execute-only role for anonymous public-interface callers; it is never a membership role. */
  role: MembershipRole;
}

export interface TenantMembershipRepository {
  find(tenantId: string, actorId: string): Promise<TenantMembership | null>;
  listForActor(actorId: string): Promise<TenantMembership[]>;
  /** Team surface — the tenant's members and roles (RBAC source of truth). */
  listForTenant(tenantId: string): Promise<TenantMembership[]>;
  upsert(membership: TenantMembership): Promise<void>;
}

/**
 * Audit §1 — Identity verifier.
 *
 * A verifier is the only thing trusted to identify a caller. Two
 * implementations ship in this increment:
 *   - `DemoHeaderIdentityVerifier` for `ASE_RUNTIME_MODE=demo` only
 *   - `BearerTokenIdentityVerifier` for staging / production (single
 *     shared secret rotated via env)
 *
 * The verifier does NOT decide which tenant the caller is acting on;
 * it only returns the actor subject and the (verifier-supplied)
 * tenant claim. The next layer — `getRequestContext` — reconciles
 * the verifier output with `TenantMembershipRepository` before any
 * business code runs.
 */
export type VerifiedIdentity =
  | {
      kind: 'demo';
      subject: string;
      actorId: string;
      claimedTenantId: string;
      claimedRole: import('../domain/schemas').TenantRole;
      claimedEnvironment: 'demo' | 'development' | 'staging' | 'production';
    }
  | {
      kind: 'bearer';
      subject: string;
      actorId: string;
      claimedTenantId: string;
      claimedRole: import('../domain/schemas').TenantRole;
      claimedEnvironment: 'demo' | 'development' | 'staging' | 'production';
    };

export interface IdentityVerifier {
  /**
   * Verify the request and return a `VerifiedIdentity`, or throw
   * `PlatformError('AUTHENTICATION_REQUIRED')` if verification fails.
   * Implementations MUST NOT default to "trusted" in any non-demo
   * runtime mode.
   */
  verify(request: { headers: Headers }): Promise<VerifiedIdentity>;
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
  /**
   * Audit §1 — tenant membership authority. Optional in memory mode
   * (the demo verifier does not require a persisted membership for
   * the `tenant_demo` actor). Production deployments MUST wire a
   * real implementation backed by the Prisma `TenantMember` table.
   */
  tenantMembers?: TenantMembershipRepository;
  /**
   * Audit §1 — identity verifier. Wired by the composition root
   * according to `ASE_RUNTIME_MODE` and `ASE_IDENTITY_VERIFIER`.
   */
  identity?: IdentityVerifier;
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

// --- Orcflo engine ports (additive, see docs/ARCHITECTURE.md §5) ---

export interface OrcfloRunRepository {
  findById(tenantId: string, id: string): Promise<OrcfloRun | null>;
  /**
   * Durable execution — cross-tenant lookup for the background worker
   * (platform-level, mirroring the outbox claim path). Tenant-scoped
   * routes never use this.
   */
  findByIdGlobal(id: string): Promise<OrcfloRun | null>;
  /**
   * §48 idempotency — find the run previously created for this tenant
   * with the same idempotency key, so duplicate triggers/retries replay
   * the existing run instead of creating a duplicate.
   */
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<OrcfloRun | null>;
  save(run: OrcfloRun): Promise<void>;
  list(tenantId: string, options?: { workflowId?: string; limit?: number }): Promise<OrcfloRun[]>;
  listByTrigger(tenantId: string, triggerId: string, limit?: number): Promise<OrcfloRun[]>;
  /**
   * Durable execution — cross-tenant PENDING runs ready for a worker to
   * execute (monitoring/ops query; the dispatcher uses claimBatch).
   */
  listPending(limit?: number): Promise<OrcfloRun[]>;
  /**
   * Multi-worker claim/lease — atomically claim PENDING runs (or rows
   * whose lease has expired) for this worker, setting `claimedBy` /
   * `claimedUntil`. The implementation must be safe under concurrent
   * workers: a row is given to exactly one worker (FOR UPDATE SKIP
   * LOCKED in Prisma; a serialized lock in memory). Mirrors the outbox
   * claim/lease protocol.
   */
  claimBatch(workerId: string, leaseMs: number, limit: number): Promise<OrcfloRun[]>;
  /**
   * Release this worker's claim on a run (parked at WAITING_APPROVAL or
   * reached a terminal state). Conditional on `claimedBy` so a worker
   * never clears another worker's live lease.
   */
  releaseClaim(id: string, workerId: string): Promise<void>;
}

export interface OrcfloRunEventRepository {
  /** Append a stream event with the next per-run sequence number. */
  append(event: OrcfloRunEvent): Promise<void>;
  listForRun(tenantId: string, runId: string): Promise<OrcfloRunEvent[]>;
}

export interface OrcfloStepCacheRepository {
  findByKey(tenantId: string, key: string): Promise<OrcfloStepCacheEntry | null>;
  save(entry: OrcfloStepCacheEntry): Promise<void>;
  /** Record a cache hit (increments `hits`, sets `lastHitAt`). */
  recordHit(tenantId: string, key: string, atIso: string): Promise<void>;
}

export interface OrcfloMeteringRepository {
  record(record: OrcfloMeteringRecord): Promise<void>;
  list(tenantId: string, options?: { since?: string; limit?: number }): Promise<OrcfloMeteringRecord[]>;
}

/** Persisted control-node decisions (branch coverage / audit). */
export interface OrcfloDecisionRepository {
  append(record: OrcfloDecisionRecord): Promise<void>;
  listForRun(tenantId: string, runId: string): Promise<OrcfloDecisionRecord[]>;
}

export interface OrcfloModelProviderRepository {
  findById(tenantId: string, id: string): Promise<OrcfloModelProvider | null>;
  save(provider: OrcfloModelProvider): Promise<void>;
  list(tenantId: string): Promise<OrcfloModelProvider[]>;
}

export interface OrcfloTriggerRepository {
  findById(tenantId: string, id: string): Promise<OrcfloTrigger | null>;
  /**
   * §34 — public interfaces are invoked anonymously by `slug`, so the
   * lookup is deliberately cross-tenant (the slug is globally unique in
   * practice; the config stores it and both adapters enforce the check).
   */
  findPublicBySlug(slug: string): Promise<OrcfloTrigger | null>;
  save(trigger: OrcfloTrigger): Promise<void>;
  list(tenantId: string, options?: { kind?: OrcfloTrigger['kind']; enabledOnly?: boolean }): Promise<OrcfloTrigger[]>;
  /**
   * Durable scheduling — cross-tenant listing for the schedule worker
   * (platform-level, mirroring the outbox claim path). Tenant-scoped
   * routes never use this.
   */
  listAll(options?: { kind?: OrcfloTrigger['kind']; enabledOnly?: boolean; limit?: number }): Promise<OrcfloTrigger[]>;
}

export interface OrcfloBlueprintRepository {
  findById(tenantId: string, id: string): Promise<OrcfloBlueprint | null>;
  save(blueprint: OrcfloBlueprint): Promise<void>;
  list(tenantId: string): Promise<OrcfloBlueprint[]>;
}

/**
 * Persistence ports used by the Orcflo engine. Both the in-memory and
 * the Prisma adapter implement this set; the engine receives the
 * regular `PlatformPorts` plus these via `OrcfloRuntimePorts`.
 */
export type OrcfloPersistencePorts = {
  runs: OrcfloRunRepository;
  runEvents: OrcfloRunEventRepository;
  stepCache: OrcfloStepCacheRepository;
  metering: OrcfloMeteringRepository;
  decisions: OrcfloDecisionRepository;
  modelProviders: OrcfloModelProviderRepository;
  triggers: OrcfloTriggerRepository;
  blueprints: OrcfloBlueprintRepository;
};

export type OrcfloRuntimePorts = PlatformPorts & OrcfloPersistencePorts;

/**
 * Model provider gateway (fail-closed).
 *
 * The gateway never talks to an external service: `noop` providers
 * refuse every call, `demo` providers return a deterministic echo for
 * the explicitly ephemeral demo runtime, and `external` providers are
 * refused until a current official SDK review exists (the platform has
 * none). Metering for every accepted call is recorded by the engine.
 */
export interface ModelCallInput {
  tenantId: string;
  providerId: string;
  prompt: string;
  maxTokens: number;
}

export interface ModelProviderGateway {
  call(provider: OrcfloModelProvider, input: ModelCallInput): Promise<ModelCallResult>;
}
