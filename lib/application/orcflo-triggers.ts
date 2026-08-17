import { createHash, randomUUID } from 'node:crypto';
import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import { stableStringify } from '../domain/stable-json';
import { isDueCron, parseCronExpression, parseTimezoneOffsetMinutes } from '../domain/cron';
import {
  EventTriggerConfigSchema,
  OrcfloTriggerSchema,
  ScheduleTriggerConfigSchema,
  WebhookTriggerConfigSchema,
  type OrcfloRun,
  type OrcfloTrigger,
  type OrcfloTriggerKind,
} from '../domain/orcflo';
import { roleAllows, type ActorContext } from '../domain/policy';
import type { Clock, OrcfloRuntimePorts } from './ports';
import type { OrcfloEngine } from './orcflo-engine';
import type { z } from 'zod';

const wallClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

export type TriggerCreateInput = {
  workflowId: string;
  name: string;
  kind: OrcfloTriggerKind;
  config: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

/**
 * OrcfloTriggerService — the four trigger kinds.
 *
 *   - `manual`  — fired by an operator through the fire endpoint.
 *   - `schedule`— deterministic 5-field cron; the drain endpoint
 *     materializes runs for due minute buckets (each bucket fires at
 *     most once via `lastFiredAt`). A durable background worker is
 *     future work; this service is the deterministic authority the
 *     demo and ops can drive.
 *   - `webhook` — a tenant-unique secret key; firing through the
 *     webhook path is the only way to materialize a run (the key is
 *     the proof of possession in the demo runtime).
 *   - `event`   — fires when an explicit event-type fire request
 *     matches; automatic event-bus wiring is future work.
 *
 * Every fire path funnels through `OrcfloEngine.startRun`, so all run
 * guarantees (READY-only, policy, evidence, metering, stream) apply.
 */
export class OrcfloTriggerService {
  constructor(
    private readonly ports: OrcfloRuntimePorts,
    private readonly engine: OrcfloEngine,
    private readonly clock: Clock = wallClock,
  ) {}

  async create(context: ActorContext, input: TriggerCreateInput): Promise<OrcfloTrigger> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot create triggers.`);
    }
    const workflow = await this.ports.workflows.findById(context.tenantId, input.workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${input.workflowId} was not found.`);

    const config = await this.normalizeConfig(context, input.kind, input.config);
    const now = new Date().toISOString();
    const trigger = OrcfloTriggerSchema.parse({
      id: createId('trig'),
      tenantId: context.tenantId,
      workflowId: input.workflowId,
      name: input.name,
      kind: input.kind,
      config,
      enabled: input.enabled ?? true,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
    await this.ports.triggers.save(trigger);
    return trigger;
  }

  async list(context: ActorContext, options: { kind?: OrcfloTrigger['kind']; enabledOnly?: boolean } = {}): Promise<OrcfloTrigger[]> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read triggers.`);
    }
    return this.ports.triggers.list(context.tenantId, options);
  }

  async findById(context: ActorContext, triggerId: string): Promise<OrcfloTrigger | null> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read triggers.`);
    }
    return this.ports.triggers.findById(context.tenantId, triggerId);
  }

  /** Fire a `manual` trigger by id. */
  async fireManual(
    context: ActorContext,
    triggerId: string,
    input?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<OrcfloRun> {
    this.assertFireRole(context);
    const trigger = await this.requireEnabled(context, triggerId);
    if (trigger.kind !== 'manual') {
      throw new PlatformError('CONFLICT', `Trigger ${triggerId} is a ${trigger.kind} trigger; use the matching fire path.`);
    }
    return this.fire(trigger, input, context, undefined, idempotencyKey);
  }

  /**
   * Fire a `webhook` trigger by its secret key (§48 idempotency).
   *
   * A caller-supplied key (header `Idempotency-Key` or body
   * `idempotencyKey`) wins; otherwise a key is derived from
   * (trigger, payload), so a duplicate delivery with an identical body
   * replays the same run instead of creating duplicate side effects,
   * while a genuinely different payload still creates a new run.
   */
  async fireWebhook(
    context: ActorContext,
    key: string,
    input?: Record<string, unknown>,
    options: { idempotencyKey?: string } = {},
  ): Promise<OrcfloRun> {
    this.assertFireRole(context);
    const candidates = await this.ports.triggers.list(context.tenantId, { kind: 'webhook', enabledOnly: true });
    const trigger = candidates.find((candidate) => candidate.kind === 'webhook' && candidate.config.key === key);
    if (!trigger) {
      // Deliberately NOT_FOUND, not 403: the key is a proof of possession
      // and a wrong key must not leak whether a trigger exists.
      throw new PlatformError('NOT_FOUND', 'No webhook trigger matches the provided key.');
    }
    const idempotencyKey = options.idempotencyKey && options.idempotencyKey !== ''
      ? options.idempotencyKey
      : this.derivedKey('whk', trigger.id, input ?? {});
    return this.fire(trigger, input, context, undefined, idempotencyKey);
  }

  /** Materialize runs for every schedule trigger due at `nowIso` (default: wall clock). */
  async drainSchedules(context: ActorContext, nowIso?: string, limit = 10): Promise<OrcfloRun[]> {
    this.assertFireRole(context);
    const now = nowIso ?? new Date().toISOString();
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
    const triggers = await this.ports.triggers.list(context.tenantId, { kind: 'schedule', enabledOnly: true });
    const runs: OrcfloRun[] = [];
    for (const trigger of triggers) {
      if (runs.length >= safeLimit) break;
      const config = ScheduleTriggerConfigSchema.parse(trigger.config);
      if (!isDueCron(config.cron, now, trigger.lastFiredAt, config.timezone)) continue;
      runs.push(await this.fire(trigger, { scheduledAt: now }, context, now));
    }
    return runs;
  }

  /**
   * §32/§25 durable scheduling — cross-tenant drain for the schedule
   * worker. Iterates every enabled schedule trigger in the platform and
   * fires each due minute bucket with a system worker context; the same
   * at-most-once-per-bucket guarantee applies via lastFiredAt.
   */
  async drainSchedulesGlobal(nowIso = this.clock.isoNow(), limit = 50): Promise<OrcfloRun[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
    const triggers = await this.ports.triggers.listAll({ kind: 'schedule', enabledOnly: true });
    const runs: OrcfloRun[] = [];
    for (const trigger of triggers) {
      if (runs.length >= safeLimit) break;
      const config = ScheduleTriggerConfigSchema.parse(trigger.config);
      if (!isDueCron(config.cron, nowIso, trigger.lastFiredAt, config.timezone)) continue;
      const context: ActorContext = {
        tenantId: trigger.tenantId,
        actorId: 'actor_scheduler',
        role: 'OPERATOR',
        correlationId: createId('corr'),
        environment: 'demo',
      };
      runs.push(await this.fire(trigger, { scheduledAt: nowIso }, context, nowIso));
    }
    return runs;
  }

  /**
   * Materialize runs for every enabled `event` trigger matching
   * `eventType` (§48 idempotency). A caller-supplied key wins; otherwise
   * each run derives a key from (trigger, eventType, payload) so a
   * duplicate event fire replays instead of duplicating.
   */
  async fireEventTrigger(
    context: ActorContext,
    eventType: string,
    input?: Record<string, unknown>,
    options: { idempotencyKey?: string } = {},
  ): Promise<OrcfloRun[]> {
    this.assertFireRole(context);
    const triggers = await this.ports.triggers.list(context.tenantId, { kind: 'event', enabledOnly: true });
    const runs: OrcfloRun[] = [];
    for (const trigger of triggers) {
      const config = EventTriggerConfigSchema.parse(trigger.config);
      if (config.eventType !== eventType) continue;
      const idempotencyKey = options.idempotencyKey && options.idempotencyKey !== ''
        ? options.idempotencyKey
        : this.derivedKey('evt', trigger.id, { ...(input ?? {}), eventType });
      runs.push(await this.fire(trigger, input ?? { eventType }, context, undefined, idempotencyKey));
    }
    return runs;
  }

  private async normalizeConfig(
    context: ActorContext,
    kind: OrcfloTrigger['kind'],
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (kind) {
      case 'manual':
        return {};
      case 'schedule': {
        const parsed = this.parseConfig(ScheduleTriggerConfigSchema, config, 'schedule');
        parseCronExpression(parsed.cron); // throws VALIDATION_ERROR on malformed cron
        parseTimezoneOffsetMinutes(parsed.timezone); // throws on unsupported timezone
        return parsed;
      }
      case 'webhook': {
        const rawKey = config.key === undefined || config.key === ''
          ? `whk_${randomUUID().replaceAll('-', '')}`
          : String(config.key);
        const parsed = this.parseConfig(WebhookTriggerConfigSchema, { key: rawKey }, 'webhook');
        const existing = await this.ports.triggers.list(context.tenantId, { kind: 'webhook' });
        if (existing.some((trigger) => trigger.kind === 'webhook' && trigger.config.key === parsed.key)) {
          throw new PlatformError('CONFLICT', 'Webhook trigger key is already in use for this tenant.');
        }
        return parsed;
      }
      case 'event':
        return this.parseConfig(EventTriggerConfigSchema, config, 'event');
      default:
        throw new PlatformError('VALIDATION_ERROR', `Unsupported trigger kind: ${String(kind)}.`);
    }
  }

  /** Parse a per-kind config, converting Zod failures into the platform error envelope. */
  private parseConfig<T extends z.ZodTypeAny>(schema: T, config: Record<string, unknown>, kind: string): z.infer<T> {
    const result = schema.safeParse(config);
    if (!result.success) {
      throw new PlatformError(
        'VALIDATION_ERROR',
        `Invalid ${kind} trigger configuration: ${result.error.issues.map((issue) => issue.message).join('; ')}.`,
      );
    }
    return result.data;
  }

  private async requireEnabled(context: ActorContext, triggerId: string): Promise<OrcfloTrigger> {
    const trigger = await this.ports.triggers.findById(context.tenantId, triggerId);
    if (!trigger) throw new PlatformError('NOT_FOUND', `Trigger ${triggerId} was not found.`);
    if (!trigger.enabled) {
      throw new PlatformError('CONFLICT', `Trigger ${triggerId} is disabled.`);
    }
    return trigger;
  }

  private assertFireRole(context: ActorContext): void {
    if (!roleAllows(context.role, 'workflow:execute')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot fire workflow triggers.`);
    }
  }

  private async fire(
    trigger: OrcfloTrigger,
    input: Record<string, unknown> | undefined,
    context: ActorContext,
    firedAtIso = this.clock.isoNow(),
    idempotencyKey?: string,
  ): Promise<OrcfloRun> {
    const run = await this.engine.startRun({
      workflowId: trigger.workflowId,
      input,
      context,
      triggerId: trigger.id,
      triggerKind: trigger.kind,
      idempotencyKey,
    });
    const updated = OrcfloTriggerSchema.parse({ ...trigger, lastFiredAt: firedAtIso, updatedAt: firedAtIso });
    await this.ports.triggers.save(updated);
    return run;
  }

  /** §48 — deterministic derived key for duplicate-delivery dedupe. */
  private derivedKey(prefix: 'whk' | 'evt', triggerId: string, payload: unknown): string {
    const digest = createHash('sha256')
      .update(`${triggerId}\n${stableStringify(payload ?? {})}`)
      .digest('hex')
      .slice(0, 40);
    return `${prefix}_${digest}`;
  }
}
