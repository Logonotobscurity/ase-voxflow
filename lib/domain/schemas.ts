import { z } from 'zod';

export const IdSchema = z.string().trim().min(1).max(200);
export const DateTimeSchema = z.string().datetime();
export const MetadataSchema = z.record(z.string(), z.unknown()).default({});

export const TenantRoleSchema = z.enum(['ADMIN', 'BUILDER', 'OPERATOR', 'APPROVER', 'VIEWER']);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const AgentStatusSchema = z.enum([
  'REGISTERED',
  'READY',
  'RUNNING',
  'WAITING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const ToolRiskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const AgentLimitsSchema = z.object({
  maxIterations: z.number().int().min(1).max(20).default(6),
  maxToolCalls: z.number().int().min(0).max(50).default(12),
  maxDurationMs: z.number().int().min(100).max(300_000).default(30_000),
  maxBudgetMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(100_000),
  maxNoProgressIterations: z.number().int().min(1).max(10).default(3),
}).strict();
export type AgentLimits = z.infer<typeof AgentLimitsSchema>;

export const AgentPoliciesSchema = z.object({
  limits: AgentLimitsSchema.default({}),
  requireApprovalFor: z.array(z.string().min(1).max(100)).default([]),
  allowedEnvironments: z.array(z.enum(['demo', 'development', 'staging', 'production'])).min(1).default(['demo']),
  dataClassification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).default('INTERNAL'),
  retentionDays: z.number().int().min(1).max(3_650).default(30),
}).strict();
export type AgentPolicies = z.infer<typeof AgentPoliciesSchema>;

export const AgentCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(500),
  role: z.string().trim().min(2).max(100),
  goals: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  instructions: z.string().trim().min(1).max(10_000),
  toolIds: z.array(IdSchema).max(50).default([]),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  permissions: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  policies: AgentPoliciesSchema.default({}),
  metadata: MetadataSchema,
}).strict();
export type AgentCreate = z.infer<typeof AgentCreateSchema>;

export const AgentUpdateSchema = AgentCreateSchema.partial().strict();
export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

export const AgentSchema = AgentCreateSchema.extend({
  id: IdSchema,
  tenantId: IdSchema,
  status: AgentStatusSchema,
  version: z.number().int().positive(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type Agent = z.infer<typeof AgentSchema>;

export const ToolCostSchema = z.object({
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const ToolDefinitionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  inputSchema: z.record(z.string(), z.unknown()),
  permissions: z.array(z.string().min(1).max(100)).default([]),
  riskLevel: ToolRiskSchema,
  timeoutMs: z.number().int().min(50).max(300_000),
  cost: ToolCostSchema.default({ currency: 'NGN', amountMinor: 0 }),
  availability: z.enum(['AVAILABLE', 'DEGRADED', 'UNAVAILABLE']),
  metadata: MetadataSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const WorkflowNodeTypeSchema = z.enum([
  'trigger',
  'agent',
  'tool',
  'condition',
  'human_approval',
  'handoff',
  'transaction',
  'action',
  'schedule',
  'webhook',
  'mcp',
  'voice_command',
]);
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeSchema>;

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(5).default(0),
  backoffMs: z.number().int().min(0).max(30_000).default(250),
}).strict();

export const WorkflowNodeSchema = z.object({
  id: IdSchema,
  type: WorkflowNodeTypeSchema,
  label: z.string().min(1).max(200),
  configuration: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).strict().optional(),
  retryPolicy: RetryPolicySchema.default({}),
  metadata: MetadataSchema,
}).strict();
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
  sourceHandle: z.string().max(100).optional(),
  targetHandle: z.string().max(100).optional(),
  condition: z.boolean().optional(),
  metadata: MetadataSchema,
}).strict();
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowStatusSchema = z.enum(['DRAFT', 'READY', 'PAUSED', 'ARCHIVED']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1_000).default(''),
  status: WorkflowStatusSchema.default('DRAFT'),
  nodes: z.array(WorkflowNodeSchema).min(1).max(500),
  edges: z.array(WorkflowEdgeSchema).max(2_000),
  metadata: MetadataSchema,
}).strict();
export type WorkflowCreate = z.infer<typeof WorkflowCreateSchema>;

export const WorkflowUpdateSchema = WorkflowCreateSchema.partial().strict();
export type WorkflowUpdate = z.infer<typeof WorkflowUpdateSchema>;

export const WorkflowSchema = WorkflowCreateSchema.extend({
  id: IdSchema,
  tenantId: IdSchema,
  version: z.number().int().positive(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const ExecutionStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const NodeExecutionResultSchema = z.object({
  nodeId: IdSchema,
  status: z.enum(['SKIPPED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED']),
  attempt: z.number().int().positive().default(1),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema.optional(),
  output: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
}).strict();
export type NodeExecutionResult = z.infer<typeof NodeExecutionResultSchema>;

export const WorkflowExecutionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  workflowId: IdSchema,
  status: ExecutionStatusSchema,
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  nodeResults: z.array(NodeExecutionResultSchema),
  correlationId: IdSchema,
  startedAt: DateTimeSchema.optional(),
  completedAt: DateTimeSchema.optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

export const DomainEventSchema = z.object({
  id: IdSchema,
  eventType: z.string().regex(/^[a-z][a-z0-9_.-]+$/),
  schemaVersion: z.number().int().positive(),
  occurredAt: DateTimeSchema,
  actorId: IdSchema.optional(),
  tenantId: IdSchema,
  correlationId: IdSchema,
  causationId: IdSchema.optional(),
  aggregateType: z.string().min(1).max(100),
  aggregateId: IdSchema,
  payload: z.record(z.string(), z.unknown()),
  metadata: MetadataSchema,
}).strict();
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const OutboxStatusSchema = z.enum(['PENDING', 'PUBLISHED', 'FAILED']);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const OutboxMessageSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  eventId: IdSchema,
  topic: z.string().regex(/^[a-z][a-z0-9_.-]+$/),
  payload: DomainEventSchema,
  status: OutboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  availableAt: DateTimeSchema,
  publishedAt: DateTimeSchema.optional(),
  lastError: z.string().max(2_000).optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type OutboxMessage = z.infer<typeof OutboxMessageSchema>;

export const TransactionStatusSchema = z.enum([
  'CREATED',
  'AUTHORIZED',
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REVERSED',
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionCreateSchema = z.object({
  agentId: IdSchema.optional(),
  type: z.string().min(1).max(100),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  recipient: z.string().min(2).max(300),
  idempotencyKey: z.string().min(8).max(200),
  metadata: MetadataSchema,
}).strict();
export type TransactionCreate = z.infer<typeof TransactionCreateSchema>;

export const TransactionSchema = TransactionCreateSchema.extend({
  id: IdSchema,
  tenantId: IdSchema,
  status: TransactionStatusSchema,
  authorization: z.record(z.string(), z.unknown()).optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  completedAt: DateTimeSchema.optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const ApprovalStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const HumanApprovalSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  resourceType: z.string().min(1).max(100),
  resourceId: IdSchema,
  status: ApprovalStatusSchema.default('REQUESTED'),
  requestedBy: IdSchema,
  decidedBy: IdSchema.optional(),
  reason: z.string().max(2_000).optional(),
  metadata: MetadataSchema,
  requestedAt: DateTimeSchema,
  decidedAt: DateTimeSchema.optional(),
}).strict();
export type HumanApproval = z.infer<typeof HumanApprovalSchema>;

export const VoiceIntentSchema = z.enum([
  'add_node',
  'connect',
  'execute',
  'delete_node',
  'select_node',
  'update_node',
  'run_workflow',
  'pause_workflow',
  'handoff',
  'unknown',
]);
export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;

export const AgentCommandModalitySchema = z.enum(['TEXT', 'VOICE_TRANSCRIPT']);
export type AgentCommandModality = z.infer<typeof AgentCommandModalitySchema>;

export const AgentCommandSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  requestedBy: IdSchema,
  correlationId: IdSchema,
  modality: AgentCommandModalitySchema,
  text: z.string().trim().min(1).max(4_000),
  intent: VoiceIntentSchema,
  entities: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  riskLevel: ToolRiskSchema,
  status: z.enum(['PROPOSED', 'REJECTED']),
  requiresConfirmation: z.boolean(),
  target: z.object({ workflowId: IdSchema.optional() }).strict().default({}),
  createdAt: DateTimeSchema,
}).strict();
export type AgentCommand = z.infer<typeof AgentCommandSchema>;
