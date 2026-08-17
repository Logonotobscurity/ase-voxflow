import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let getEvents: typeof import('../app/api/v1/events/route').GET;
let getTeam: typeof import('../app/api/v1/team/members/route').GET;
let getMeteringRecords: typeof import('../app/api/v1/orcflo/metering/records/route').GET;

beforeAll(async () => {
  process.env.ASE_RUNTIME_MODE = 'demo';
  process.env.ASE_PERSISTENCE_MODE = 'memory';
  ({ GET: getEvents } = await import('../app/api/v1/events/route'));
  ({ GET: getTeam } = await import('../app/api/v1/team/members/route'));
  ({ GET: getMeteringRecords } = await import('../app/api/v1/orcflo/metering/records/route'));
  const { getPlatform } = await import('../lib/server/platform');
  const platform = getPlatform();
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_governance', actorId: 'actor_gov', role: 'BUILDER' });
  await platform.ports.tenantMembers?.upsert({ tenantId: 'tenant_governance', actorId: 'actor_approver_gov', role: 'APPROVER' });
});

function getRequest(path: string, tenantId = 'tenant_governance') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    headers: {
      'x-ase-tenant-id': tenantId,
      'x-ase-actor-id': 'actor_gov',
      'x-ase-role': 'BUILDER',
    },
  });
}

describe('Governance domain APIs (Wave 4)', () => {
  it('returns the tenant event trail (authoritative audit source)', async () => {
    const response = await getEvents(getRequest('/api/v1/events'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.data.events)).toBe(true);
    expect(payload.data.persistence).toBe('ephemeral-memory');
  });

  it('returns team members from the membership authority', async () => {
    const response = await getTeam(getRequest('/api/v1/team/members'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    const roles = payload.data.members.map((m: { role: string }) => m.role);
    expect(roles).toContain('BUILDER');
    expect(roles).toContain('APPROVER');
  });

  it('returns raw metering records for the usage breakdown', async () => {
    const response = await getMeteringRecords(getRequest('/api/v1/orcflo/metering/records'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(payload.data.records)).toBe(true);
  });
});
