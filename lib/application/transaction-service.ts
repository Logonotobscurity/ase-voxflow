import type { PersistencePorts, PlatformPorts } from './ports';
import { PlatformError } from '../domain/errors';
import { createDomainEvent, createId } from '../domain/events';
import { roleAllows, type ActorContext } from '../domain/policy';
import {
  HumanApprovalSchema,
  TransactionSchema,
  type HumanApproval,
  type Transaction,
} from '../domain/schemas';

export class TransactionService {
  constructor(private readonly ports: PlatformPorts) {}

  async request(request: {
    type: string;
    amountMinor: number;
    currency: string;
    recipient: string;
    idempotencyKey: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
    context: ActorContext;
  }): Promise<{ transaction: Transaction; approval: HumanApproval }> {
    if (!roleAllows(request.context.role, 'transaction:authorize') && !roleAllows(request.context.role, 'tool:invoke')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${request.context.role} cannot request transactions.`);
    }

    return this.ports.unitOfWork.run(async (ports) => {
      const existing = await ports.transactions.findByIdempotencyKey(
        request.context.tenantId,
        request.idempotencyKey,
      );
      if (existing) {
        const approval = await ports.approvals.findForResource(
          request.context.tenantId,
          'transaction',
          existing.id,
        );
        if (!approval) throw new PlatformError('CONFLICT', 'Existing transaction has no approval record.');
        return { transaction: existing, approval };
      }

      const now = new Date().toISOString();
      const transaction = TransactionSchema.parse({
        id: createId('txn'),
        tenantId: request.context.tenantId,
        agentId: request.agentId,
        type: request.type,
        amountMinor: request.amountMinor,
        currency: request.currency.toUpperCase(),
        recipient: request.recipient,
        status: 'CREATED',
        idempotencyKey: request.idempotencyKey,
        metadata: request.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      });
      const approval = HumanApprovalSchema.parse({
        id: createId('approval'),
        tenantId: request.context.tenantId,
        resourceType: 'transaction',
        resourceId: transaction.id,
        status: 'REQUESTED',
        requestedBy: request.context.actorId,
        metadata: {
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          recipient: transaction.recipient,
        },
        requestedAt: now,
      });
      await ports.transactions.save(transaction);
      await ports.approvals.save(approval);
      await this.emit(ports, 'transaction.approval_requested', transaction, {
        approvalId: approval.id,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
      }, request.context);
      return { transaction, approval };
    });
  }

  async decide(request: {
    approvalId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason: string;
    context: ActorContext;
  }): Promise<{ transaction: Transaction; approval: HumanApproval }> {
    if (!roleAllows(request.context.role, 'approval:decide')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${request.context.role} cannot decide approvals.`);
    }

    return this.ports.unitOfWork.run(async (ports) => {
      const approval = await ports.approvals.findById(request.context.tenantId, request.approvalId);
      if (!approval) throw new PlatformError('NOT_FOUND', `Approval ${request.approvalId} was not found.`);
      if (approval.status !== 'REQUESTED') {
        throw new PlatformError('CONFLICT', `Approval has already reached ${approval.status}.`);
      }
      if (approval.requestedBy === request.context.actorId) {
        throw new PlatformError('AUTHORIZATION_DENIED', 'Requesters cannot approve their own transactions.');
      }
      const transaction = await ports.transactions.findById(request.context.tenantId, approval.resourceId);
      if (!transaction || approval.resourceType !== 'transaction') {
        throw new PlatformError('NOT_FOUND', 'The transaction for this approval was not found.');
      }

      const now = new Date().toISOString();
      const updatedApproval = HumanApprovalSchema.parse({
        ...approval,
        status: request.decision,
        decidedBy: request.context.actorId,
        reason: request.reason,
        decidedAt: now,
      });
      const updatedTransaction = TransactionSchema.parse({
        ...transaction,
        status: request.decision === 'APPROVED' ? 'AUTHORIZED' : 'CANCELLED',
        authorization: request.decision === 'APPROVED' ? {
          approvalId: approval.id,
          approvedBy: request.context.actorId,
          approvedAt: now,
        } : undefined,
        updatedAt: now,
      });
      await ports.approvals.save(updatedApproval);
      await ports.transactions.save(updatedTransaction);
      await this.emit(
        ports,
        request.decision === 'APPROVED' ? 'transaction.authorized' : 'transaction.rejected',
        updatedTransaction,
        { approvalId: approval.id, reason: request.reason },
        request.context,
      );
      return { transaction: updatedTransaction, approval: updatedApproval };
    });
  }

  private async emit(
    ports: PersistencePorts,
    eventType: string,
    transaction: Transaction,
    payload: Record<string, unknown>,
    context: ActorContext,
  ) {
    await ports.events.publish(createDomainEvent(
      eventType,
      { type: 'transaction', id: transaction.id },
      payload,
      context,
    ));
  }
}
