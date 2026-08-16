import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let postRuns: typeof import('../app/api/v1/orcflo/runs/route').POST;
let getRuns: typeof import('../app/api/v1/orcflo/runs/route').GET;
let getRunById: typeof import('../app/api/v1/orcflo/runs/[runId]/route').GET;
let getStream: typeof import('../app/api/v1/orcflo/runs/[runId]/stream/route').GET;
let getMetering: typeof import('../app/api/v1/orcflo/metering/route').GET;
let postModels: typeof import('../app/api/v1/orcflo/models/route').POST;
let postModelCall: typeof import('../app/api/v1/orcflo/models/[providerId]/call/route').POST;
let postTriggers: typeof import('../app/api/v1/orcflo/triggers/route').POST;
let postWebhookFire: typeof import('../app/api/v1/orcflo/triggers/webhook/[key]/fire/route').POST;
let postScheduleDrain: typeof import('../app/api/v1/orcflo/triggers/schedule/drain/route').POST;
let postEventFire: typeof import('../app/api/v1/orcflo/triggers/event/fire/route').POST;
let postBlueprints: typeof import('../app/api/v1/orcflo/blueprints/route').POST;
let postInstantiate: typeof import('../app/api/v1/orcflo/blueprints/[blueprintId]/instantiate/route').POST;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ POST: postRuns, GET: getRuns } = await import('../app/api/v1/orcflo/runs/route'));
  ({ GET: getRunById } = await import('../app/api/v1/orcflo/runs/[runId]/route'));
  ({ GET: getStream } = await import('../app/api/v1/orcflo/runs/[runId]/stream/route'));
  ({ GET: getMetering } = await import('../app/api/v1/orcflo/metering/route'));
  ({ POST: postModels } = await import('../app/api/v1/orcflo/models/route'));
  ({ POST: postModelCall } = await import('../app/api/v1/orcflo/models/[providerId]/call/route'));
  ({ POST: postTriggers } = await import('../app/api/v1/orcflo/triggers/route'));
  ({ POST: postWebhookFire } = await import('../app/api/v1/orcflo/triggers/webhook/[key]/fire/route'));
  ({ POST: postScheduleDrain } = await import('../app/api/v1/orcflo/triggers/schedule/drain/route'));
  ({ POST: postEventFire } = await import('../app/api/v1/orcflo/triggers/event/fire/route'));
  ({ POST: postBlueprints } = await import('../app/api/v1/orcflo/blueprints/route'));
  ({ POST: postInstantiate } = await import('../app/api/v1/orcflo/blueprints/[blueprintId]/instantiate/route'));

  // Seed a READY workflow and the membership rows the demo identity
  // reconciliation requires.
  const { getPlatform } = await import('../lib/server/platform');
  const platform = getPlatform();
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_orcflo_routes', actorId: 'actor_route', role: 'BUILDER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_orcflo_routes', actorId: 'actor_viewer', role: 'VIEWER' });
  const now = '2026-08-14T09:00:00.000Z';
  await platform.ports.workflows.save({
    id: 'workflow_orcflo_routes',
    tenantId: 'tenant_orcflo_routes',
    name: 'Route test workflow',
    description: 'Ready for Orcflo route verification.',
    status: 'READY',
    version: 1,
    nodes: [
      { id: 'start', type: 'trigger', label: 'Start', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      { id: 'end', type: 'action', label: 'End', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end', metadata: {} }],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });
});

function request(path: string, body: string, role = 'BUILDER') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ase-tenant-id': 'tenant_orcflo_routes',
      'x-ase-actor-id': role === 'VIEWER' ? 'actor_viewer' : 'actor_route',
      'x-ase-role': role,
    },
    body,
  });
}

function getRequest(path: string, role = 'BUILDER') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    headers: {
      'x-ase-tenant-id': 'tenant_orcflo_routes',
      'x-ase-actor-id': role === 'VIEWER' ? 'actor_viewer' : 'actor_route',
      'x-ase-role': role,
    },
  });
}

describe('Orcflo HTTP routes', () => {
  it('starts a run and lists it', async () => {
    const created = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      input: { route: 'smoke' },
    })));
    const createdPayload = await created.json();
    expect(created.status).toBe(202);
    expect(createdPayload.data.run.status).toBe('COMPLETED');
    expect(createdPayload.data.persistence).toBe('ephemeral-memory');

    const listResponse = await getRuns(getRequest('/api/v1/orcflo/runs?workflowId=workflow_orcflo_routes'));
    const listPayload = await listResponse.json();
    expect(listPayload.data.runs.some((run: { id: string }) => run.id === createdPayload.data.run.id)).toBe(true);

    const byId = await getRunById(getRequest('/api/v1/orcflo/runs/x'), { params: Promise.resolve({ runId: createdPayload.data.run.id }) });
    const byIdPayload = await byId.json();
    expect(byIdPayload.data.run.id).toBe(createdPayload.data.run.id);
  });

  it('streams the run event log as SSE', async () => {
    const created = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({ workflowId: 'workflow_orcflo_routes' })));
    const { run } = (await created.json()).data;
    const stream = await getStream(getRequest(`/api/v1/orcflo/runs/${run.id}/stream`), { params: Promise.resolve({ runId: run.id }) });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const body = await stream.text();
    expect(body).toContain('event: run.started');
    expect(body).toContain('event: run.completed');
    expect(body).toContain('event: run.snapshot');
    expect(body).toContain(`"runId":"${run.id}"`);
  });

  it('reports metering summaries', async () => {
    const response = await getMetering(getRequest('/api/v1/orcflo/metering'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.summary.runs).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.steps).toBeGreaterThanOrEqual(2);
  });

  it('registers a demo model provider and serves a deterministic call', async () => {
    const providerResponse = await postModels(request('/api/v1/orcflo/models', JSON.stringify({
      name: 'route-demo',
      kind: 'demo',
      model: 'route-model',
    })));
    const providerPayload = await providerResponse.json();
    expect(providerResponse.status).toBe(201);

    const callResponse = await postModelCall(
      request(`/api/v1/orcflo/models/${providerPayload.data.provider.id}/call`, JSON.stringify({ prompt: 'Hello route' })),
      { params: Promise.resolve({ providerId: providerPayload.data.provider.id }) },
    );
    const callPayload = await callResponse.json();
    expect(callResponse.status).toBe(200);
    expect(callPayload.data.result.status).toBe('COMPLETED');
    expect(callPayload.data.result.text).toContain('route-demo');
  });

  it('fails model calls through the noop gateway with PROVIDER_ERROR', async () => {
    const providerResponse = await postModels(request('/api/v1/orcflo/models', JSON.stringify({
      name: 'route-noop',
      kind: 'noop',
    })));
    const { provider } = (await providerResponse.json()).data;
    const callResponse = await postModelCall(
      request(`/api/v1/orcflo/models/${provider.id}/call`, JSON.stringify({ prompt: 'hi' })),
      { params: Promise.resolve({ providerId: provider.id }) },
    );
    const callPayload = await callResponse.json();
    expect(callResponse.status).toBe(502);
    expect(callPayload.error.code).toBe('PROVIDER_ERROR');
  });

  it('creates a webhook trigger and fires it through the webhook path', async () => {
    const created = await postTriggers(request('/api/v1/orcflo/triggers', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      name: 'Route inbound',
      kind: 'webhook',
      config: {},
    })));
    const createdPayload = await created.json();
    expect(created.status).toBe(201);
    const key = String(createdPayload.data.trigger.config.key);

    const fired = await postWebhookFire(
      request(`/api/v1/orcflo/triggers/webhook/${encodeURIComponent(key)}/fire`, JSON.stringify({ input: { via: 'webhook' } })),
      { params: Promise.resolve({ key }) },
    );
    const firedPayload = await fired.json();
    expect(fired.status).toBe(202);
    expect(firedPayload.data.run.triggerKind).toBe('webhook');
    expect(firedPayload.data.run.input).toMatchObject({ via: 'webhook' });
  });

  it('drains due schedule triggers and fires event triggers', async () => {
    await postTriggers(request('/api/v1/orcflo/triggers', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      name: 'Route every five',
      kind: 'schedule',
      config: { cron: '*/5 * * * *', timezone: 'UTC' },
    })));
    const drained = await postScheduleDrain(request('/api/v1/orcflo/triggers/schedule/drain', JSON.stringify({
      now: '2026-08-14T10:05:00Z',
    })));
    const drainedPayload = await drained.json();
    expect(drained.status).toBe(200);
    expect(drainedPayload.data.runs).toHaveLength(1);

    await postTriggers(request('/api/v1/orcflo/triggers', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      name: 'Route vendor event',
      kind: 'event',
      config: { eventType: 'vendor.verified' },
    })));
    const eventFired = await postEventFire(request('/api/v1/orcflo/triggers/event/fire', JSON.stringify({
      eventType: 'vendor.verified',
      input: { vendorId: 'v-9' },
    })));
    const eventPayload = await eventFired.json();
    expect(eventPayload.data.runs).toHaveLength(1);
  });

  it('instantiates a blueprint into a workflow', async () => {
    const blueprintResponse = await postBlueprints(request('/api/v1/orcflo/blueprints', JSON.stringify({
      name: 'Route blueprint',
      parameters: [{ key: 'recipient', label: 'Recipient', type: 'string', required: true }],
      nodes: [
        { id: 'start', type: 'trigger', label: 'Hello {{recipient}}', configuration: {}, retryPolicy: {}, metadata: {} },
      ],
      edges: [],
    })));
    const blueprintPayload = await blueprintResponse.json();
    expect(blueprintResponse.status).toBe(201);

    const instantiateResponse = await postInstantiate(
      request(`/api/v1/orcflo/blueprints/${blueprintPayload.data.blueprint.id}/instantiate`, JSON.stringify({
        values: { recipient: 'Route Tester' },
        status: 'READY',
      })),
      { params: Promise.resolve({ blueprintId: blueprintPayload.data.blueprint.id }) },
    );
    const instantiatePayload = await instantiateResponse.json();
    expect(instantiateResponse.status).toBe(201);
    expect(instantiatePayload.data.workflow.nodes[0].label).toBe('Hello Route Tester');
  });

  it('denies run creation to viewers', async () => {
    const response = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
    }), 'VIEWER'));
    const payload = await response.json();
    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('AUTHORIZATION_DENIED');
  });
});
