import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let getAgents: typeof import('../app/api/v1/agents/route').GET;
let postAgents: typeof import('../app/api/v1/agents/route').POST;
let getAgent: typeof import('../app/api/v1/agents/[agentId]/route').GET;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ GET: getAgents, POST: postAgents } = await import('../app/api/v1/agents/route'));
  ({ GET: getAgent } = await import('../app/api/v1/agents/[agentId]/route'));
  const { getPlatform } = await import('../lib/server/platform');
  const platform = getPlatform();
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_agents', actorId: 'actor_agents', role: 'BUILDER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_agents', actorId: 'actor_viewer', role: 'VIEWER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_agents_other', actorId: 'actor_other', role: 'BUILDER' });
});

function request(path: string, body: string, role = 'BUILDER', tenantId = 'tenant_agents') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ase-tenant-id': tenantId,
      'x-ase-actor-id': role === 'VIEWER' ? 'actor_viewer' : tenantId === 'tenant_agents_other' ? 'actor_other' : 'actor_agents',
      'x-ase-role': role,
    },
    body,
  });
}

function getRequest(path: string, role = 'BUILDER', tenantId = 'tenant_agents') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    headers: {
      'x-ase-tenant-id': tenantId,
      'x-ase-actor-id': role === 'VIEWER' ? 'actor_viewer' : tenantId === 'tenant_agents_other' ? 'actor_other' : 'actor_agents',
      'x-ase-role': role,
    },
  });
}

const agentBody = {
  name: 'Research agent',
  description: 'Researches prospective customers.',
  role: 'operator',
  goals: ['Research 100 prospects', 'Score them'],
  instructions: 'Use only assigned tools.',
  toolIds: ['tool_lookup'],
  capabilities: ['vendor_lookup'],
  permissions: ['vendor:read'],
};

describe('Agent domain API (Wave 2)', () => {
  it('creates an agent with canonical defaults and lists it', async () => {
    const created = await postAgents(request('/api/v1/agents', JSON.stringify(agentBody)));
    const payload = await created.json();
    expect(created.status).toBe(201);
    expect(payload.data.agent.status).toBe('REGISTERED');
    expect(payload.data.agent.version).toBe(1);
    expect(payload.data.agent.policies.limits.maxIterations).toBe(6);

    const listed = await getAgents(getRequest('/api/v1/agents'));
    const listedPayload = await listed.json();
    expect(listed.status).toBe(200);
    expect(listedPayload.data.agents.some((a: { id: string }) => a.id === payload.data.agent.id)).toBe(true);
  });

  it('returns agent detail by id and is tenant-isolated', async () => {
    const created = await postAgents(request('/api/v1/agents', JSON.stringify({ ...agentBody, name: 'Detail agent' })));
    const { agent } = (await created.json()).data;

    const detail = await getAgent(getRequest(`/api/v1/agents/${agent.id}`), { params: Promise.resolve({ agentId: agent.id }) });
    const detailPayload = await detail.json();
    expect(detail.status).toBe(200);
    expect(detailPayload.data.agent.name).toBe('Detail agent');
    expect(detailPayload.data.agent.goals).toHaveLength(2);

    const other = await getAgent(getRequest(`/api/v1/agents/${agent.id}`, 'BUILDER', 'tenant_agents_other'), { params: Promise.resolve({ agentId: agent.id }) });
    expect(other.status).toBe(404);
  });

  it('enforces role permissions: VIEWER may read but not write agents', async () => {
    const viewerCreate = await postAgents(request('/api/v1/agents', JSON.stringify(agentBody), 'VIEWER'));
    expect(viewerCreate.status).toBe(403);

    // VIEWER has agent:read per the canonical role map.
    const viewerList = await getAgents(getRequest('/api/v1/agents', 'VIEWER'));
    expect(viewerList.status).toBe(200);
  });

  it('validates required fields', async () => {
    const bad = await postAgents(request('/api/v1/agents', JSON.stringify({ name: 'No goals' })));
    expect(bad.status).toBe(422);
  });
});
