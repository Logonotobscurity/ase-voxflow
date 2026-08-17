import { describe, expect, it } from 'vitest';
import { OrcfloTriggerService } from '../lib/application/orcflo-triggers';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
  runWithFixture,
} from './orcflo-helpers';

describe('Orcflo run idempotency (§48) — engine', () => {
  it('replays the existing run when the same idempotency key is used again', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());

    const first = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { payload: 'v1' },
      idempotencyKey: 'idem_dup_delivery_001',
    });
    const second = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { payload: 'v1' },
      idempotencyKey: 'idem_dup_delivery_001',
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe(first.status);
    expect(second.input).toEqual(first.input);
    // Only one run persisted; the handler ran once.
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'start').length).toBe(1);

    // The stored run carries the idempotency key.
    const stored = await harness.ports.runs.findById(orcfloActorContext.tenantId, first.id);
    expect(stored?.idempotencyKey).toBe('idem_dup_delivery_001');
  });

  it('ignores a different input on replay (historical runs are immutable)', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const first = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { original: true },
      idempotencyKey: 'idem_immutable_replay',
    });
    const second = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      input: { different: true },
      idempotencyKey: 'idem_immutable_replay',
    });
    expect(second.id).toBe(first.id);
    expect(second.input).toMatchObject({ original: true });
  });

  it('creates separate runs for different idempotency keys', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const a = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      idempotencyKey: 'idem_first_request_01',
    });
    const b = await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      idempotencyKey: 'idem_second_request_02',
    });
    expect(a.id).not.toBe(b.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(2);
  });

  it('conflicts when a key is reused for a different workflow', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await harness.ports.workflows.save(orcfloWorkflowFixture({ id: 'workflow_other' }));
    await harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      idempotencyKey: 'idem_wrong_workflow_1',
    });
    await expect(harness.engine.startRun({
      workflowId: 'workflow_other',
      context: orcfloActorContext,
      idempotencyKey: 'idem_wrong_workflow_1',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects keys that are too short', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await expect(harness.engine.startRun({
      workflowId: 'workflow_orcflo',
      context: orcfloActorContext,
      idempotencyKey: 'short',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not dedupe runs started without a key', async () => {
    const harness = buildOrcfloHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await runWithFixture(harness, { q: 1 });
    await runWithFixture(harness, { q: 1 });
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(2);
    expect(harness.handlerCalls.filter((call) => call.nodeId === 'start').length).toBe(2);
  });
});

describe('Orcflo run idempotency (§48) — webhook and event triggers', () => {
  function triggerHarness() {
    const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z');
    const triggers = new OrcfloTriggerService(harness.ports, harness.engine);
    return { ...harness, triggers };
  }

  it('dedupes duplicate webhook deliveries with an identical body', async () => {
    const harness = triggerHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Inbound',
      kind: 'webhook',
      config: {},
    });
    const key = trigger.kind === 'webhook' ? String(trigger.config.key) : '';

    const first = await harness.triggers.fireWebhook(orcfloActorContext, key, { event: 'payment.received', amount: 500 });
    const second = await harness.triggers.fireWebhook(orcfloActorContext, key, { event: 'payment.received', amount: 500 });
    expect(second.id).toBe(first.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);

    // A different payload is a different delivery -> a new run.
    const third = await harness.triggers.fireWebhook(orcfloActorContext, key, { event: 'payment.received', amount: 700 });
    expect(third.id).not.toBe(first.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(2);
  });

  it('lets a caller-supplied idempotency key override the derived key', async () => {
    const harness = triggerHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Inbound',
      kind: 'webhook',
      config: {},
    });
    const key = trigger.kind === 'webhook' ? String(trigger.config.key) : '';
    const first = await harness.triggers.fireWebhook(orcfloActorContext, key, { n: 1 }, { idempotencyKey: 'idem_explicit_key_01' });
    const second = await harness.triggers.fireWebhook(orcfloActorContext, key, { n: 2 }, { idempotencyKey: 'idem_explicit_key_01' });
    expect(second.id).toBe(first.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);
  });

  it('dedupes duplicate event fires with the same payload', async () => {
    const harness = triggerHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Vendor event',
      kind: 'event',
      config: { eventType: 'vendor.verified' },
    });
    const first = await harness.triggers.fireEventTrigger(orcfloActorContext, 'vendor.verified', { vendorId: 'v1' });
    const second = await harness.triggers.fireEventTrigger(orcfloActorContext, 'vendor.verified', { vendorId: 'v1' });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);

    // A different payload -> a new run.
    const third = await harness.triggers.fireEventTrigger(orcfloActorContext, 'vendor.verified', { vendorId: 'v2' });
    expect(third[0].id).not.toBe(first[0].id);
  });

  it('supports explicit idempotency keys on manual trigger fires', async () => {
    const harness = triggerHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture());
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'On demand',
      kind: 'manual',
      config: {},
    });
    const first = await harness.triggers.fireManual(orcfloActorContext, trigger.id, { a: 1 }, 'idem_manual_retry_01');
    const second = await harness.triggers.fireManual(orcfloActorContext, trigger.id, { a: 1 }, 'idem_manual_retry_01');
    expect(second.id).toBe(first.id);
    expect((await harness.ports.runs.list(orcfloActorContext.tenantId)).length).toBe(1);
  });
});
