import 'server-only';

import type {
  AgentRepository,
  ApprovalRepository,
  EventLog,
  EventPublisher,
  ExecutionRepository,
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
): PersistencePorts {
  const outbox = new PrismaOutboxRepository(prisma);
  return {
    agents: new PrismaAgentRepository(prisma),
    tools: new PrismaToolRepository(prisma),
    workflows: new PrismaWorkflowRepository(prisma),
    executions: new PrismaExecutionRepository(prisma),
    transactions: new PrismaTransactionRepository(prisma),
    approvals: new PrismaApprovalRepository(prisma),
    events: new PrismaEventStore(prisma, transactionScoped),
    outbox,
  };
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
