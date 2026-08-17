'use client';

import { Cable, Cloud, KeyRound } from 'lucide-react';
import { AppShell } from '@/components/AppShell';

const CONNECTOR_TARGETS = [
  { name: 'Salesforce', note: 'CRM connector · target' },
  { name: 'SAP', note: 'ERP connector · target' },
  { name: 'Google', note: 'Workspace connector · target' },
  { name: 'Slack', note: 'Messaging connector · target' },
  { name: 'MCP', note: 'Interoperability via the MCP registry · target' },
  { name: 'Custom APIs', note: 'Via the endpoint interface · target' },
];

/**
 * External connections (ROUTE_ARCHITECTURE_SPEC §32).
 *
 * Honest target state: no connections domain exists in the platform yet,
 * so this surface shows the connector categories and the platform's
 * guarantees (never expose secrets) without fabricating a single
 * "Connected" status. When provider adapters exist (Tool & MCP spec
 * §22–§23), this page will render real connection records from a
 * connections domain API — never UI-owned state.
 */
export function ConnectionsPage() {
  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Connections</h1>
          <p>External system connections for tools, workflows and agents.</p>
        </div>
      </div>

      <div className="notice-banner">
        <Cable size={15} />
        <span>
          <strong>Target state.</strong> No connections domain exists yet — no provider adapter is wired (Tool &amp; MCP spec §22–§23).
          This page will show real connection records once a connections API exists. Nothing below claims to be connected.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {CONNECTOR_TARGETS.map((connector) => (
          <div className="app-card" key={connector.name} style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span className="wf-icon"><Cloud size={16} /></span>
              <div className="wf-name">
                <strong>{connector.name}</strong>
                <span>{connector.note}</span>
              </div>
            </div>
            <span className="tag tag-gray">Not configured</span>
          </div>
        ))}
      </div>

      <div className="app-card" style={{ marginTop: 14 }}>
        <h2>What a connection will expose</h2>
        <div className="decision-list">
          <div className="decision-item"><strong>Status</strong> · Connected / Last verified / Owner</div>
          <div className="decision-item"><strong>Scopes</strong> · The minimum access the connector requires</div>
          <div className="decision-item"><KeyRound size={12} style={{ verticalAlign: -2 }} /> <strong>Secrets are never exposed</strong> — credentials live in secure infrastructure (Tool &amp; MCP spec §65), never in the UI, workflows, or exports</div>
        </div>
      </div>
    </AppShell>
  );
}
