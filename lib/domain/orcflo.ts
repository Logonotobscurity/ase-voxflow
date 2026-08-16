import { z } from 'zod';
import {
  DateTimeSchema,
  IdSchema,
  MetadataSchema,
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
  WorkflowStatusSchema,
} from './schemas';

/**
 * Orcflo — the deterministic workflow run engine for VOXFLOW.
 *
 * Orcflo (orchestration flow) is the run-time half of the platform:
 * it executes a canonical `Workflow` as a `Run`, streams run events,
 * consults the step cache before re-executing a deterministic node,
 * meters every observable unit, resolves model providers through a
 * fail-closed gateway, and materializes runs from four trigger kinds
 * (manual, schedule, webhook, event) and from reusable blueprints.
 *
 * The contracts here are additive; they do not replace the existing
 * execution/event/outbox contracts. See docs/ARCHITECTURE.md §5 for
 * the decision-log entry that governs this increment.
 */

// --- Runs ---

export const OrcfloRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type OrcfloRunStatus = z.infer<typeof OrcfloRunStatusSchema>;

export const OrcfloStepStatusSchema = z.enum([
  'RUNNING',
  'WAITING_APPROVAL',
  'CACHED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
]);
export type OrcfloStepStatus = z.infer<typeof OrcfloStepStatusSchema>;

export const OrcfloStepResultSchema = z.object({
  nodeId: IdSchema,
  status: OrcfloStepStatusSchema,
  attempt: z.number().int().positive().default(1),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema.optional(),
  /** Content hash of the step input; present for cacheable steps. */
  cacheKey: z.string().min(8).max(128).optional(),
  cacheHit: z.boolean().default(false),
  output: z.unknown().optional(),
  costMinor: z.number().int().nonnegative().default(0),
  evidenceCount: z.number().int().nonnegative().default(0),
  modelCalls: z.number().int().nonnegative().default(0),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().optional(),
}).strict();
export type OrcfloStepResult = z.infer<typeof OrcfloStepResultSchema>;

export const OrcfloTriggerKindSchema = z.enum(['manual', 'schedule', 'webhook', 'event', 'public']);
export type OrcfloTriggerKind = z.infer<typeof OrcfloTriggerKindSchema>;

export const OrcfloRunSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  workflowId: IdSchema,
  blueprintId: IdSchema.optional(),
  triggerId: IdSchema.optional(),
  triggerKind: OrcfloTriggerKindSchema.optional(),
  status: OrcfloRunStatusSchema,
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  steps: z.array(OrcfloStepResultSchema),
  correlationId: IdSchema,
  /**
   * §48 idempotency — a stable client/derived key. When provided,
   * starting a run with the same (tenantId, idempotencyKey) replays the
   * existing run instead of creating a duplicate; the database enforces
   * uniqueness (partial unique index). Webhook and event triggers
   * derive keys from (trigger, payload) so duplicate deliveries dedupe
   * automatically.
   */
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  startedAt: DateTimeSchema.optional(),
  completedAt: DateTimeSchema.optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type OrcfloRun = z.infer<typeof OrcfloRunSchema>;

// --- Run stream ---

export const OrcfloRunEventTypeSchema = z.enum([
  'run.started',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'step.started',
  'step.completed',
  'step.cached',
  'step.failed',
]);
export type OrcfloRunEventType = z.infer<typeof OrcfloRunEventTypeSchema>;

export const OrcfloRunEventSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  runId: IdSchema,
  /** Monotonic per-run sequence; the stream contract replays in this order. */
  sequence: z.number().int().positive(),
  eventType: OrcfloRunEventTypeSchema,
  nodeId: IdSchema.optional(),
  status: OrcfloStepStatusSchema.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  occurredAt: DateTimeSchema,
}).strict();
export type OrcfloRunEvent = z.infer<typeof OrcfloRunEventSchema>;

// --- Step cache ---

export const OrcfloStepCacheEntrySchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  key: z.string().min(8).max(128),
  workflowId: IdSchema,
  workflowVersion: z.number().int().positive(),
  nodeId: IdSchema,
  inputHash: z.string().min(8).max(128),
  output: z.unknown(),
  hits: z.number().int().nonnegative(),
  createdAt: DateTimeSchema,
  lastHitAt: DateTimeSchema.optional(),
}).strict();
export type OrcfloStepCacheEntry = z.infer<typeof OrcfloStepCacheEntrySchema>;

// --- Metering ---

export const OrcfloMeteringMetricSchema = z.enum([
  'run.count',
  'run.duration_ms',
  'step.count',
  'step.cache_hit',
  'step.cache_miss',
  'step.failed',
  'model.call',
  'model.tokens_in',
  'model.tokens_out',
  'model.failed',
  'cost.minor',
]);
export type OrcfloMeteringMetric = z.infer<typeof OrcfloMeteringMetricSchema>;

export const OrcfloMeteringRecordSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  runId: IdSchema.optional(),
  workflowId: IdSchema.optional(),
  nodeId: IdSchema.optional(),
  metric: OrcfloMeteringMetricSchema,
  unit: z.string().min(1).max(20),
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  recordedAt: DateTimeSchema,
}).strict();
export type OrcfloMeteringRecord = z.infer<typeof OrcfloMeteringRecordSchema>;

export const OrcfloMeteringSummarySchema = z.object({
  tenantId: IdSchema,
  since: DateTimeSchema.optional(),
  runs: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  cacheMisses: z.number().int().nonnegative(),
  failedSteps: z.number().int().nonnegative(),
  modelCalls: z.number().int().nonnegative(),
  modelFailures: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  costMinor: z.number().int().nonnegative(),
}).strict();
export type OrcfloMeteringSummary = z.infer<typeof OrcfloMeteringSummarySchema>;

// --- Model providers ---

export const ModelProviderKindSchema = z.enum(['noop', 'demo', 'external']);
export type ModelProviderKind = z.infer<typeof ModelProviderKindSchema>;

export const ModelProviderSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: z.string().trim().min(2).max(100),
  kind: ModelProviderKindSchema,
  /** Model identifier, e.g. a future reviewed provider's model name. */
  model: z.string().trim().min(1).max(200).optional(),
  /** Required when kind = external; never used by noop/demo gateways. */
  endpoint: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type OrcfloModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelCallStatusSchema = z.enum(['COMPLETED', 'FAILED']);
export type ModelCallStatus = z.infer<typeof ModelCallStatusSchema>;

export const ModelCallResultSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  providerId: IdSchema,
  status: ModelCallStatusSchema,
  /** Deterministic response text when status = COMPLETED. */
  text: z.string().max(8_000).optional(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  error: z.object({ code: z.string(), message: z.string() }).strict().optional(),
  createdAt: DateTimeSchema,
}).strict();
export type ModelCallResult = z.infer<typeof ModelCallResultSchema>;

export const ModelCallRequestSchema = z.object({
  providerId: IdSchema,
  prompt: z.string().trim().min(1).max(8_000),
  maxTokens: z.number().int().min(1).max(4_096).default(256),
}).strict();
export type ModelCallRequest = z.infer<typeof ModelCallRequestSchema>;

// --- Triggers (the four kinds) ---

const CommonTriggerFields = {
  id: IdSchema,
  tenantId: IdSchema,
  workflowId: IdSchema,
  name: z.string().trim().min(2).max(100),
  enabled: z.boolean().default(true),
  lastFiredAt: DateTimeSchema.optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  metadata: MetadataSchema,
} as const;

export const ManualTriggerConfigSchema = z.object({}).strict();
export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

export const ScheduleTriggerConfigSchema = z.object({
  cron: z.string().trim().min(9).max(100),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
}).strict();
export type ScheduleTriggerConfig = z.infer<typeof ScheduleTriggerConfigSchema>;

export const WebhookTriggerConfigSchema = z.object({
  key: z.string().trim().min(16).max(200),
}).strict();
export type WebhookTriggerConfig = z.infer<typeof WebhookTriggerConfigSchema>;

export const EventTriggerConfigSchema = z.object({
  eventType: z.string().regex(/^[a-z][a-z0-9_.-]+$/, 'eventType must match ^[a-z][a-z0-9_.-]+$'),
}).strict();
export type EventTriggerConfig = z.infer<typeof EventTriggerConfigSchema>;

/**
 * §34 — Public interface (public form) trigger.
 *
 * A workflow exposed to anonymous callers. `slug` identifies the
 * interface publicly (`pub_…`); `inputSchema` declares the accepted
 * input shape (validated at run time); rate/run/cost limits bound
 * abuse; `environment` is the synthetic caller environment for the
 * run (node/agent policies still apply, so a public interface cannot
 * bypass a tenant's policy gates).
 */
export const PublicInputFieldTypeSchema = z.enum(['string', 'number', 'boolean', 'json']);
export type PublicInputFieldType = z.infer<typeof PublicInputFieldTypeSchema>;

export const PublicInputFieldSchema = z.object({
  type: PublicInputFieldTypeSchema,
  required: z.boolean().default(true),
  default: z.unknown().optional(),
}).strict();
export type PublicInputField = z.infer<typeof PublicInputFieldSchema>;

export const PublicTriggerConfigSchema = z.object({
  /** Public slug; generated (`pub_…`) when omitted at creation. */
  slug: z.string().regex(/^pub_[a-z0-9_-]{8,64}$/).optional(),
  inputSchema: z.record(z.string(), PublicInputFieldSchema).default({}),
  rateLimitPerMinute: z.number().int().min(1).max(1_000).default(10),
  maxRunsPerDay: z.number().int().min(1).max(100_000).default(100),
  maxCostMinor: z.number().int().nonnegative().max(100_000_000).default(100_000),
  maxDurationMs: z.number().int().min(100).max(120_000).default(30_000),
  environment: z.enum(['demo', 'development', 'staging', 'production']).default('demo'),
}).strict();
export type PublicTriggerConfig = z.infer<typeof PublicTriggerConfigSchema>;

export const OrcfloTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ ...CommonTriggerFields, kind: z.literal('manual'), config: ManualTriggerConfigSchema }).strict(),
  z.object({ ...CommonTriggerFields, kind: z.literal('schedule'), config: ScheduleTriggerConfigSchema }).strict(),
  z.object({ ...CommonTriggerFields, kind: z.literal('webhook'), config: WebhookTriggerConfigSchema }).strict(),
  z.object({ ...CommonTriggerFields, kind: z.literal('event'), config: EventTriggerConfigSchema }).strict(),
  z.object({ ...CommonTriggerFields, kind: z.literal('public'), config: PublicTriggerConfigSchema }).strict(),
]);
export type OrcfloTrigger = z.infer<typeof OrcfloTriggerSchema>;

// --- Blueprints ---

export const BlueprintParameterTypeSchema = z.enum(['string', 'number', 'boolean', 'json']);
export type BlueprintParameterType = z.infer<typeof BlueprintParameterTypeSchema>;

export const BlueprintParameterSchema = z.object({
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().trim().min(1).max(100),
  type: BlueprintParameterTypeSchema.default('string'),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
}).strict();
export type BlueprintParameter = z.infer<typeof BlueprintParameterSchema>;

export const BlueprintSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1_000).default(''),
  version: z.number().int().positive().default(1),
  parameters: z.array(BlueprintParameterSchema).max(50).default([]),
  graph: z.object({
    nodes: z.array(WorkflowNodeSchema).min(1).max(500),
    edges: z.array(WorkflowEdgeSchema).max(2_000).default([]),
  }).strict(),
  metadata: MetadataSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).strict();
export type OrcfloBlueprint = z.infer<typeof BlueprintSchema>;

export const BlueprintInstantiateSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  workflowName: z.string().trim().min(2).max(200).optional(),
  status: WorkflowStatusSchema.default('DRAFT'),
  metadata: MetadataSchema,
}).strict();
export type BlueprintInstantiate = z.infer<typeof BlueprintInstantiateSchema>;
