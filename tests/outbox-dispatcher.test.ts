/**
 * Audit §3 — Outbox dispatcher tests.
 *
 * Pins the four guarantees the audit called out:
 *   1. Atomic claim — one row is given to one worker.
 *   2. Lease TTL — an expired lease can be reclaimed.
 *   3. Bounded retry — exponential backoff up to max attempts.
 *   4. Dead-letter — after max attempts, the row is DEAD_LETTERED.
 *
 * The in-memory adapter is the system under test; the Prisma adapter
 * is exercised by `tests/postgres-integration.test.ts` once the
 * regenerated client is available.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  InMemoryOutboxRepository,
  InMemoryPlatformStore,
  SystemClock,
  FixedClock,
} from '../lib/infrastructure/memory-adapters';
import {
  DefaultOutboxDispatchConfig,
  OutboxDispatcher,
  createAlwaysFailOutboxPublisher,
  createNoopOutboxPublisher,
  summarizeOutcomes,
} from '../lib/application/outbox-dispatcher';
import { createOutboxMessage, createId } from '../lib/domain/events';
import {
  DomainEventSchema,
  type DomainEvent,
  type OutboxMessage,
} from '../lib/domain/schemas';

function seedEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return DomainEventSchema.parse({
    id: 'evt_1',
    eventType: 'agent.command.proposed',
    schemaVersion: 1,
    occurredAt: '2026-08-16T12:00:00.000Z',
    actorId: 'actor_ada',
    tenantId: 'tenant_demo',
    correlationId: 'corr_1',
    aggregateType: 'agent_command',
    aggregateId: 'cmd_1',
    payload: {},
    metadata: {},
    ...overrides,
  });
}

async function writeOutbox(store: InMemoryPlatformStore, outbox: InMemoryOutboxRepository, ...events: DomainEvent[]): Promise<OutboxMessage[]> {
  const messages: OutboxMessage[] = [];
  for (const event of events) {
    const m = createOutboxMessage(event);
    await outbox.save(m);
    messages.push(m);
  }
  return messages;
}

describe('OutboxDispatcher — happy path', () => {
  it('claims a pending row, dispatches it, and marks it PUBLISHED', async () => {
    const store = new InMemoryPlatformStore();
    const outbox = new InMemoryOutboxRepository(store);
    const clock = new SystemClock();
    const publisher = createNoopOutboxPublisher();
    const dispatcher = new OutboxDispatcher(outbox, publisher, clock, {
      ...DefaultOutboxDispatchConfig,
      workerId: 'w1',
    });
    await writeOutbox(store, outbox, seedEvent());
    const outcomes = await dispatcher.tick();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe('published');
    const persisted = await outbox.findById('tenant_demo', (outcomes[0] as { id: string }).id);
    expect(persisted?.status).toBe('PUBLISHED');
    expect(persisted?.publishedAt).toBeDefined();
    expect(persisted?.claimedBy).toBeUndefined();
    expect(publisher.dispatched).toHaveLength(1);
  });

  it('returns an empty outcome when there is nothing to dispatch', async () => {
    const store = new InMemoryPlatformStore();
    const outbox = new InMemoryOutboxRepository(store);
    const dispatcher = new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
    });
    const outcomes = await dispatcher.tick();
    expect(outcomes).toEqual([{ kind: 'empty' }]);
  });
});

describe('OutboxDispatcher — claim is exclusive', () => {
  it('two workers never see the same row in one tick', async () => {
    const store = new InMemoryPlatformStore();
    const outbox = new InMemoryOutboxRepository(store);
    await writeOutbox(store, outbox, seedEvent({ id: 'evt_a' }));
    const dispatcherA = new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      workerId: 'A',
    });
    const dispatcherB = new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      workerId: 'B',
    });
    const [outA, outB] = await Promise.all([dispatcherA.tick(), dispatcherB.tick()]);
    const claimedA = outA.filter((o) => o.kind === 'published').length;
    const claimedB = outB.filter((o) => o.kind === 'published').length;
    expect(claimedA + claimedB).toBe(1);
  });
});

describe('OutboxDispatcher — lease expiry', () => {
  it('reclaims a row whose lease expired and dispatches it again', async () => {
    const store = new InMemoryPlatformStore();
    const outbox = new InMemoryOutboxRepository(store);
    await writeOutbox(store, outbox, seedEvent());
    // Worker A claims with a 100ms lease (smallest allowed).
    const claimedA = await outbox.claimBatch('A', 100, 1);
    expect(claimedA).toHaveLength(1);
    expect(claimedA[0].claimedBy).toBe('A');
    // Before the lease expires, no other worker can claim it.
    const claimedBeforeExpiry = await outbox.claimBatch('B', 500, 1);
    expect(claimedBeforeExpiry).toHaveLength(0);
    // Wait past the lease and worker B can reclaim.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const claimedAfterExpiry = await outbox.claimBatch('B', 500, 1);
    expect(claimedAfterExpiry).toHaveLength(1);
    expect(claimedAfterExpiry[0].claimedBy).toBe('B');
  });
});

describe('OutboxDispatcher — bounded retry and dead-letter', () => {
  it('retries a failing publisher with exponential backoff and dead-letters after max attempts', async () => {
    const store = new InMemoryPlatformStore();
    const outbox = new InMemoryOutboxRepository(store);
    const clock = new FixedClock('2026-08-16T12:00:00.000Z');
    const publisher = createAlwaysFailOutboxPublisher();
    const dispatcher = new OutboxDispatcher(outbox, publisher, clock, {
      ...DefaultOutboxDispatchConfig,
      workerId: 'w1',
      maxAttempts: 3,
      backoffBaseMs: 10,
      backoffMaxMs: 100,
      publisherTimeoutMs: 1_000,
    });
    await writeOutbox(store, outbox, seedEvent());

    // Tick 1: attempt 1 fails -> reschedule.
    clock.advance(0);
    const first = await dispatcher.tick();
    expect(first[0].kind).toBe('retried');
    const after1 = await outbox.listPending('tenant_demo');
    expect(after1).toHaveLength(1);
    expect(after1[0].attempts).toBe(1);

    // Move the clock past the reschedule.
    clock.advance(20);
    const second = await dispatcher.tick();
    expect(second[0].kind).toBe('retried');
    const after2 = await outbox.listPending('tenant_demo');
    expect(after2[0].attempts).toBe(2);

    clock.advance(40);
    const third = await dispatcher.tick();
    // 3rd attempt is the last attempt; the dispatcher dead-letters.
    expect(third[0].kind).toBe('dead_lettered');
    const after3 = await outbox.listPending('tenant_demo');
    expect(after3).toHaveLength(0);
    expect(publisher.attempts).toHaveLength(3);
    expect(summarizeOutcomes(third)).toMatchObject({ DEAD_LETTERED: 1, PENDING: 0 });
  });
});

describe('OutboxDispatcher — config validation', () => {
  it('refuses a leaseMs < 100', () => {
    const outbox = new InMemoryOutboxRepository(new InMemoryPlatformStore());
    expect(() => new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      leaseMs: 50,
    })).toThrow(/leaseMs/);
  });

  it('refuses maxAttempts < 1', () => {
    const outbox = new InMemoryOutboxRepository(new InMemoryPlatformStore());
    expect(() => new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      maxAttempts: 0,
    })).toThrow(/maxAttempts/);
  });

  it('refuses batchSize out of range', () => {
    const outbox = new InMemoryOutboxRepository(new InMemoryPlatformStore());
    expect(() => new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      batchSize: 0,
    })).toThrow(/batchSize/);
    expect(() => new OutboxDispatcher(outbox, createNoopOutboxPublisher(), new SystemClock(), {
      ...DefaultOutboxDispatchConfig,
      batchSize: 10_000,
    })).toThrow(/batchSize/);
  });
});

describe('createId (used by createOutboxMessage) is still deterministic-shape', () => {
  it('keeps working for the outbox happy path', () => {
    const id = createId('outbox');
    expect(id.startsWith('outbox_')).toBe(true);
  });
});
