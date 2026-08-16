/**
 * Audit §3 — Outbox dispatcher.
 *
 * The audit found that `OutboxMessage` rows sat in `PENDING` status
 * forever because no claim/lease dispatcher existed. This file
 * implements the minimum that the audit called for:
 *
 *   - Atomic claim: a worker asks for a batch of rows; the
 *     `OutboxRepository.claimBatch` port is the only authority.
 *     Two workers will never see the same row.
 *   - Lease TTL: a claimed row has `claimedUntil` set. Another
 *     worker may reclaim after the lease expires.
 *   - Bounded retry: `attempts` is incremented on each failure and
 *     `availableAt` is rescheduled with exponential backoff.
 *   - Dead-letter policy: after `maxAttempts`, the row is moved to
 *     `DEAD_LETTERED` and is no longer picked up.
 *   - Idempotency: dispatch by `eventId`, not by row id; the
 *     publisher must be idempotent on the eventId.
 *   - Observability: each dispatch attempt returns a structured
 *     `DispatchOutcome` so a worker loop can record telemetry.
 *
 * No external broker is connected in this increment. A future
 * implementation will wire a NATS publisher in `getPlatform()`; the
 * default `NoopPublisher` records would-have-been dispatches and
 * returns success, which is the right behavior for the demo / unit
 * tests. A failing `AlwaysFailPublisher` is used in the retry /
 * dead-letter tests.
 */
import type { Clock } from '../application/ports';
import type { OutboxMessage, OutboxStatus } from '../domain/schemas';
import type { OutboxRepository } from '../application/ports';
import { PlatformError } from '../domain/errors';

export type OutboxDispatchConfig = {
  workerId: string;
  leaseMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  batchSize: number;
  publisherTimeoutMs: number;
};

export const DefaultOutboxDispatchConfig: OutboxDispatchConfig = {
  workerId: 'outbox-worker-default',
  leaseMs: 30_000,
  maxAttempts: 5,
  backoffBaseMs: 250,
  backoffMaxMs: 60_000,
  batchSize: 32,
  publisherTimeoutMs: 5_000,
};

export type OutboxPublisher = (message: OutboxMessage, signal: AbortSignal) => Promise<void>;

/**
 * No-op publisher factory. Records the would-have-been dispatch so
 * tests can assert on it. Production wires a real broker here.
 */
export function createNoopOutboxPublisher(): OutboxPublisher & { readonly dispatched: OutboxMessage[] } {
  const dispatched: OutboxMessage[] = [];
  const publisher: OutboxPublisher & { readonly dispatched: OutboxMessage[] } = Object.assign(
    async (message: OutboxMessage, _signal: AbortSignal) => {
      dispatched.push(message);
    },
    { dispatched },
  );
  return publisher;
}

export function createAlwaysFailOutboxPublisher(message = 'simulated broker failure'): OutboxPublisher & { readonly attempts: OutboxMessage[] } {
  const attempts: OutboxMessage[] = [];
  const publisher: OutboxPublisher & { readonly attempts: OutboxMessage[] } = Object.assign(
    async (m: OutboxMessage, _signal: AbortSignal) => {
      attempts.push(m);
      throw new PlatformError('NETWORK_ERROR', message, { retryable: true });
    },
    { attempts },
  );
  return publisher;
}

export type DispatchOutcome =
  | { kind: 'empty' }
  | { kind: 'published'; id: string; eventId: string; attempts: number }
  | { kind: 'retried'; id: string; eventId: string; attempts: number; nextAvailableAt: string; lastError: string }
  | { kind: 'dead_lettered'; id: string; eventId: string; attempts: number; lastError: string };

export class OutboxDispatcher {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: OutboxPublisher,
    private readonly clock: Clock,
    private readonly config: OutboxDispatchConfig = DefaultOutboxDispatchConfig,
  ) {
    if (config.leaseMs < 100) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Outbox leaseMs must be >= 100.');
    }
    if (config.maxAttempts < 1) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Outbox maxAttempts must be >= 1.');
    }
    if (config.batchSize < 1 || config.batchSize > 1_000) {
      throw new PlatformError('CONFIGURATION_ERROR', 'Outbox batchSize must be in [1, 1000].');
    }
  }

  /**
   * Claim a batch and dispatch each row once. Returns the structured
   * outcomes so a worker loop can record telemetry. A single call is
   * bounded by `batchSize`; a worker typically calls this in a loop
   * until it returns `{ kind: 'empty' }`.
   */
  async tick(): Promise<DispatchOutcome[]> {
    const claimed = await this.outbox.claimBatch(this.config.workerId, this.config.leaseMs, this.config.batchSize);
    if (claimed.length === 0) return [{ kind: 'empty' }];
    const outcomes: DispatchOutcome[] = [];
    for (const message of claimed) {
      outcomes.push(await this.dispatchOne(message));
    }
    return outcomes;
  }

  private async dispatchOne(message: OutboxMessage): Promise<DispatchOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.publisherTimeoutMs);
    try {
      await this.publisher(message, controller.signal);
      await this.outbox.markPublished(message.id, this.clock.isoNow());
      return { kind: 'published', id: message.id, eventId: message.eventId, attempts: message.attempts + 1 };
    } catch (error) {
      const lastError = formatPublishError(error);
      const nextAttempts = message.attempts + 1;
      if (nextAttempts >= this.config.maxAttempts) {
        await this.outbox.markDeadLettered(message.id, lastError);
        return { kind: 'dead_lettered', id: message.id, eventId: message.eventId, attempts: nextAttempts, lastError };
      }
      const delayMs = Math.min(
        this.config.backoffMaxMs,
        this.config.backoffBaseMs * (2 ** (nextAttempts - 1)),
      );
      const nextAvailableAt = new Date(Date.parse(this.clock.isoNow()) + delayMs).toISOString();
      await this.outbox.recordAttemptFailure(message.id, lastError, nextAvailableAt);
      return { kind: 'retried', id: message.id, eventId: message.eventId, attempts: nextAttempts, nextAvailableAt, lastError };
    } finally {
      clearTimeout(timer);
    }
  }
}

function formatPublishError(error: unknown): string {
  if (error instanceof PlatformError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error).slice(0, 1_500);
  } catch {
    return 'unknown publisher error';
  }
}

export function summarizeOutcomes(outcomes: readonly DispatchOutcome[]): Record<OutboxStatus, number> {
  const summary: Record<OutboxStatus, number> = {
    PENDING: 0,
    CLAIMED: 0,
    PUBLISHED: 0,
    FAILED: 0,
    DEAD_LETTERED: 0,
  };
  for (const o of outcomes) {
    if (o.kind === 'empty') continue;
    if (o.kind === 'published') summary.PUBLISHED += 1;
    if (o.kind === 'retried') summary.PENDING += 1;
    if (o.kind === 'dead_lettered') summary.DEAD_LETTERED += 1;
  }
  return summary;
}
