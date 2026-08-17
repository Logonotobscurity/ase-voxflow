import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let getTools: typeof import('../app/api/v1/tools/route').GET;
let getMcp: typeof import('../app/api/v1/mcp/servers/route').GET;
let postWorkflowTool: typeof import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route').POST;
let postWorkflows: typeof import('../app/api/v1/workflows/route').POST;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ GET: getTools } = await import('../app/api/v1/tools/route'));
  ({ GET: getMcp } = await import('../app/api/v1/mcp/servers/route'));
  ({ POST: postWorkflowTool } = await import('../app/api/v1/orcflo/workflows/[workflowId]/tool/route'));
  ({ POST: postWorkflows } = await import('../app/api/v1/workflows/route'));
  const { getPlatform } = await import('../lib/server/platform');
  const platform = getPlatform();
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_tools', actorId: 'actor_tools', role: 'BUILDER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_tools', actorId: 'actor_viewer', role: 'VIEWER' });
});

function getRequest(path: string, role = 'BUILDER') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    headers: {
      'x-ase-tenant-id': 'tenant_tools',
      'x-ase-actor-id': role === 'VIEWER' ? 'actor_viewer' : 'actor_tools',
      'x-ase-role': role,
    },
  });
}

function postRequest(path: string, body: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ase-tenant-id': 'tenant_tools',
      'x-ase-actor-id': 'actor_tools',
      'x-ase-role': 'BUILDER',
    },
    body,
  });
}

describe('Tool & MCP domain APIs (Wave 3)', () => {
  it('lists an empty tool registry initially, then workflow-as-tool registrations', async () => {
    const empty = await getTools(getRequest('/api/v1/tools'));
    expect((await empty.json()).data.tools).toEqual([]);

    // Register a workflow as a tool through the bridge.
    const created = await postWorkflows(postRequest('/api/v1/workflows', JSON.stringify({
      name: 'Tool workflow',
      status: 'READY',
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', configuration: { executionMode: 'demo' }, retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {} },
      ],
      edges: [],
    })));
    const { workflow } = (await created.json()).data;
    const registered = await postWorkflowTool(
      postRequest(`/api/v1/orcflo/workflows/${workflow.id}/tool`, '{}'),
      { params: Promise.resolve({ workflowId: workflow.id }) },
    );
    expect(registered.status).toBe(201);

    const listed = await getTools(getRequest('/api/v1/tools'));
    const payload = await listed.json();
    expect(payload.data.tools).toHaveLength(1);
    expect(payload.data.tools[0].metadata.orcfloTool).toBe(true);
    expect(payload.data.tools[0].riskLevel).toBe('MEDIUM');
    expect(payload.data.tools[0].availability).toBe('AVAILABLE');
  });

  it('enforces tool:read', async () => {
    const response = await getTools(getRequest('/api/v1/tools', 'VIEWER'));
    expect(response.status).toBe(403);
  });

  it('returns the fail-closed empty MCP server list', async () => {
    const response = await getMcp(getRequest('/api/v1/mcp/servers'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.servers).toEqual([]);
    expect(payload.data.persistence).toBe('ephemeral-memory');
  });
});
