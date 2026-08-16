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
let postWorkflows: typeof import('../app/api/v1/workflows/route').POST;
let postBlueprints: typeof import('../app/api/v1/orcflo/blueprints/route').POST;
let postInstantiate: typeof import('../app/api/v1/orcflo/blueprints/[blueprintId]/instantiate/route').POST;
let getWorkflowTool: typeof import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route').GET;
let postWorkflowTool: typeof import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route').POST;
let deleteWorkflowTool: typeof import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route').DELETE;

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
  ({ POST: postWorkflows } = await import('../app/api/v1/workflows/route'));
  ({ POST: postBlueprints } = await import('../app/api/v1/orcflo/blueprints/route'));
  ({ POST: postInstantiate } = await import('../app/api/v1/orcflo/blueprints/[blueprintId]/instantiate/route'));
  ({ GET: getWorkflowTool, POST: postWorkflowTool, DELETE: deleteWorkflowTool } = await import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route'));

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

  it('runs a branching workflow through the Orcflo API (router + condition)', async () => {
    // Save a READY workflow with a router and a condition through the
    // canonical workflows API (which validates the graph), then run it.
    const saved = await postWorkflows(request('/api/v1/workflows', JSON.stringify({
      name: 'Branch smoke',
      description: 'router + condition',
      status: 'READY',
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
        { id: 'route', type: 'router', label: 'Route', configuration: { routes: [{ key: 'support' }, { key: 'sales' }], pickPath: 'kind' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
        { id: 'check', type: 'condition', label: 'High value', configuration: { path: 'value', op: 'gte', value: 1000 }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
        { id: 'escalate', type: 'action', label: 'Escalate', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
        { id: 'close', type: 'action', label: 'Close', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'route', metadata: {} },
        { id: 'e2', source: 'route', target: 'check', sourceHandle: 'support', metadata: {} },
        { id: 'e3', source: 'check', target: 'escalate', condition: true, metadata: {} },
        { id: 'e4', source: 'check', target: 'close', condition: false, metadata: {} },
      ],
    }), 'BUILDER'));
    const savedPayload = await saved.json();
    expect(saved.status).toBe(201);
    const workflowId = savedPayload.data.workflow.id;

    const runResponse = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({
      workflowId,
      input: { kind: 'support', value: 2500 },
    })));
    const runPayload = await runResponse.json();
    expect(runResponse.status).toBe(202);
    expect(runPayload.data.run.status).toBe('COMPLETED');
    const byNode = new Map(runPayload.data.run.steps.map((step: { nodeId: string; status: string }) => [step.nodeId, step.status]));
    expect(byNode.get('route')).toBe('COMPLETED');
    expect(byNode.get('check')).toBe('COMPLETED');
    expect(byNode.get('escalate')).toBe('COMPLETED');
    expect(byNode.get('close')).toBe('SKIPPED');
  });

  it('replays the same run for duplicate API starts with the same idempotency key', async () => {
    const first = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      input: { n: 1 },
      idempotencyKey: 'idem_route_duplicate_1',
    })));
    const firstPayload = await first.json();
    expect(first.status).toBe(202);
    expect(firstPayload.data.run.idempotencyKey).toBe('idem_route_duplicate_1');

    const second = await postRuns(request('/api/v1/orcflo/runs', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      input: { n: 1 },
      idempotencyKey: 'idem_route_duplicate_1',
    })));
    const secondPayload = await second.json();
    expect(second.status).toBe(202);
    expect(secondPayload.data.run.id).toBe(firstPayload.data.run.id);
  });

  it('dedupes duplicate webhook deliveries through the route (body-derived key)', async () => {
    const created = await postTriggers(request('/api/v1/orcflo/triggers', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      name: 'Route idem webhook',
      kind: 'webhook',
      config: {},
    })));
    const key = String((await created.json()).data.trigger.config.key);
    const params = Promise.resolve({ key });

    const first = await postWebhookFire(
      request(`/api/v1/orcflo/triggers/webhook/${encodeURIComponent(key)}/fire`, JSON.stringify({ input: { evt: 'dup' } })),
      { params },
    );
    const second = await postWebhookFire(
      request(`/api/v1/orcflo/triggers/webhook/${encodeURIComponent(key)}/fire`, JSON.stringify({ input: { evt: 'dup' } })),
      { params },
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect((await second.json()).data.run.id).toBe((await first.json()).data.run.id);
  });

  it('honors an explicit Idempotency-Key header on webhook fire', async () => {
    const created = await postTriggers(request('/api/v1/orcflo/triggers', JSON.stringify({
      workflowId: 'workflow_orcflo_routes',
      name: 'Route header idem',
      kind: 'webhook',
      config: {},
    })));
    const key = String((await created.json()).data.trigger.config.key);
    const params = Promise.resolve({ key });
    const withHeader = (body: string) => new NextRequest(
      `http://localhost/api/v1/orcflo/triggers/webhook/${encodeURIComponent(key)}/fire`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ase-tenant-id': 'tenant_orcflo_routes',
          'x-ase-actor-id': 'actor_route',
          'x-ase-role': 'BUILDER',
          'Idempotency-Key': 'idem_header_explicit_1',
        },
        body,
      },
    );
    const first = await postWebhookFire(withHeader(JSON.stringify({ input: { a: 1 } })), { params });
    const second = await postWebhookFire(withHeader(JSON.stringify({ input: { a: 2 } })), { params });
    expect((await second.json()).data.run.id).toBe((await first.json()).data.run.id);
  });

  it('registers a workflow as a tool, describes it, and soft-unregisters it', async () => {
    const params = Promise.resolve({ workflowId: 'workflow_orcflo_routes' });
    const registered = await postWorkflowTool(request('/api/v1/orcflo/workflows/workflow_orcflo_routes/tool', '{}'), { params });
    const registeredPayload = await registered.json();
    expect(registered.status).toBe(201);
    expect(registeredPayload.data.tool.metadata).toMatchObject({ orcfloTool: true, workflowId: 'workflow_orcflo_routes' });

    const described = await getWorkflowTool(getRequest('/api/v1/orcflo/workflows/workflow_orcflo_routes/tool'), { params });
    const describedPayload = await described.json();
    expect(described.status).toBe(200);
    expect(describedPayload.data.tool.id).toBe(registeredPayload.data.tool.id);

    const unregistered = await deleteWorkflowTool(getRequest('/api/v1/orcflo/workflows/workflow_orcflo_routes/tool'), { params });
    const unregisteredPayload = await unregistered.json();
    expect(unregistered.status).toBe(200);
    expect(unregisteredPayload.data.tool.availability).toBe('UNAVAILABLE');
  });
});
