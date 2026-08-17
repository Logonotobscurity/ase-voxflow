import { describe, expect, it } from 'vitest';
import { OrcfloTriggerService } from '../lib/application/orcflo-triggers';
import type { OrcfloRuntimePorts } from '../lib/application/ports';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
} from './orcflo-helpers';

function triggerHarness() {
  const harness = buildOrcfloHarness('2026-08-14T10:00:00.000Z');
  const triggers = new OrcfloTriggerService(harness.ports, harness.engine);
  return { ...harness, triggers };
}

async function seedReadyWorkflow(harness: { ports: OrcfloRuntimePorts }) {
  await harness.ports.workflows.save(orcfloWorkflowFixture());
  return 'workflow_orcflo';
}

describe('Orcflo triggers — creation and validation', () => {
  it('creates a manual trigger', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'On demand',
      kind: 'manual',
      config: {},
    });
    expect(trigger.kind).toBe('manual');
    expect(trigger.enabled).toBe(true);
  });

  it('validates schedule cron and timezone at creation time', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    await expect(harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Bad cron',
      kind: 'schedule',
      config: { cron: 'not a cron', timezone: 'UTC' },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Bad tz',
      kind: 'schedule',
      config: { cron: '0 0 * * *', timezone: 'Africa/Lagos' },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const ok = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Nightly',
      kind: 'schedule',
      config: { cron: '0 2 * * *', timezone: '+01:00' },
    });
    expect(ok.config).toMatchObject({ cron: '0 2 * * *', timezone: '+01:00' });
  });

  it('generates a webhook key and enforces tenant uniqueness', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const first = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Inbound one',
      kind: 'webhook',
      config: {},
    });
    const firstKey = first.kind === 'webhook' ? String(first.config.key) : '';
    expect(firstKey.length).toBeGreaterThanOrEqual(16);
    await expect(harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Inbound two',
      kind: 'webhook',
      config: { key: first.kind === 'webhook' ? first.config.key : '' },
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('validates event trigger eventType syntax', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    await expect(harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Event hook',
      kind: 'event',
      config: { eventType: 'Not Valid!' },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const ok = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Event hook',
      kind: 'event',
      config: { eventType: 'vendor.verified' },
    });
    expect(ok.config).toMatchObject({ eventType: 'vendor.verified' });
  });

  it('requires an existing workflow and the workflow:write role', async () => {
    const harness = triggerHarness();
    await expect(harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_missing',
      name: 'Orphan',
      kind: 'manual',
      config: {},
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await seedReadyWorkflow(harness);
    await expect(harness.triggers.create({ ...orcfloActorContext, role: 'VIEWER' }, {
      workflowId: 'workflow_orcflo',
      name: 'Forbidden',
      kind: 'manual',
      config: {},
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
});

describe('Orcflo triggers — firing', () => {
  it('fires a manual trigger and stamps lastFiredAt', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'On demand',
      kind: 'manual',
      config: {},
    });
    const run = await harness.triggers.fireManual(orcfloActorContext, trigger.id, { note: 'hello' });
    expect(run.status).toBe('COMPLETED');
    expect(run.triggerId).toBe(trigger.id);
    expect(run.triggerKind).toBe('manual');
    expect(run.input).toMatchObject({ note: 'hello' });

    const stored = await harness.triggers.findById(orcfloActorContext, trigger.id);
    expect(stored?.lastFiredAt).toBeTruthy();
  });

  it('refuses to fire a non-manual trigger through the manual path', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Nightly',
      kind: 'schedule',
      config: { cron: '0 0 * * *', timezone: 'UTC' },
    });
    await expect(harness.triggers.fireManual(orcfloActorContext, trigger.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('fires a webhook trigger only with the matching key', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Inbound',
      kind: 'webhook',
      config: {},
    });
    const key = trigger.kind === 'webhook' ? String(trigger.config.key) : '';
    const run = await harness.triggers.fireWebhook(orcfloActorContext, key, { from: 'webhook' });
    expect(run.status).toBe('COMPLETED');
    expect(run.triggerKind).toBe('webhook');

    await expect(harness.triggers.fireWebhook(orcfloActorContext, 'whk_wrong_key_1234567890'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('drains due schedules exactly once per minute bucket', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Every five',
      kind: 'schedule',
      config: { cron: '*/5 * * * *', timezone: 'UTC' },
    });

    const first = await harness.triggers.drainSchedules(orcfloActorContext, '2026-08-14T10:05:00Z');
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe('COMPLETED');

    // Same bucket, polled again -> no duplicate run.
    const second = await harness.triggers.drainSchedules(orcfloActorContext, '2026-08-14T10:05:59Z');
    expect(second).toHaveLength(0);

    // Next bucket -> due again.
    const third = await harness.triggers.drainSchedules(orcfloActorContext, '2026-08-14T10:10:00Z');
    expect(third).toHaveLength(1);

    const runs = await harness.ports.runs.listByTrigger(orcfloActorContext.tenantId, first[0].triggerId!);
    expect(runs).toHaveLength(2);
  });

  it('fires event triggers only for the matching eventType', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Vendor verified',
      kind: 'event',
      config: { eventType: 'vendor.verified' },
    });

    const runs = await harness.triggers.fireEventTrigger(orcfloActorContext, 'vendor.verified', { vendorId: 'v1' });
    expect(runs).toHaveLength(1);
    expect(runs[0].input).toMatchObject({ vendorId: 'v1' });

    const none = await harness.triggers.fireEventTrigger(orcfloActorContext, 'other.event');
    expect(none).toHaveLength(0);
  });

  it('fails a trigger fire when the target workflow is not READY', async () => {
    const harness = triggerHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({ status: 'DRAFT' }));
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Draft fire',
      kind: 'manual',
      config: {},
    });
    await expect(harness.triggers.fireManual(orcfloActorContext, trigger.id))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses to fire when the trigger is disabled', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    const trigger = await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Disabled',
      kind: 'manual',
      config: {},
      enabled: false,
    });
    await expect(harness.triggers.fireManual(orcfloActorContext, trigger.id))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('keeps scheduled runs isolated per tenant', async () => {
    const harness = triggerHarness();
    await seedReadyWorkflow(harness);
    await harness.triggers.create(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Every five',
      kind: 'schedule',
      config: { cron: '*/5 * * * *', timezone: 'UTC' },
    });
    const runs = await harness.triggers.drainSchedules({ ...orcfloActorContext, tenantId: 'tenant_other' }, '2026-08-14T10:05:00Z');
    expect(runs).toHaveLength(0);
  });
});
