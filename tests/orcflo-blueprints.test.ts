import { describe, expect, it } from 'vitest';
import { OrcfloBlueprintService } from '../lib/application/orcflo-blueprints';
import type { OrcfloBlueprint } from '../lib/domain/orcflo';
import {
  buildOrcfloHarness,
  orcfloActorContext,
  orcfloWorkflowFixture,
} from './orcflo-helpers';

function blueprintHarness() {
  const harness = buildOrcfloHarness();
  const blueprints = new OrcfloBlueprintService(harness.ports);
  return { ...harness, blueprints };
}

const alertGraph = {
  nodes: [
    {
      id: 'start',
      type: 'trigger' as const,
      label: 'Alert for {{recipient}}',
      configuration: { channel: '{{channel}}', amount: '$amount' },
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      metadata: {},
    },
    {
      id: 'notify',
      type: 'action' as const,
      label: 'Notify {{recipient}}',
      configuration: { template: 'Amount is $amount' },
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      metadata: {},
    },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'notify', metadata: {} }],
};

async function seedBlueprint(harness: { blueprints: OrcfloBlueprintService }): Promise<OrcfloBlueprint> {
  return harness.blueprints.createFromGraph(orcfloActorContext, {
    name: 'Vendor alert',
    description: 'Parameterized alert workflow.',
    parameters: [
      { key: 'recipient', label: 'Recipient', type: 'string', required: true },
      { key: 'channel', label: 'Channel', type: 'string', required: false, default: 'email' },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
    ],
    nodes: alertGraph.nodes,
    edges: alertGraph.edges,
  });
}

describe('Orcflo blueprints — creation', () => {
  it('creates a blueprint from a graph with declared parameters', async () => {
    const harness = blueprintHarness();
    const blueprint = await seedBlueprint(harness);
    expect(blueprint.parameters.map((parameter) => parameter.key)).toEqual(['recipient', 'channel', 'amount']);
    expect(blueprint.version).toBe(1);
  });

  it('rejects graphs whose placeholders are not declared', async () => {
    const harness = blueprintHarness();
    await expect(harness.blueprints.createFromGraph(orcfloActorContext, {
      name: 'Broken',
      parameters: [{ key: 'recipient', label: 'Recipient', type: 'string' }],
      nodes: [
        {
          id: 'start',
          type: 'trigger',
          label: 'Hello {{recipient}} and {{mystery}}',
          configuration: {},
          retryPolicy: { maxRetries: 0, backoffMs: 0 },
          metadata: {},
        },
      ],
      edges: [],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('derives a blueprint from an existing workflow', async () => {
    const harness = blueprintHarness();
    await harness.ports.workflows.save(orcfloWorkflowFixture({}, [
      {
        id: 'mid',
        type: 'action',
        label: 'Send to {{operator}}',
        configuration: { mode: '{{region}}' },
        retryPolicy: { maxRetries: 0, backoffMs: 0 },
        metadata: {},
      },
    ]));
    const blueprint = await harness.blueprints.createFromWorkflow(orcfloActorContext, {
      workflowId: 'workflow_orcflo',
      name: 'Derived template',
    });
    expect(blueprint.parameters.map((parameter) => parameter.key).sort()).toEqual(['operator', 'region']);
    expect(blueprint.name).toBe('Derived template');
  });
});

describe('Orcflo blueprints — instantiation', () => {
  it('substitutes typed values and saves a runnable workflow', async () => {
    const harness = blueprintHarness();
    const blueprint = await seedBlueprint(harness);
    const workflow = await harness.blueprints.instantiate(orcfloActorContext, blueprint.id, {
      values: { recipient: 'Lagos Hub', amount: 250 },
      workflowName: 'Lagos hub alert',
      status: 'READY',
    });

    expect(workflow.name).toBe('Lagos hub alert');
    expect(workflow.status).toBe('READY');
    const startNode = workflow.nodes.find((node) => node.id === 'start');
    expect(startNode?.label).toBe('Alert for Lagos Hub');
    expect(startNode?.configuration).toMatchObject({ channel: 'email', amount: 250 });
    expect(workflow.metadata).toMatchObject({ blueprintId: blueprint.id });

    // The instantiated workflow is first-class: Orcflo can run it.
    const run = await harness.engine.startRun({
      workflowId: workflow.id,
      input: {},
      context: orcfloActorContext,
      blueprintId: blueprint.id,
    });
    expect(run.status).toBe('COMPLETED');
    expect(run.blueprintId).toBe(blueprint.id);
  });

  it('supports boolean and json typed parameters', async () => {
    const harness = blueprintHarness();
    const blueprint = await harness.blueprints.createFromGraph(orcfloActorContext, {
      name: 'Typed slots',
      parameters: [
        { key: 'urgent', label: 'Urgent', type: 'boolean', required: true },
        { key: 'payload', label: 'Payload', type: 'json', required: true },
      ],
      nodes: [
        {
          id: 'start',
          type: 'trigger',
          label: 'Start',
          configuration: { urgent: '$urgent', payload: '$payload' },
          retryPolicy: { maxRetries: 0, backoffMs: 0 },
          metadata: {},
        },
      ],
      edges: [],
    });
    const workflow = await harness.blueprints.instantiate(orcfloActorContext, blueprint.id, {
      values: { urgent: 'true', payload: '{"region":"west"}' },
    });
    expect(workflow.nodes[0].configuration).toMatchObject({
      urgent: true,
      payload: { region: 'west' },
    });
  });

  it('rejects missing required parameters and unknown value keys', async () => {
    const harness = blueprintHarness();
    const blueprint = await seedBlueprint(harness);
    await expect(harness.blueprints.instantiate(orcfloActorContext, blueprint.id, {
      values: { recipient: 'Only' },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(harness.blueprints.instantiate(orcfloActorContext, blueprint.id, {
      values: { recipient: 'Ada', amount: 1, mystery: 'x' },
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('applies declared defaults for optional parameters', async () => {
    const harness = blueprintHarness();
    const blueprint = await seedBlueprint(harness);
    const workflow = await harness.blueprints.instantiate(orcfloActorContext, blueprint.id, {
      values: { recipient: 'Ada', amount: 5 },
    });
    expect(workflow.nodes[0].configuration).toMatchObject({ channel: 'email' });
  });

  it('requires workflow:write and scopes blueprints per tenant', async () => {
    const harness = blueprintHarness();
    const blueprint = await seedBlueprint(harness);
    await expect(harness.blueprints.instantiate({ ...orcfloActorContext, role: 'VIEWER' }, blueprint.id, {
      values: { recipient: 'Ada', amount: 5 },
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });

    expect(await harness.blueprints.findById({ ...orcfloActorContext, tenantId: 'tenant_other' }, blueprint.id)).toBeNull();
  });
});
