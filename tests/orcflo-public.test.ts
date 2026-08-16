import { describe, expect, it } from 'vitest';
import { OrcfloPublicInterfaceService } from '../lib/application/orcflo-public';
import { roleAllows } from '../lib/domain/policy';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
} from './orcflo-helpers';

function publicHarness(fixedNowIso = '2026-08-14T10:00:00.000Z') {
  const harness = buildOrcfloHarness(fixedNowIso);
  const service = new OrcfloPublicInterfaceService(harness.ports, harness.engine, harness.clock);
  return { ...harness, service };
}

describe('PUBLIC role (§34)', () => {
  it('can execute workflows but nothing else', () => {
    expect(roleAllows('PUBLIC', 'workflow:execute')).toBe(true);
    expect(roleAllows('PUBLIC', 'workflow:read')).toBe(false);
    expect(roleAllows('PUBLIC', 'workflow:write')).toBe(false);
    expect(roleAllows('PUBLIC', 'tool:invoke')).toBe(false);
  });
});

describe('Public interfaces (§34) — creation', () => {
  it('creates a public interface with a generated slug for a READY workflow', async () => {
    const harness = publicHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const created = await harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Vendor intake',
      config: { inputSchema: { name: { type: 'string' } }, rateLimitPerMinute: 5 },
    });
    expect(created.kind).toBe('public');
    expect(created.config.slug).toMatch(/^pub_[a-z0-9-]{8,}$/);
    expect(created.config.rateLimitPerMinute).toBe(5);
    expect(created.config.maxRunsPerDay).toBe(100);
    expect(created.config.inputSchema).toMatchObject({ name: { type: 'string', required: true } });
  });

  it('honors an explicit slug and rejects duplicates across the platform', async () => {
    const harness = publicHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'First',
      config: { slug: 'pub_myform_0001' },
    });
    await expect(harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Second',
      config: { slug: 'pub_myform_0001' },
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires workflow:write and an existing workflow', async () => {
    const harness = publicHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await expect(harness.service.create({ ...orcfloActorContext, role: 'VIEWER' }, {
      workflowId: 'workflow_orcflo',
      name: 'Nope',
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await expect(harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_missing',
      name: 'Orphan',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('Public interfaces (§34) — anonymous invocation', () => {
  async function seedInterface(harness: ReturnType<typeof publicHarness>, config: Record<string, unknown> = {}) {
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    return harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Intake',
      config,
    });
  }

  it('runs the workflow anonymously and stamps lastFiredAt', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, { inputSchema: { name: { type: 'string' } } });
    const slug = created.config.slug!;

    const run = await harness.service.runPublic(slug, { input: { name: 'Ada' } });
    expect(run.status).toBe('COMPLETED');
    expect(run.triggerKind).toBe('public');
    expect(run.input).toMatchObject({ name: 'Ada' });
    expect(run.correlationId).toBeTruthy();

    const stored = await harness.ports.triggers.findById(orcfloActorContext.tenantId, created.id);
    expect(stored?.lastFiredAt).toBeTruthy();
  });

  it('validates input against the declared schema (deterministic)', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, {
      inputSchema: { name: { type: 'string', required: true }, age: { type: 'number', required: false } },
    });
    const slug = created.config.slug!;

    await expect(harness.service.runPublic(slug, { input: { age: 'not-a-number' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // Missing required field.
    await expect(harness.service.runPublic(slug, { input: {} }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // Unknown fields rejected (strict schema).
    await expect(harness.service.runPublic(slug, { input: { name: 'Ada', hacker: true } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // Optional field present and valid.
    const ok = await harness.service.runPublic(slug, { input: { name: 'Ada', age: 30 } });
    expect(ok.status).toBe('COMPLETED');
  });

  it('applies defaults from the input schema', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, {
      inputSchema: { region: { type: 'string', required: false, default: 'west' } },
    });
    const run = await harness.service.runPublic(created.config.slug!, { input: {} });
    expect(run.input).toMatchObject({ region: 'west' });
  });

  it('returns NOT_FOUND for unknown or disabled interfaces without leaking existence', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness);
    await expect(harness.service.runPublic('pub_unknown_slug_000', { input: {} }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Disable it via the trigger repository and confirm the same code.
    const disabled = { ...created, enabled: false };
    await harness.ports.triggers.save(disabled);
    await expect(harness.service.runPublic(created.config.slug!, { input: {} }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rate limits per interface per minute', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, { rateLimitPerMinute: 2 });
    const slug = created.config.slug!;
    await harness.service.runPublic(slug, { input: {} });
    await harness.service.runPublic(slug, { input: {} });
    await expect(harness.service.runPublic(slug, { input: {} }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('enforces the daily run cap', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, { maxRunsPerDay: 1 });
    const slug = created.config.slug!;
    await harness.service.runPublic(slug, { input: {} });
    await expect(harness.service.runPublic(slug, { input: {} }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('resets the minute window after 60 seconds', async () => {
    const harness = publicHarness('2026-08-14T10:00:00.000Z');
    const created = await seedInterface(harness, { rateLimitPerMinute: 1 });
    const slug = created.config.slug!;
    await harness.service.runPublic(slug, { input: {} });
    await expect(harness.service.runPublic(slug, { input: {} }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });
    harness.clock.advance(61_000);
    const run = await harness.service.runPublic(slug, { input: {} });
    expect(run.status).toBe('COMPLETED');
  });

  it('dedupes double-submitted forms via derived idempotency keys', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, { inputSchema: { email: { type: 'string' } }, rateLimitPerMinute: 10 });
    const slug = created.config.slug!;
    const first = await harness.service.runPublic(slug, { input: { email: 'a@b.co' } });
    const second = await harness.service.runPublic(slug, { input: { email: 'a@b.co' } });
    expect(second.id).toBe(first.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);

    const different = await harness.service.runPublic(slug, { input: { email: 'c@d.co' } });
    expect(different.id).not.toBe(first.id);
  });

  it('honors an explicit idempotency key', async () => {
    const harness = publicHarness();
    const created = await seedInterface(harness, { inputSchema: { a: { type: 'number' } } });
    const slug = created.config.slug!;
    const first = await harness.service.runPublic(slug, { input: { a: 1 }, idempotencyKey: 'idem_public_form_01' });
    const second = await harness.service.runPublic(slug, { input: { a: 2 }, idempotencyKey: 'idem_public_form_01' });
    expect(second.id).toBe(first.id);
  });

  it('enforces cost limits configured on the interface', async () => {
    const harness = publicHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'costly', type: 'action', label: 'Costly', configuration: { costMinor: 500 }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    const created = await harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Costly form',
      config: { maxCostMinor: 100 },
    });
    await expect(harness.service.runPublic(created.config.slug!, { input: {} }))
      .rejects.toMatchObject({ code: 'WORKFLOW_ERROR' });
    const runs = await harness.ports.runs.list(orcfloActorContext.tenantId);
    expect(runs[0].status).toBe('FAILED');
  });

  it('does not allow the public caller to bypass policy gates (approval node pauses)', async () => {
    const harness = publicHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      { id: 'approve', type: 'human_approval', label: 'Approve', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ]));
    const created = await harness.service.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Approved form',
    });
    const slug = created.kind === 'public' ? created.config.slug : undefined;
    const run = await harness.service.runPublic(slug!, { input: {} });
    expect(run.status).toBe('WAITING_APPROVAL');
  });
});
