import 'server-only';

import type {
  AgentRepository,
  ApprovalRepository,
  EventLog,
  EventPublisher,
  ExecutionRepository,
  OrcfloBlueprintRepository,
  OrcfloDecisionRepository,
  OrcfloMeteringRepository,
  OrcfloModelProviderRepository,
  OrcfloPersistencePorts,
  OrcfloRunEventRepository,
  OrcfloRunRepository,
  OrcfloStepCacheRepository,
  OrcfloTriggerRepository,
  OutboxRepository,
  PersistencePorts,
  ToolRepository,
  TransactionRepository,
  UnitOfWork,
  WorkflowRepository,
} from '../application/ports';
import {
  AgentSchema,
  DomainEventSchema,
  HumanApprovalSchema,
  OutboxMessageSchema,
  ToolDefinitionSchema,
  TransactionSchema,
  WorkflowExecutionSchema,
  WorkflowSchema,
  type Agent,
  type DomainEvent,
  type HumanApproval,
  type OutboxMessage,
  type ToolDefinition,
  type Transaction,
  type Workflow,
  type WorkflowExecution,
} from '../domain/schemas';
import {
  BlueprintSchema,
  ModelProviderSchema,
  OrcfloDecisionRecordSchema,
  OrcfloMeteringRecordSchema,
  OrcfloRunEventSchema,
  OrcfloRunSchema,
  OrcfloStepCacheEntrySchema,
  OrcfloTriggerSchema,
  type OrcfloBlueprint,
  type OrcfloDecisionRecord,
  type OrcfloMeteringRecord,
  type OrcfloModelProvider,
  type OrcfloRun,
  type OrcfloRunEvent,
  type OrcfloStepCacheEntry,
  type OrcfloTrigger,
} from '../domain/orcflo';
import { PlatformError } from '../domain/errors';
import { createOutboxMessage } from '../domain/events';
import { Prisma, type PrismaClient } from '../../app/generated/prisma/client';

function json(value: unknown): Prisma.InputJsonValue {
  // Prisma JSON rejects JavaScript `undefined`; JSON round-tripping also keeps
  // the durable outbox payload identical to what an external transport can send.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function assertTenantOwnership(existingTenantId: string | undefined, nextTenantId: string): void {
  if (existingTenantId && existingTenantId !== nextTenantId) {
    throw new PlatformError('AUTHORIZATION_DENIED', 'Resource identifier is not available to this tenant.');
  }
}

export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.agent.findFirst({ where: { id, tenantId } });
    return row ? mapAgent(row) : null;
  }
  async list(tenantId: string) {
    const rows = await this.prisma.agent.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(mapAgent);
  }
  async save(value: Agent) {
    const data = {
      tenantId: value.tenantId,
      name: value.name,
      description: value.description,
      role: value.role,
      status: value.status,
      goals: json(value.goals),
      instructions: value.instructions,
      toolIds: json(value.toolIds),
      capabilities: json(value.capabilities),
      permissions: json(value.permissions),
      policies: json(value.policies),
      metadata: json(value.metadata),
      version: value.version,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.agent.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.agent.updateMany({ where: { id: value.id, tenantId: value.tenantId }, data });
    if (updated.count === 0) await this.prisma.agent.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaToolRepository implements ToolRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.toolDefinition.findFirst({ where: { id, tenantId } });
    return row ? mapTool(row) : null;
  }
  async list(tenantId: string) {
    const rows = await this.prisma.toolDefinition.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(mapTool);
  }
  async save(value: ToolDefinition) {
    const data = {
      tenantId: value.tenantId,
      name: value.name,
      description: value.description,
      inputSchema: json(value.inputSchema),
      permissions: json(value.permissions),
      riskLevel: value.riskLevel,
      timeoutMs: value.timeoutMs,
      cost: json(value.cost),
      availability: value.availability,
      metadata: json(value.metadata),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.toolDefinition.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.toolDefinition.updateMany({ where: { id: value.id, tenantId: value.tenantId }, data });
    if (updated.count === 0) await this.prisma.toolDefinition.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.workflow.findFirst({ where: { id, tenantId } });
    return row ? mapWorkflow(row) : null;
  }
  async list(tenantId: string) {
    const rows = await this.prisma.workflow.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(mapWorkflow);
  }
  async save(value: Workflow) {
    const data = {
      tenantId: value.tenantId,
      name: value.name,
      description: value.description,
      status: value.status,
      version: value.version,
      nodes: json(value.nodes),
      edges: json(value.edges),
      metadata: json(value.metadata),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.workflow.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.workflow.updateMany({ where: { id: value.id, tenantId: value.tenantId }, data });
    if (updated.count === 0) await this.prisma.workflow.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.workflowExecution.findFirst({ where: { id, tenantId } });
    return row ? mapExecution(row) : null;
  }
  async listForWorkflow(tenantId: string, workflowId: string) {
    const rows = await this.prisma.workflowExecution.findMany({
      where: { tenantId, workflowId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapExecution);
  }
  async save(value: WorkflowExecution) {
    const data = {
      tenantId: value.tenantId,
      workflowId: value.workflowId,
      status: value.status,
      input: json(value.input),
      output: value.output === undefined ? undefined : json(value.output),
      nodeResults: json(value.nodeResults),
      correlationId: value.correlationId,
      startedAt: value.startedAt,
      completedAt: value.completedAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.workflowExecution.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.workflowExecution.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.workflowExecution.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.transaction.findFirst({ where: { id, tenantId } });
    return row ? mapTransaction(row) : null;
  }
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const row = await this.prisma.transaction.findFirst({ where: { tenantId, idempotencyKey } });
    return row ? mapTransaction(row) : null;
  }
  async save(value: Transaction) {
    const data = {
      tenantId: value.tenantId,
      agentId: value.agentId,
      type: value.type,
      amountMinor: BigInt(value.amountMinor),
      currency: value.currency,
      recipient: value.recipient,
      status: value.status,
      authorization: value.authorization === undefined ? undefined : json(value.authorization),
      idempotencyKey: value.idempotencyKey,
      metadata: json(value.metadata),
      createdAt: value.createdAt,
      completedAt: value.completedAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.transaction.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.transaction.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.transaction.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaApprovalRepository implements ApprovalRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.humanApproval.findFirst({ where: { id, tenantId } });
    return row ? mapApproval(row) : null;
  }
  async findForResource(tenantId: string, resourceType: string, resourceId: string) {
    const row = await this.prisma.humanApproval.findFirst({
      where: { tenantId, resourceType, resourceId },
      orderBy: { requestedAt: 'desc' },
    });
    return row ? mapApproval(row) : null;
  }
  async save(value: HumanApproval) {
    const data = {
      tenantId: value.tenantId,
      resourceType: value.resourceType,
      resourceId: value.resourceId,
      status: value.status,
      requestedBy: value.requestedBy,
      decidedBy: value.decidedBy,
      reason: value.reason,
      metadata: json(value.metadata),
      requestedAt: value.requestedAt,
      decidedAt: value.decidedAt,
    };
    const owner = await this.prisma.humanApproval.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.humanApproval.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.humanApproval.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.outboxMessage.findFirst({ where: { id, tenantId } });
    return row ? mapOutbox(row) : null;
  }
  async listPending(tenantId: string, limit = 100) {
    const take = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const rows = await this.prisma.outboxMessage.findMany({
      where: { tenantId, status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take,
    });
    return rows.map(mapOutbox);
  }
  async save(value: OutboxMessage) {
    const data = {
      tenantId: value.tenantId,
      eventId: value.eventId,
      topic: value.topic,
      payload: json(value.payload),
      status: value.status,
      attempts: value.attempts,
      availableAt: value.availableAt,
      publishedAt: value.publishedAt ?? null,
      lastError: value.lastError ?? null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.outboxMessage.findUnique({
      where: { id: value.id },
      select: { tenantId: true },
    });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.outboxMessage.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.outboxMessage.create({ data: { id: value.id, ...data } });
  }

  // Audit §3 — claim/lease semantics on the Prisma adapter.
  // Uses `FOR UPDATE SKIP LOCKED` for atomic claim, and reclaims rows
  // whose `claimedUntil` is in the past even when their status is
  // still `CLAIMED`. The schema must include `claimedBy` and
  // `claimedUntil` columns; see the capability-extension migration.
  async claimBatch(workerId: string, leaseMs: number, limit: number): Promise<OutboxMessage[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const leaseMsClamped = Math.max(100, Math.trunc(leaseMs));
    const now = new Date();
    const claimedUntil = new Date(now.getTime() + leaseMsClamped);
    // Atomically select candidates. Prisma's typed query API does not
    // expose `FOR UPDATE SKIP LOCKED`; use a raw SELECT and an atomic
    // UPDATE in a single transaction. Two workers will not see the
    // same row because the UPDATE locks the selected rows.
    return await (this.prisma as PrismaClient).$transaction(async (tx) => {
      // The generic is suppressed at the call site; the row shape is
      // documented in the SQL above and asserted via the row.id cast.
      const candidates = (await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "OutboxMessage"
        WHERE (
          ("status" = 'PENDING' AND "availableAt" <= ${now})
          OR ("status" = 'CLAIMED' AND "claimedUntil" <= ${now})
        )
        ORDER BY "createdAt" ASC
        LIMIT ${safeLimit}
        FOR UPDATE SKIP LOCKED
      `)) as Array<{ id: string }>;
      if (candidates.length === 0) return [];
      const ids = candidates.map((c) => c.id);
      await tx.outboxMessage.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'CLAIMED',
          claimedBy: workerId,
          claimedUntil,
          updatedAt: now,
        },
      });
      const rows = await tx.outboxMessage.findMany({ where: { id: { in: ids } } });
      return rows.map((row) => mapOutbox(row));
    });
  }

  async markPublished(id: string, publishedAtIso: string): Promise<void> {
    const publishedAt = new Date(publishedAtIso);
    const updated = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'CLAIMED' },
      data: {
        status: 'PUBLISHED',
        publishedAt,
        lastError: null,
        claimedBy: null,
        claimedUntil: null,
        updatedAt: publishedAt,
      },
    });
    if (updated.count === 0) {
      throw new PlatformError('CONFLICT', `Outbox message ${id} is not in CLAIMED status.`);
    }
  }

  async recordAttemptFailure(id: string, lastError: string, availableAtIso: string): Promise<OutboxMessage> {
    const availableAt = new Date(availableAtIso);
    const updated = await this.prisma.outboxMessage.updateMany({
      where: { id, status: 'CLAIMED' },
      data: {
        status: 'PENDING',
        attempts: { increment: 1 },
        lastError,
        availableAt,
        claimedBy: null,
        claimedUntil: null,
        updatedAt: availableAt,
      },
    });
    if (updated.count === 0) {
      throw new PlatformError('CONFLICT', `Outbox message ${id} is not in CLAIMED status.`);
    }
    const row = await this.prisma.outboxMessage.findFirst({ where: { id } });
    if (!row) throw new PlatformError('NOT_FOUND', `Outbox message ${id} was not found.`);
    return mapOutbox(row);
  }

  async markDeadLettered(id: string, lastError: string): Promise<void> {
    const updated = await this.prisma.outboxMessage.updateMany({
      where: { id, status: { in: ['CLAIMED', 'PENDING'] } },
      data: {
        status: 'DEAD_LETTERED',
        lastError,
        claimedBy: null,
        claimedUntil: null,
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new PlatformError('CONFLICT', `Outbox message ${id} could not be dead-lettered.`);
    }
  }
}

export class PrismaEventStore implements EventPublisher, EventLog {
  constructor(
    private readonly prisma: DatabaseClient,
    private readonly transactionScoped = false,
  ) {}

  async publish(event: DomainEvent) {
    if (!this.transactionScoped) {
      await (this.prisma as PrismaClient).$transaction(async (transaction) => {
        await new PrismaEventStore(transaction, true).publish(event);
      });
      return;
    }
    await this.append(event);
    await new PrismaOutboxRepository(this.prisma).save(createOutboxMessage(event));
  }

  async append(event: DomainEvent) {
    await this.prisma.domainEvent.create({
      data: {
        id: event.id,
        tenantId: event.tenantId,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: json(event.payload),
        metadata: json(event.metadata),
      },
    });
  }

  async listByCorrelation(tenantId: string, correlationId: string) {
    const rows = await this.prisma.domainEvent.findMany({
      where: { tenantId, correlationId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(mapEvent);
  }
}

export function createPrismaPersistencePorts(
  prisma: DatabaseClient,
  transactionScoped = false,
): PersistencePorts & { orcflo: OrcfloPersistencePorts } {
  const outbox = new PrismaOutboxRepository(prisma);
  const orcflo: OrcfloPersistencePorts = {
    runs: new PrismaOrcfloRunRepository(prisma),
    runEvents: new PrismaOrcfloRunEventRepository(prisma),
    stepCache: new PrismaOrcfloStepCacheRepository(prisma),
    metering: new PrismaOrcfloMeteringRepository(prisma),
    decisions: new PrismaOrcfloDecisionRepository(prisma),
    modelProviders: new PrismaOrcfloModelProviderRepository(prisma),
    triggers: new PrismaOrcfloTriggerRepository(prisma),
    blueprints: new PrismaOrcfloBlueprintRepository(prisma),
  };
  return {
    agents: new PrismaAgentRepository(prisma),
    tools: new PrismaToolRepository(prisma),
    workflows: new PrismaWorkflowRepository(prisma),
    executions: new PrismaExecutionRepository(prisma),
    transactions: new PrismaTransactionRepository(prisma),
    approvals: new PrismaApprovalRepository(prisma),
    events: new PrismaEventStore(prisma, transactionScoped),
    outbox,
    orcflo,
  };
}

// --- Orcflo engine repositories (additive) ---

export class PrismaOrcfloRunRepository implements OrcfloRunRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.orcfloRun.findFirst({ where: { id, tenantId } });
    return row ? mapOrcfloRun(row) : null;
  }
  async findByIdGlobal(id: string) {
    const row = await this.prisma.orcfloRun.findFirst({ where: { id } });
    return row ? mapOrcfloRun(row) : null;
  }
  async list(tenantId: string, options: { workflowId?: string; limit?: number } = {}) {
    const take = Math.max(1, Math.min(Math.trunc(options.limit ?? 100), 1_000));
    const rows = await this.prisma.orcfloRun.findMany({
      where: { tenantId, workflowId: options.workflowId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(mapOrcfloRun);
  }
  async listByTrigger(tenantId: string, triggerId: string, limit = 100) {
    const take = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const rows = await this.prisma.orcfloRun.findMany({
      where: { tenantId, triggerId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(mapOrcfloRun);
  }
  async listPending(limit = 50) {
    const take = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const rows = await this.prisma.orcfloRun.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take,
    });
    return rows.map(mapOrcfloRun);
  }

  // Multi-worker claim/lease — mirrors the outbox protocol: atomic
  // FOR UPDATE SKIP LOCKED selection + conditional UPDATE inside one
  // transaction, reclaiming rows whose lease has expired.
  async claimBatch(workerId: string, leaseMs: number, limit: number): Promise<OrcfloRun[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1_000));
    const leaseMsClamped = Math.max(100, Math.trunc(leaseMs));
    const now = new Date();
    const claimedUntil = new Date(now.getTime() + leaseMsClamped);
    return await (this.prisma as PrismaClient).$transaction(async (tx) => {
      const candidates = (await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "OrcfloRun"
        WHERE (
          "status" = 'PENDING'
          AND ("claimedBy" IS NULL OR "claimedUntil" <= ${now})
        )
        ORDER BY "createdAt" ASC
        LIMIT ${safeLimit}
        FOR UPDATE SKIP LOCKED
      `)) as Array<{ id: string }>;
      if (candidates.length === 0) return [];
      const ids = candidates.map((c) => c.id);
      await tx.orcfloRun.updateMany({
        where: { id: { in: ids } },
        data: { claimedBy: workerId, claimedUntil, updatedAt: now },
      });
      const rows = await tx.orcfloRun.findMany({ where: { id: { in: ids } } });
      return rows.map(mapOrcfloRun);
    });
  }

  async releaseClaim(id: string, workerId: string): Promise<void> {
    await this.prisma.orcfloRun.updateMany({
      where: { id, claimedBy: workerId },
      data: { claimedBy: null, claimedUntil: null, updatedAt: new Date() },
    });
  }
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const row = await this.prisma.orcfloRun.findFirst({ where: { tenantId, idempotencyKey } });
    return row ? mapOrcfloRun(row) : null;
  }
  async save(value: OrcfloRun) {
    const data = {
      tenantId: value.tenantId,
      workflowId: value.workflowId,
      blueprintId: value.blueprintId,
      triggerId: value.triggerId,
      triggerKind: value.triggerKind,
      status: value.status,
      input: json(value.input),
      output: value.output === undefined ? undefined : json(value.output),
      stepResults: json(value.steps),
      correlationId: value.correlationId,
      idempotencyKey: value.idempotencyKey,
      actorId: value.actorId,
      role: value.role,
      environment: value.environment,
      limits: value.limits === undefined ? undefined : json(value.limits),
      approval: value.approval === undefined ? undefined : json(value.approval),
      claimedBy: value.claimedBy,
      claimedUntil: value.claimedUntil,
      startedAt: value.startedAt,
      completedAt: value.completedAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.orcfloRun.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    try {
      const updated = await this.prisma.orcfloRun.updateMany({ where: { id: value.id, tenantId: value.tenantId }, data });
      if (updated.count === 0) await this.prisma.orcfloRun.create({ data: { id: value.id, ...data } });
    } catch (error) {
      // §48 — the partial unique index on (tenantId, idempotencyKey) is
      // the ultimate race guard; surface it as the platform conflict.
      if (isUniqueViolation(error, 'idempotencyKey')) {
        throw new PlatformError('CONFLICT', 'A run already exists for this idempotency key.');
      }
      throw error;
    }
  }
}

export class PrismaOrcfloRunEventRepository implements OrcfloRunEventRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async append(event: OrcfloRunEvent) {
    await this.prisma.orcfloRunEvent.create({
      data: {
        id: event.id,
        tenantId: event.tenantId,
        runId: event.runId,
        sequence: event.sequence,
        eventType: event.eventType,
        nodeId: event.nodeId,
        status: event.status,
        payload: json(event.payload),
        occurredAt: event.occurredAt,
      },
    });
  }
  async listForRun(tenantId: string, runId: string) {
    const rows = await this.prisma.orcfloRunEvent.findMany({
      where: { tenantId, runId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map(mapOrcfloRunEvent);
  }
}

export class PrismaOrcfloStepCacheRepository implements OrcfloStepCacheRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findByKey(tenantId: string, key: string) {
    const row = await this.prisma.orcfloStepCacheEntry.findFirst({ where: { tenantId, key } });
    return row ? mapOrcfloStepCacheEntry(row) : null;
  }
  async save(entry: OrcfloStepCacheEntry) {
    const data = {
      tenantId: entry.tenantId,
      key: entry.key,
      workflowId: entry.workflowId,
      workflowVersion: entry.workflowVersion,
      nodeId: entry.nodeId,
      inputHash: entry.inputHash,
      output: json(entry.output),
      hits: entry.hits,
      createdAt: entry.createdAt,
      lastHitAt: entry.lastHitAt,
    };
    const owner = await this.prisma.orcfloStepCacheEntry.findUnique({ where: { id: entry.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, entry.tenantId);
    const updated = await this.prisma.orcfloStepCacheEntry.updateMany({
      where: { id: entry.id, tenantId: entry.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.orcfloStepCacheEntry.create({ data: { id: entry.id, ...data } });
  }
  async recordHit(tenantId: string, key: string, atIso: string) {
    const updated = await this.prisma.orcfloStepCacheEntry.updateMany({
      where: { tenantId, key },
      data: { hits: { increment: 1 }, lastHitAt: atIso },
    });
    if (updated.count === 0) {
      throw new PlatformError('NOT_FOUND', `Step cache entry ${key} was not found.`);
    }
  }
}

export class PrismaOrcfloMeteringRepository implements OrcfloMeteringRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async record(record: OrcfloMeteringRecord) {
    await this.prisma.orcfloMeteringRecord.create({
      data: {
        id: record.id,
        tenantId: record.tenantId,
        runId: record.runId,
        workflowId: record.workflowId,
        nodeId: record.nodeId,
        metric: record.metric,
        unit: record.unit,
        amount: BigInt(record.amount),
        recordedAt: record.recordedAt,
      },
    });
  }
  async list(tenantId: string, options: { since?: string; limit?: number } = {}) {
    const take = Math.max(1, Math.min(Math.trunc(options.limit ?? 10_000), 100_000));
    const rows = await this.prisma.orcfloMeteringRecord.findMany({
      where: {
        tenantId,
        recordedAt: options.since ? { gte: options.since } : undefined,
      },
      orderBy: { recordedAt: 'asc' },
      take,
    });
    return rows.map(mapOrcfloMeteringRecord);
  }
}

export class PrismaOrcfloDecisionRepository implements OrcfloDecisionRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async append(record: OrcfloDecisionRecord) {
    await this.prisma.orcfloDecisionRecord.create({
      data: {
        id: record.id,
        tenantId: record.tenantId,
        runId: record.runId,
        workflowId: record.workflowId,
        nodeId: record.nodeId,
        kind: record.kind,
        subject: record.subject,
        result: json(record.result),
        iteration: record.iteration,
        occurredAt: record.occurredAt,
      },
    });
  }
  async listForRun(tenantId: string, runId: string) {
    const rows = await this.prisma.orcfloDecisionRecord.findMany({
      where: { tenantId, runId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(mapOrcfloDecisionRecord);
  }
}

export class PrismaOrcfloModelProviderRepository implements OrcfloModelProviderRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.orcfloModelProvider.findFirst({ where: { id, tenantId } });
    return row ? mapOrcfloModelProvider(row) : null;
  }
  async list(tenantId: string) {
    const rows = await this.prisma.orcfloModelProvider.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapOrcfloModelProvider);
  }
  async save(value: OrcfloModelProvider) {
    const data = {
      tenantId: value.tenantId,
      name: value.name,
      kind: value.kind,
      model: value.model,
      endpoint: value.endpoint,
      config: json(value.config),
      enabled: value.enabled,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.orcfloModelProvider.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.orcfloModelProvider.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.orcfloModelProvider.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaOrcfloTriggerRepository implements OrcfloTriggerRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.orcfloTrigger.findFirst({ where: { id, tenantId } });
    return row ? mapOrcfloTrigger(row) : null;
  }
  async findPublicBySlug(slug: string) {
    // §34 — public slug lives in the JSON `config`; Postgres jsonb path
    // filter resolves it without a dedicated column.
    const row = await this.prisma.orcfloTrigger.findFirst({
      where: { kind: 'public', config: { path: ['slug'], equals: slug } },
    });
    return row ? mapOrcfloTrigger(row) : null;
  }
  async list(tenantId: string, options: { kind?: OrcfloTrigger['kind']; enabledOnly?: boolean } = {}) {
    const rows = await this.prisma.orcfloTrigger.findMany({
      where: {
        tenantId,
        kind: options.kind,
        enabled: options.enabledOnly === true ? true : undefined,
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapOrcfloTrigger);
  }
  async listAll(options: { kind?: OrcfloTrigger['kind']; enabledOnly?: boolean; limit?: number } = {}) {
    const take = Math.max(1, Math.min(Math.trunc(options.limit ?? 1_000), 10_000));
    const rows = await this.prisma.orcfloTrigger.findMany({
      where: {
        kind: options.kind,
        enabled: options.enabledOnly === true ? true : undefined,
      },
      orderBy: { createdAt: 'asc' },
      take,
    });
    return rows.map(mapOrcfloTrigger);
  }
  async save(value: OrcfloTrigger) {
    const data = {
      tenantId: value.tenantId,
      workflowId: value.workflowId,
      name: value.name,
      kind: value.kind,
      config: json(value.config),
      enabled: value.enabled,
      lastFiredAt: value.lastFiredAt,
      metadata: json(value.metadata),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.orcfloTrigger.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.orcfloTrigger.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.orcfloTrigger.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaOrcfloBlueprintRepository implements OrcfloBlueprintRepository {
  constructor(private readonly prisma: DatabaseClient) {}
  async findById(tenantId: string, id: string) {
    const row = await this.prisma.orcfloBlueprint.findFirst({ where: { id, tenantId } });
    return row ? mapOrcfloBlueprint(row) : null;
  }
  async list(tenantId: string) {
    const rows = await this.prisma.orcfloBlueprint.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapOrcfloBlueprint);
  }
  async save(value: OrcfloBlueprint) {
    const data = {
      tenantId: value.tenantId,
      name: value.name,
      description: value.description,
      version: value.version,
      parameters: json(value.parameters),
      graph: json(value.graph),
      metadata: json(value.metadata),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
    const owner = await this.prisma.orcfloBlueprint.findUnique({ where: { id: value.id }, select: { tenantId: true } });
    assertTenantOwnership(owner?.tenantId, value.tenantId);
    const updated = await this.prisma.orcfloBlueprint.updateMany({
      where: { id: value.id, tenantId: value.tenantId },
      data,
    });
    if (updated.count === 0) await this.prisma.orcfloBlueprint.create({ data: { id: value.id, ...data } });
  }
}

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(operation: (ports: PersistencePorts) => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => operation(createPrismaPersistencePorts(transaction, true)),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 10_000,
          },
        );
      } catch (error) {
        if (attempt === maxAttempts || !isRetryableTransactionConflict(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 20));
      }
    }
    throw new PlatformError('TRANSACTION_ERROR', 'Atomic persistence operation exhausted its retry limit.');
  }
}

function isRetryableTransactionConflict(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
  return code === 'P2034' || code === 'P2002';
}

/** True when the error is a P2002 unique violation touching `column`. */
function isUniqueViolation(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String(error.code) : undefined;
  if (code !== 'P2002') return false;
  const meta = 'meta' in error && error.meta !== null && typeof error.meta === 'object'
    ? (error.meta as Record<string, unknown>)
    : {};
  const target = String(meta.target ?? '');
  return target.includes(column);
}

function mapAgent(row: Record<string, unknown>): Agent {
  return AgentSchema.parse(withIsoDates(row));
}
function mapTool(row: Record<string, unknown>): ToolDefinition {
  return ToolDefinitionSchema.parse(withIsoDates(row));
}
function mapWorkflow(row: Record<string, unknown>): Workflow {
  return WorkflowSchema.parse(withIsoDates(row));
}
function mapExecution(row: Record<string, unknown>): WorkflowExecution {
  return WorkflowExecutionSchema.parse(withIsoDates(row));
}
function mapTransaction(row: Record<string, unknown>): Transaction {
  return TransactionSchema.parse(withIsoDates({ ...row, amountMinor: Number(row.amountMinor) }));
}
function mapApproval(row: Record<string, unknown>): HumanApproval {
  return HumanApprovalSchema.parse(withIsoDates(row));
}
function mapEvent(row: Record<string, unknown>): DomainEvent {
  return DomainEventSchema.parse(withIsoDates(row));
}
function mapOutbox(row: Record<string, unknown>): OutboxMessage {
  return OutboxMessageSchema.parse(withIsoDates(row));
}
function mapOrcfloRun(row: Record<string, unknown>): OrcfloRun {
  return OrcfloRunSchema.parse(withIsoDates(row));
}
function mapOrcfloRunEvent(row: Record<string, unknown>): OrcfloRunEvent {
  return OrcfloRunEventSchema.parse(withIsoDates(row));
}
function mapOrcfloStepCacheEntry(row: Record<string, unknown>): OrcfloStepCacheEntry {
  return OrcfloStepCacheEntrySchema.parse(withIsoDates(row));
}
function mapOrcfloMeteringRecord(row: Record<string, unknown>): OrcfloMeteringRecord {
  return OrcfloMeteringRecordSchema.parse(withIsoDates({ ...row, amount: Number(row.amount) }));
}
function mapOrcfloDecisionRecord(row: Record<string, unknown>): OrcfloDecisionRecord {
  return OrcfloDecisionRecordSchema.parse(withIsoDates(row));
}
function mapOrcfloModelProvider(row: Record<string, unknown>): OrcfloModelProvider {
  return ModelProviderSchema.parse(withIsoDates(row));
}
function mapOrcfloTrigger(row: Record<string, unknown>): OrcfloTrigger {
  return OrcfloTriggerSchema.parse(withIsoDates(row));
}
function mapOrcfloBlueprint(row: Record<string, unknown>): OrcfloBlueprint {
  return BlueprintSchema.parse(withIsoDates(row));
}
function withIsoDates(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, value]) => {
      // Prisma returns nullable SQL columns as `null`, while the canonical domain
      // contracts represent absent optional fields as `undefined`/omitted. Only
      // normalize top-level columns; nested JSON null values remain meaningful.
      if (value === null) return [];
      return [[key, value instanceof Date ? value.toISOString() : value]];
    }),
  );
}
