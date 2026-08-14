import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../app/generated/prisma/client';
import { AgentCommandService } from '../lib/application/agent-command-service';
import type { PlatformPorts } from '../lib/application/ports';
import { TransactionService } from '../lib/application/transaction-service';
import { PlatformError } from '../lib/domain/errors';
import { createDomainEvent } from '../lib/domain/events';
import { TransactionSchema, WorkflowSchema } from '../lib/domain/schemas';
import {
  createPrismaPersistencePorts,
  PrismaUnitOfWork,
} from '../lib/infrastructure/prisma-adapters';

vi.mock('server-only', () => ({}));

const runPostgres = process.env.RUN_POSTGRES_INTEGRATION === '1';
const postgresDescribe = runPostgres ? describe : describe.skip;

postgresDescribe('PostgreSQL 16 persistence integration', () => {
  let prisma: PrismaClient;
  let ports: PlatformPorts;
  const runId = randomUUID().replaceAll('-', '');
  const tenantId = 'tenant_smoke';
  const otherTenantId = 'tenant_other';

  beforeAll(() => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const persistence = createPrismaPersistencePorts(prisma);
    ports = {
      ...persistence,
      unitOfWork: new PrismaUnitOfWork(prisma),
      toolExecutor: {
        execute: async () => {
          throw new Error('Tool execution is outside this persistence integration test.');
        },
      },
    };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('round-trips workflow create/read/update JSON and enforces repository tenant isolation', async () => {
    const now = new Date().toISOString();
    const id = `workflow_pg_${runId}`;
    const workflow = WorkflowSchema.parse({
      id,
      tenantId,
      name: 'Lagos distributor verification',
      description: 'PostgreSQL JSON and tenant-boundary verification.',
      status: 'READY',
      version: 1,
      nodes: [{
        id: 'start',
        type: 'trigger',
        label: 'Receive distributor request',
        configuration: { executionMode: 'demo', region: 'West Africa' },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: { channels: ['voice', 'web'], enabled: true },
      }],
      edges: [],
      metadata: {
        market: 'Lagos',
        scoreBands: [0, 25, 100],
        controls: { humanApproval: true, note: null },
      },
      createdAt: now,
      updatedAt: now,
    });

    await ports.workflows.save(workflow);
    expect(await ports.workflows.findById(tenantId, id)).toEqual(workflow);
    expect(await ports.workflows.findById(otherTenantId, id)).toBeNull();

    const updated = WorkflowSchema.parse({
      ...workflow,
      name: 'Updated Lagos distributor verification',
      version: 2,
      metadata: { ...workflow.metadata, reviewed: true },
      updatedAt: new Date().toISOString(),
    });
    await ports.workflows.save(updated);
    expect(await ports.workflows.findById(tenantId, id)).toEqual(updated);

    await expect(ports.workflows.save({ ...updated, tenantId: otherTenantId }))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(await ports.workflows.findById(tenantId, id)).toEqual(updated);
  });

  it('publishes a privacy-safe command proposal and outbox intent atomically', async () => {
    const service = new AgentCommandService(ports);
    const correlationId = `corr_command_${runId}`;
    const result = await service.propose({
      text: 'Add a condition node after confidential Lagos vendor lookup',
      modality: 'TEXT',
      workflowId: `workflow_command_${runId}`,
      context: {
        tenantId,
        actorId: 'actor_builder',
        role: 'BUILDER',
        correlationId,
        environment: 'demo',
      },
    });

    expect(result.command).toMatchObject({
      intent: 'add_node',
      status: 'PROPOSED',
      requiresConfirmation: false,
    });
    const events = await ports.events.listByCorrelation(tenantId, correlationId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'agent.command.proposed',
      aggregateId: result.command.id,
      payload: {
        rawTextPersisted: false,
        entityKeys: expect.arrayContaining(['after', 'nodeType']),
      },
    });
    expect(JSON.stringify(events[0].payload)).not.toContain('confidential Lagos vendor lookup');
    const outbox = (await ports.outbox.listPending(tenantId, 1_000))
      .find((message) => message.eventId === events[0].id);
    expect(outbox).toMatchObject({
      topic: 'agent.command.proposed',
      status: 'PENDING',
      payload: events[0],
    });
  });

  it('round-trips maximum safe integer, event JSON, and its pending outbox envelope', async () => {
    const service = new TransactionService(ports);
    const correlationId = `corr_roundtrip_${runId}`;
    const amountMinor = Number.MAX_SAFE_INTEGER;
    const context = {
      tenantId,
      actorId: 'actor_builder',
      role: 'BUILDER' as const,
      correlationId,
      environment: 'demo' as const,
    };

    const result = await service.request({
      type: 'PURCHASE_ORDER',
      amountMinor,
      currency: 'ngn',
      recipient: 'Eko Industrial Cooperative',
      idempotencyKey: `pg-roundtrip-${runId}`,
      metadata: {
        region: 'Lagos',
        nested: { channels: ['voice', 'canvas'], verified: false, note: null },
      },
      context,
    });

    expect((await ports.transactions.findById(tenantId, result.transaction.id))?.amountMinor)
      .toBe(amountMinor);
    const events = await ports.events.listByCorrelation(tenantId, correlationId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'transaction.approval_requested',
      payload: { amountMinor, currency: 'NGN', approvalId: result.approval.id },
    });
    const outbox = (await ports.outbox.listPending(tenantId, 1_000))
      .find((message) => message.eventId === events[0].id);
    expect(outbox).toMatchObject({
      tenantId,
      topic: 'transaction.approval_requested',
      status: 'PENDING',
      attempts: 0,
      payload: events[0],
    });
    expect(JSON.stringify(outbox)).toContain(amountMinor.toString());
  });

  it('rolls aggregate, event, and outbox writes back atomically after an injected failure', async () => {
    const now = new Date().toISOString();
    const transaction = TransactionSchema.parse({
      id: `txn_rollback_${runId}`,
      tenantId,
      type: 'PURCHASE_ORDER',
      amountMinor: 75_000_000,
      currency: 'NGN',
      recipient: 'Kano Agricultural Processors',
      status: 'CREATED',
      idempotencyKey: `pg-rollback-${runId}`,
      metadata: { injectedFailure: true },
      createdAt: now,
      updatedAt: now,
    });
    const correlationId = `corr_rollback_${runId}`;
    const event = createDomainEvent(
      'transaction.rollback_probe',
      { type: 'transaction', id: transaction.id },
      { amountMinor: transaction.amountMinor, nested: { region: 'Northern Nigeria' } },
      { tenantId, actorId: 'actor_builder', correlationId },
    );

    await expect(ports.unitOfWork.run(async (scoped) => {
      await scoped.transactions.save(transaction);
      await scoped.events.publish(event);
      throw new PlatformError('TRANSACTION_ERROR', 'Injected PostgreSQL rollback verification.');
    })).rejects.toMatchObject({ code: 'TRANSACTION_ERROR' });

    expect(await ports.transactions.findById(tenantId, transaction.id)).toBeNull();
    expect(await ports.events.listByCorrelation(tenantId, correlationId)).toEqual([]);
    expect((await ports.outbox.listPending(tenantId, 1_000))
      .some((message) => message.eventId === event.id)).toBe(false);
  });

  it('serializes duplicate requests and permits only one competing approval decision', async () => {
    const service = new TransactionService(ports);
    const correlationId = `corr_concurrency_${runId}`;
    const request = {
      type: 'PURCHASE_ORDER',
      amountMinor: 225_750_000,
      currency: 'NGN',
      recipient: 'Port Harcourt Packaging Cooperative',
      idempotencyKey: `pg-concurrency-${runId}`,
      context: {
        tenantId,
        actorId: 'actor_builder',
        role: 'BUILDER' as const,
        correlationId,
        environment: 'demo' as const,
      },
    };

    const [first, second] = await Promise.all([service.request(request), service.request(request)]);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(second.approval.id).toBe(first.approval.id);

    const decisions = await Promise.allSettled([
      service.decide({
        approvalId: first.approval.id,
        decision: 'APPROVED',
        reason: 'Finance controls verified.',
        context: { ...request.context, actorId: 'actor_finance_one', role: 'APPROVER' as const },
      }),
      service.decide({
        approvalId: first.approval.id,
        decision: 'REJECTED',
        reason: 'Competing finance decision.',
        context: { ...request.context, actorId: 'actor_finance_two', role: 'APPROVER' as const },
      }),
    ]);

    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const events = await ports.events.listByCorrelation(tenantId, correlationId);
    expect(events).toHaveLength(2);
    expect(events.filter((event) => event.eventType === 'transaction.approval_requested')).toHaveLength(1);
    expect(events.filter((event) => ['transaction.authorized', 'transaction.rejected'].includes(event.eventType)))
      .toHaveLength(1);
    const eventIds = new Set(events.map((event) => event.id));
    expect((await ports.outbox.listPending(tenantId, 1_000))
      .filter((message) => eventIds.has(message.eventId))).toHaveLength(2);
  });
});
