import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import { stableStringify } from '../domain/stable-json';
import {
  OrcfloTriggerSchema,
  PublicTriggerConfigSchema,
  type OrcfloRun,
  type OrcfloTrigger,
  type PublicTriggerConfig,
} from '../domain/orcflo';
import { roleAllows, type ActorContext } from '../domain/policy';
import type { Clock, OrcfloRuntimePorts } from './ports';
import type { OrcfloEngine } from './orcflo-engine';

/**
 * §34 — Public workflow interfaces (public forms).
 *
 * A workflow can be exposed to anonymous callers through a `public`
 * trigger: the caller proves nothing except the public `slug`, and the
 * platform applies abuse controls before any run starts:
 *
 *   - input validation against `config.inputSchema` (deterministic Zod);
 *   - per-interface rate limiting (`rateLimitPerMinute`) and a daily run
 *     cap (`maxRunsPerDay`), enforced in-process (ephemeral; a shared
 *     limiter replaces this in multi-process production);
 *   - cost/duration bounds (`maxCostMinor`, `maxDurationMs`);
 *   - idempotency (explicit key or derived from trigger + payload, §48),
 *     so a double-submitted form does not double-run;
 *   - a synthetic `PUBLIC` actor context (execute-only, never a
 *     membership role) — node/agent/tool policies still apply, so a
 *     public interface cannot bypass a tenant's policy gates.
 */
export class OrcfloPublicInterfaceService {
  private readonly rateState = new Map<string, { minuteStart: number; minuteCount: number; dayStart: number; dayCount: number }>();

  constructor(
    private readonly ports: OrcfloRuntimePorts,
    private readonly engine: OrcfloEngine,
    private readonly clock: Clock,
  ) {}

  /** Create a public interface for a READY workflow (auth'd, workflow:write). */
  async create(
    context: ActorContext,
    input: {
      workflowId: string;
      name: string;
      config?: Partial<PublicTriggerConfig>;
      enabled?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<OrcfloTrigger> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot create public interfaces.`);
    }
    const workflow = await this.ports.workflows.findById(context.tenantId, input.workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${input.workflowId} was not found.`);

    const rawConfig: Record<string, unknown> = {
      ...(input.config ?? {}),
      // Generate the public slug here so uniqueness is enforced at create.
      slug: input.config?.slug ?? `pub_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    };
    const config = this.parseConfig(rawConfig);
    if (!config.slug) {
      throw new PlatformError('VALIDATION_ERROR', 'A public slug is required.');
    }
    const existing = await this.ports.triggers.findPublicBySlug(config.slug);
    if (existing) {
      throw new PlatformError('CONFLICT', `Public slug ${config.slug} is already in use.`);
    }
    const now = this.clock.isoNow();
    const trigger = OrcfloTriggerSchema.parse({
      id: createId('trig'),
      tenantId: context.tenantId,
      workflowId: input.workflowId,
      name: input.name,
      kind: 'public',
      config,
      enabled: input.enabled ?? true,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
    await this.ports.triggers.save(trigger);
    return trigger;
  }

  async list(context: ActorContext): Promise<OrcfloTrigger[]> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read public interfaces.`);
    }
    return (await this.ports.triggers.list(context.tenantId, { kind: 'public' }))
      .filter((trigger): trigger is OrcfloTrigger & { kind: 'public' } => trigger.kind === 'public');
  }

  /**
   * Invoke a public interface (anonymous). Flow: lookup by slug →
   * enabled check → abuse limits → input validation → idempotency →
   * workflow run (§34 PUBLIC FORM → INPUT VALIDATION → WORKFLOW RUN →
   * OUTPUT).
   */
  async runPublic(
    slug: string,
    body: { input?: Record<string, unknown>; idempotencyKey?: string },
  ): Promise<OrcfloRun> {
    const trigger = await this.ports.triggers.findPublicBySlug(slug);
    if (!trigger || trigger.kind !== 'public' || !trigger.enabled) {
      // Deliberately NOT_FOUND: a disabled interface must not leak its
      // existence.
      throw new PlatformError('NOT_FOUND', 'No public interface matches this slug.');
    }
    const config = PublicTriggerConfigSchema.parse(trigger.config);
    const input = body.input ?? {};
    const now = this.clock.now();

    // 1. Input validation (§34 input validation) — deterministic Zod,
    //    cheap, and checked BEFORE any rate-limit token is consumed so
    //    a malformed submission returns 422 rather than being masked by
    //    a near-cap limiter.
    const parsedInput = this.validateInput(config.inputSchema, input);

    // 2. Abuse limits (§34 rate limiting / run limits / abuse prevention).
    //    Only valid submissions consume tokens; validation already
    //    bounds malformed traffic without starting runs.
    this.enforceLimits(trigger, config, now);

    // 3. Idempotency (§48) — explicit key wins; otherwise derived from
    //    (trigger, payload) so a double-submitted form replays.
    const idempotencyKey = body.idempotencyKey && body.idempotencyKey !== ''
      ? body.idempotencyKey
      : `pubidem_${createHash('sha256').update(`${trigger.id}\n${stableStringify(parsedInput)}`).digest('hex').slice(0, 40)}`;

    // 4. Synthetic anonymous caller context — execute-only, never a
    //    membership role; tenant and environment come from the interface.
    const context: ActorContext = {
      tenantId: trigger.tenantId,
      actorId: `actor_public:${trigger.id}`,
      role: 'PUBLIC',
      correlationId: createId('corr'),
      environment: config.environment,
    };

    const run = await this.engine.startRun({
      workflowId: trigger.workflowId,
      input: parsedInput,
      context,
      triggerId: trigger.id,
      triggerKind: 'public',
      idempotencyKey,
      maxDurationMs: config.maxDurationMs,
      maxCostMinor: config.maxCostMinor,
    });

    // Stamp lastFiredAt like every other fire path.
    const firedAt = this.clock.isoNow();
    await this.ports.triggers.save(OrcfloTriggerSchema.parse({ ...trigger, lastFiredAt: firedAt, updatedAt: firedAt }));
    return run;
  }

  private enforceLimits(trigger: OrcfloTrigger, config: PublicTriggerConfig, now: number): void {
    const key = `${trigger.tenantId}:${trigger.id}`;
    const state = this.rateState.get(key) ?? { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
    if (now - state.minuteStart >= 60_000) {
      state.minuteStart = now;
      state.minuteCount = 0;
    }
    if (now - state.dayStart >= 86_400_000) {
      state.dayStart = now;
      state.dayCount = 0;
    }
    if (state.minuteCount >= config.rateLimitPerMinute) {
      throw new PlatformError(
        'RATE_LIMITED',
        `Public interface ${trigger.id} exceeded its per-minute run limit (${config.rateLimitPerMinute}).`,
      );
    }
    if (state.dayCount >= config.maxRunsPerDay) {
      throw new PlatformError(
        'RATE_LIMITED',
        `Public interface ${trigger.id} exceeded its daily run limit (${config.maxRunsPerDay}).`,
      );
    }
    state.minuteCount += 1;
    state.dayCount += 1;
    this.rateState.set(key, state);
  }

  private parseConfig(config: Record<string, unknown>): PublicTriggerConfig {
    const result = PublicTriggerConfigSchema.safeParse(config);
    if (!result.success) {
      throw new PlatformError(
        'VALIDATION_ERROR',
        `Invalid public interface configuration: ${result.error.issues.map((issue) => issue.message).join('; ')}.`,
      );
    }
    return result.data;
  }

  private validateInput(
    spec: Record<string, { type: 'string' | 'number' | 'boolean' | 'json'; required?: boolean; default?: unknown }>,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, field] of Object.entries(spec)) {
      let fieldType: z.ZodTypeAny;
      switch (field.type) {
        case 'string':
          fieldType = z.string();
          break;
        case 'number':
          fieldType = z.number();
          break;
        case 'boolean':
          fieldType = z.boolean();
          break;
        case 'json':
          fieldType = z.unknown();
          break;
      }
      if (field.default !== undefined) fieldType = fieldType.default(field.default);
      else if (!field.required) fieldType = fieldType.optional();
      shape[key] = fieldType;
    }
    const schema = z.object(shape).strict();
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new PlatformError(
        'VALIDATION_ERROR',
        `Public interface input validation failed: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}.`,
      );
    }
    return result.data;
  }
}
