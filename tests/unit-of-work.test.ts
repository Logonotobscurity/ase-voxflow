import { describe, expect, it } from 'vitest';
import { PlatformError } from '../lib/domain/errors';
import { createDomainEvent } from '../lib/domain/events';
import { HumanApprovalSchema, TransactionSchema } from '../lib/domain/schemas';
import { actorContext, memoryPorts } from './helpers';

function records() {
  const now = new Date('2026-08-14T12:00:00.000Z').toISOString();
  const transaction = TransactionSchema.parse({
    id: 'txn_atomic_test',
    tenantId: actorContext.tenantId,
    type: 'PURCHASE_ORDER',
    amountMinor: 50_000,
    currency: 'NGN',
    recipient: 'Kora Packaging Ltd.',
    status: 'CREATED',
    idempotencyKey: 'atomic-test-0001',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });
  const approval = HumanApprovalSchema.parse({
    id: 'approval_atomic_test',
    tenantId: actorContext.tenantId,
    resourceType: 'transaction',
    resourceId: transaction.id,
    status: 'REQUESTED',
    requestedBy: actorContext.actorId,
    metadata: {},
    requestedAt: now,
  });
  const event = createDomainEvent(
    'transaction.approval_requested',
    { type: 'transaction', id: transaction.id },
    { approvalId: approval.id },
    actorContext,
  );
  return { transaction, approval, event };
}

describe('UnitOfWork and outbox', () => {
  it('commits aggregate records, event log, and delivery intent together', async () => {
    const ports = memoryPorts();
    const { transaction, approval, event } = records();

    await ports.unitOfWork.run(async (scoped) => {
      await scoped.transactions.save(transaction);
      await scoped.approvals.save(approval);
      await scoped.events.publish(event);
    });

    expect(await ports.transactions.findById(actorContext.tenantId, transaction.id)).toEqual(transaction);
    expect(await ports.approvals.findById(actorContext.tenantId, approval.id)).toEqual(approval);
    expect(await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId))
      .toEqual([event]);
    expect(await ports.outbox.listPending(actorContext.tenantId)).toEqual([
      expect.objectContaining({
        tenantId: actorContext.tenantId,
        eventId: event.id,
        topic: event.eventType,
        status: 'PENDING',
        attempts: 0,
        payload: event,
      }),
    ]);
  });

  it('rolls every write back when an atomic operation fails', async () => {
    const ports = memoryPorts();
    const { transaction, approval, event } = records();

    await expect(ports.unitOfWork.run(async (scoped) => {
      await scoped.transactions.save(transaction);
      await scoped.approvals.save(approval);
      await scoped.events.publish(event);
      throw new PlatformError('TRANSACTION_ERROR', 'Injected rollback test.');
    })).rejects.toMatchObject({ code: 'TRANSACTION_ERROR' });

    expect(await ports.transactions.findById(actorContext.tenantId, transaction.id)).toBeNull();
    expect(await ports.approvals.findById(actorContext.tenantId, approval.id)).toBeNull();
    expect(await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId)).toEqual([]);
    expect(await ports.outbox.listPending(actorContext.tenantId)).toEqual([]);
  });
});
