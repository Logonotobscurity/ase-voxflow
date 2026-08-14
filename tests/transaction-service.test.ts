import { describe, expect, it } from 'vitest';
import { TransactionService } from '../lib/application/transaction-service';
import { actorContext, memoryPorts } from './helpers';

const transactionRequest = {
  type: 'PURCHASE_ORDER',
  amountMinor: 225_750_000,
  currency: 'NGN',
  recipient: 'Kora Packaging Ltd.',
  idempotencyKey: 'po-kora-2026-0841',
  context: actorContext,
};

describe('TransactionService', () => {
  it('creates an approval-gated transaction without executing it', async () => {
    const service = new TransactionService(memoryPorts());
    const result = await service.request(transactionRequest);
    expect(result.transaction.status).toBe('CREATED');
    expect(result.transaction.authorization).toBeUndefined();
    expect(result.approval.status).toBe('REQUESTED');
  });

  it('is idempotent for the same tenant and idempotency key', async () => {
    const ports = memoryPorts();
    const service = new TransactionService(ports);
    const first = await service.request(transactionRequest);
    const second = await service.request(transactionRequest);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(second.approval.id).toBe(first.approval.id);
    expect(await ports.outbox.listPending(actorContext.tenantId)).toHaveLength(1);
  });

  it('serializes concurrent requests for the same idempotency key', async () => {
    const ports = memoryPorts();
    const service = new TransactionService(ports);
    const [first, second] = await Promise.all([
      service.request(transactionRequest),
      service.request(transactionRequest),
    ]);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(second.approval.id).toBe(first.approval.id);
    expect(await ports.outbox.listPending(actorContext.tenantId)).toHaveLength(1);
  });

  it('forbids self approval', async () => {
    const service = new TransactionService(memoryPorts());
    const requested = await service.request(transactionRequest);
    await expect(service.decide({
      approvalId: requested.approval.id,
      decision: 'APPROVED',
      reason: 'I requested this myself.',
      context: { ...actorContext, role: 'APPROVER' },
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });

  it('allows a separate approver to authorize but not externally complete a transaction', async () => {
    const ports = memoryPorts();
    const service = new TransactionService(ports);
    const requested = await service.request(transactionRequest);
    const result = await service.decide({
      approvalId: requested.approval.id,
      decision: 'APPROVED',
      reason: 'Budget and vendor controls verified.',
      context: { ...actorContext, actorId: 'actor_finance', role: 'APPROVER' },
    });
    expect(result.approval.status).toBe('APPROVED');
    expect(result.transaction.status).toBe('AUTHORIZED');
    expect(result.transaction.status).not.toBe('COMPLETED');
    expect(result.transaction.authorization).toMatchObject({ approvedBy: 'actor_finance' });
  });

  it('permits only one concurrent approval decision', async () => {
    const ports = memoryPorts();
    const service = new TransactionService(ports);
    const requested = await service.request(transactionRequest);
    const decisions = await Promise.allSettled([
      service.decide({
        approvalId: requested.approval.id,
        decision: 'APPROVED',
        reason: 'Approved by finance one.',
        context: { ...actorContext, actorId: 'actor_finance_one', role: 'APPROVER' },
      }),
      service.decide({
        approvalId: requested.approval.id,
        decision: 'REJECTED',
        reason: 'Rejected by finance two.',
        context: { ...actorContext, actorId: 'actor_finance_two', role: 'APPROVER' },
      }),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await ports.outbox.listPending(actorContext.tenantId)).toHaveLength(2);
  });

  it('rejects transaction requests from viewers', async () => {
    const service = new TransactionService(memoryPorts());
    await expect(service.request({
      ...transactionRequest,
      context: { ...actorContext, role: 'VIEWER' },
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
});
