'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { statusTone } from '@/components/app-format';
import type { TenantMembership } from '@/lib/application/ports';

/**
 * Team & RBAC (ROUTE_ARCHITECTURE_SPEC §35). Source of truth is the
 * tenant-membership authority (Audit §1) — the same records request
 * reconciliation checks. Groups/invitations are honest target state.
 */
export function TeamPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    members: TenantMembership[];
  }>({ status: 'loading' });

  async function load() {
    try {
      const data = await requestJson<{ members: TenantMembership[] }>('/api/v1/team/members');
      setState({ status: 'ready', members: data.members });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load team members.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Team</h1>
          <p>Members and roles from the tenant-membership authority.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh team">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading team…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load team members</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="app-card">
          {state.members.length === 0 ? (
            <div className="state-box">
              <div className="state-icon"><Users size={20} /></div>
              <h3>No memberships provisioned</h3>
              <p>Members are provisioned by the tenant-membership authority; none exist for this tenant yet.</p>
            </div>
          ) : (
            <table className="app-table">
              <thead>
                <tr><th>Member</th><th>Role</th><th /></tr>
              </thead>
              <tbody>
                {state.members.map((member) => (
                  <tr key={`${member.tenantId}:${member.actorId}`}>
                    <td><span className="row-link">{member.actorId}</span></td>
                    <td><span className={`tag tag-${statusTone(member.role)}`}>{member.role}</span></td>
                    <td className="muted">Tenant {member.tenantId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ margin: '14px 0 0', color: 'var(--muted)', fontSize: 10.5, lineHeight: 1.6 }}>
            <strong>Target state:</strong> groups, invitations and per-resource permission management are future work (spec §35).
            Today roles are the canonical tenant roles (ADMIN/BUILDER/OPERATOR/APPROVER/VIEWER) enforced server-side.
          </p>
        </div>
      )}
    </AppShell>
  );
}
