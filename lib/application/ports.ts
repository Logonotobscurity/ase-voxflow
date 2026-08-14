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

export type PlatformPorts = PersistencePorts & {
  unitOfWork: UnitOfWork;
  toolExecutor: ToolExecutor;
};
