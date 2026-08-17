'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, RefreshCw, Search, Wrench } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, statusTone } from '@/components/app-format';
import type { ToolDefinition } from '@/lib/domain/schemas';

const RISK_TONE: Record<string, 'green' | 'orange' | 'red' | 'gray'> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
  CRITICAL: 'red',
};

/**
 * Tool registry (ROUTE_ARCHITECTURE_SPEC §24). Real ToolDefinition
 * records from the canonical registry (the same ones agents and
 * workflows resolve); risk, availability, cost and permissions are shown
 * per the Tool & MCP spec §04/§07/§08.
 */
export function ToolsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    tools: ToolDefinition[];
  }>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [riskOnly, setRiskOnly] = useState<string | null>(null);

  async function load() {
    try {
      const data = await requestJson<{ tools: ToolDefinition[] }>('/api/v1/tools');
      setState({ status: 'ready', tools: data.tools });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load tools.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.tools
      .filter((tool) => tool.name.toLowerCase().includes(query.toLowerCase()))
      .filter((tool) => !riskOnly || tool.riskLevel === riskOnly);
  }, [state, query, riskOnly]);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Tools</h1>
          <p>The canonical tool registry — the same ToolDefinition records agents and workflows resolve through one executor.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh tools">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading tools…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load tools</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="filter-bar">
            <span className="filter-search-wrap"><Search size={13} /><input className="filter-search" placeholder="Search tools…" value={query} onChange={(e) => setQuery(e.target.value)} /></span>
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((risk) => (
              <button key={risk} className={`filter-btn ${riskOnly === risk ? 'active' : ''}`} onClick={() => setRiskOnly(riskOnly === risk ? null : risk)} aria-pressed={riskOnly === risk}>
                {risk}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="app-card">
              <div className="state-box">
                <div className="state-icon"><Wrench size={20} /></div>
                <h3>{query || riskOnly ? 'No tools match' : 'No tools yet'}</h3>
                <p>
                  {query || riskOnly
                    ? 'Try a different search or risk filter.'
                    : 'Tools are registered through the canonical registry — e.g. via the workflow-as-tool bridge (POST /api/v1/orcflo/workflows/:id/tool) — and appear here.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
              {visible.map((tool) => (
                <div className="app-card" key={tool.id} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span className="wf-icon"><Boxes size={16} /></span>
                    <div className="wf-name">
                      <strong>{tool.name}</strong>
                      <span>{tool.id}</span>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 11, lineHeight: 1.55 }}>{tool.description}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className={`tag tag-${RISK_TONE[tool.riskLevel] ?? 'gray'}`}>{tool.riskLevel}</span>
                    <span className={`tag tag-${statusTone(tool.availability)}`}>{tool.availability}</span>
                    {tool.metadata?.orcfloTool === true && <span className="tag tag-cyan">workflow-as-tool</span>}
                  </div>
                  <div className="decision-list">
                    <div className="decision-item"><strong>Cost</strong> · {formatCostMinor(tool.cost.amountMinor, tool.cost.currency)}</div>
                    <div className="decision-item"><strong>Timeout</strong> · {tool.timeoutMs}ms</div>
                    <div className="decision-item"><strong>Permissions</strong> · {tool.permissions.length === 0 ? 'none' : tool.permissions.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
