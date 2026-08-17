import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let getWorkflow: typeof import('../app/api/v1/workflows/[workflowId]/route').GET;
let postWorkflows: typeof import('../app/api/v1/workflows/route').POST;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ GET: getWorkflow } = await import('../app/api/v1/workflows/[workflowId]/route'));
  ({ POST: postWorkflows } = await import('../app/api/v1/workflows/route'));
  const { getPlatform } = await import('../lib/server/platform');
  const platform = getPlatform();
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_wf_routes', actorId: 'actor_wf', role: 'BUILDER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_wf_other', actorId: 'actor_other', role: 'BUILDER' });
});

function request(path: string, body: string, tenantId = 'tenant_wf_routes') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ase-tenant-id': tenantId,
      'x-ase-actor-id': tenantId === 'tenant_wf_other' ? 'actor_other' : 'actor_wf',
      'x-ase-role': 'BUILDER',
    },
    body,
  });
}

function getRequest(path: string, tenantId = 'tenant_wf_routes') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    headers: {
      'x-ase-tenant-id': tenantId,
      'x-ase-actor-id': tenantId === 'tenant_wf_other' ? 'actor_other' : 'actor_wf',
      'x-ase-role': 'BUILDER',
    },
  });
}

describe('GET /api/v1/workflows/:workflowId — workflow detail (Wave 1 domain API)', () => {
  it('returns the canonical workflow by id', async () => {
    const created = await postWorkflows(request('/api/v1/workflows', JSON.stringify({
      name: 'Detail route workflow',
      description: 'For the detail page.',
      status: 'READY',
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      ],
      edges: [],
    })));
    const { workflow } = (await created.json()).data;

    const response = await getWorkflow(getRequest(`/api/v1/workflows/${workflow.id}`), { params: Promise.resolve({ workflowId: workflow.id }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.workflow.id).toBe(workflow.id);
    expect(payload.data.workflow.name).toBe('Detail route workflow');
    expect(payload.data.workflow.nodes).toHaveLength(1);
  });

  it('is tenant-isolated (404 for another tenant)', async () => {
    const created = await postWorkflows(request('/api/v1/workflows', JSON.stringify({
      name: 'Isolated workflow',
      status: 'DRAFT',
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', configuration: {}, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      ],
      edges: [],
    })));
    const { workflow } = (await created.json()).data;

    const other = await getWorkflow(getRequest(`/api/v1/workflows/${workflow.id}`, 'tenant_wf_other'), { params: Promise.resolve({ workflowId: workflow.id }) });
    expect(other.status).toBe(404);
    expect((await other.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND for a missing workflow', async () => {
    const response = await getWorkflow(getRequest('/api/v1/workflows/workflow_missing'), { params: Promise.resolve({ workflowId: 'workflow_missing' }) });
    expect(response.status).toBe(404);
  });
});
