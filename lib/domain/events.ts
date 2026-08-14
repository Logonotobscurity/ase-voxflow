import {
  DomainEventSchema,
  OutboxMessageSchema,
  type DomainEvent,
  type OutboxMessage,
} from './schemas';

export type EventContext = {
  tenantId: string;
  actorId?: string;
  correlationId: string;
  causationId?: string;
};

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createDomainEvent(
  eventType: string,
  aggregate: { type: string; id: string },
  payload: Record<string, unknown>,
  context: EventContext,
): DomainEvent {
  return DomainEventSchema.parse({
    id: createId('evt'),
    eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    actorId: context.actorId,
    tenantId: context.tenantId,
    correlationId: context.correlationId,
    causationId: context.causationId,
    aggregateType: aggregate.type,
    aggregateId: aggregate.id,
    payload,
    metadata: {},
  });
}

export function createOutboxMessage(event: DomainEvent): OutboxMessage {
  const now = new Date().toISOString();
  return OutboxMessageSchema.parse({
    id: createId('outbox'),
    tenantId: event.tenantId,
    eventId: event.id,
    topic: event.eventType,
    payload: event,
    status: 'PENDING',
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  });
}
