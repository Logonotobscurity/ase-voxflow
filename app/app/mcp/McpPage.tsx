'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Cable, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import type { McpServerConfig } from '@/lib/domain/schemas';

const TRUST_CHIPS = [
  { level: 'TRUSTED', tone: 'tag-green', note: 'Allowlisted; tools may execute through policy.' },
  { level: 'VERIFIED', tone: 'tag-cyan', note: 'Reviewed but not yet allowlisted.' },
  { level: 'UNVERIFIED', tone: 'tag-orange', note: 'No review; denied by default.' },
  { level: 'BLOCKED', tone: 'tag-red', note: 'Explicitly refused.' },
] as const;

/**
 * MCP control plane (ROUTE_ARCHITECTURE_SPEC §25). Reads the platform's
 * McpServerRegistry — today the fail-closed empty registry, so the page
 * honestly shows the trust model and an empty state. The UI must never
 * itself become the MCP execution layer (spec §25).
 */
export function McpPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    servers: McpServerConfig[];
  }>({ status: 'loading' });

  async function load() {
    try {
      const data = await requestJson<{ servers: McpServerConfig[] }>('/api/v1/mcp/servers');
      setState({ status: 'ready', servers: data.servers });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load MCP servers.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>MCP</h1>
          <p>Model Context Protocol control plane — servers, trust, health and tool access through the registry.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh MCP servers">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading MCP servers…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load MCP servers</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="app-grid">
            <div className="app-card">
              <h2>Servers <span className="count">{state.servers.length}</span></h2>
              {state.servers.length === 0 ? (
                <div className="state-box">
                  <div className="state-icon"><Cable size={20} /></div>
                  <h3>No MCP servers configured</h3>
                  <p>
                    The MCP registry is empty and fail-closed: no transport is implemented in this increment, so no server can be
                    connected or invoked. When a reviewed MCP adapter exists, servers registered here will appear in this list —
                    never in the UI as an execution layer.
                  </p>
                </div>
              ) : (
                <div className="step-list">
                  {state.servers.map((server) => (
                    <div className="step-item" key={server.id}>
                      <div className="step-main">
                        <strong>{server.name}</strong>
                        <span>{server.transport} · {server.endpoint}</span>
                      </div>
                      <span className={`tag ${server.trusted ? 'tag-green' : 'tag-orange'}`}>{server.trusted ? 'TRUSTED' : 'UNVERIFIED'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="app-card">
              <h2>Trust model</h2>
              <div className="decision-list">
                {TRUST_CHIPS.map((chip) => (
                  <div className="decision-item" key={chip.level}>
                    <span className={`tag ${chip.tone}`}>{chip.level}</span>
                    <span style={{ marginLeft: 8, color: 'var(--muted)' }}>{chip.note}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '14px 0 0', color: 'var(--muted)', fontSize: 10.5, lineHeight: 1.6 }}>
                <ShieldCheck size={12} style={{ verticalAlign: -2 }} /> MCP tools flow through the same registry, policy and
                observability as every other tool — a server must be allowlisted and trusted before any of its tools are
                invocable (Tool & MCP spec §33–§40).
              </p>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
