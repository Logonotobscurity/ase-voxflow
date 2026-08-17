'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Plus, RefreshCw, Search } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatDate, statusTone } from '@/components/app-format';
import type { Agent } from '@/lib/domain/schemas';

/**
 * Agent registry (ROUTE_ARCHITECTURE_SPEC §21). Real agents from the
 * Agent Runtime via /api/v1/agents; each row opens the command center.
 */
export function AgentsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    agents: Agent[];
  }>({ status: 'loading' });
  const [query, setQuery] = useState('');

  async function load() {
    try {
      const data = await requestJson<{ agents: Agent[] }>('/api/v1/agents');
      setState({ status: 'ready', agents: data.agents });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load agents.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.agents.filter((agent) => agent.name.toLowerCase().includes(query.toLowerCase()));
  }, [state, query]);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Agents</h1>
          <p>The agent registry — bounded autonomous decision-makers on the Agent Runtime.</p>
        </div>
        <div className="app-page-actions">
          <Link href="/app/agents/new" className="btn btn-dark" style={{ fontSize: 11 }}>
            <Plus size={14} /> New agent
          </Link>
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh agents">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading agents…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load agents</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="filter-bar">
            <span className="filter-search-wrap"><Search size={13} /><input className="filter-search" placeholder="Search agents…" value={query} onChange={(e) => setQuery(e.target.value)} /></span>
          </div>
          <div className="app-card">
            {visible.length === 0 ? (
              <div className="state-box">
                <div className="state-icon"><Bot size={20} /></div>
                <h3>{query ? 'No agents match' : 'No agents yet'}</h3>
                <p>
                  {query
                    ? 'Try a different search term.'
                    : 'Create an agent with an objective, instructions, tools and a bounded budget — then it can run as a workflow node or through the Agent Runtime.'}
                </p>
                {!query && (
                  <Link className="btn btn-dark" href="/app/agents/new" style={{ marginTop: 12, fontSize: 11 }}>
                    <Plus size={14} /> New agent
                  </Link>
                )}
              </div>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>Agent</th><th>Status</th><th>Role</th><th>Tools</th><th>Budget</th><th>Updated</th><th /></tr>
                </thead>
                <tbody>
                  {visible.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <Link className="row-link" href={`/app/agents/${agent.id}`}>
                          <div className="wf-row">
                            <span className="wf-icon"><Bot size={16} /></span>
                            <span className="wf-name">
                              <strong>{agent.name}</strong>
                              <span>{agent.goals[0] ?? agent.description}</span>
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td><span className={`tag tag-${statusTone(agent.status)}`}>{agent.status}</span></td>
                      <td className="muted">{agent.role}</td>
                      <td className="muted">{agent.toolIds.length}</td>
                      <td className="muted">{agent.policies.limits.maxBudgetMinor !== undefined ? `NGN ${agent.policies.limits.maxBudgetMinor / 100}` : '—'}</td>
                      <td className="muted">{formatDate(agent.updatedAt)}</td>
                      <td><Link className="btn btn-ghost" href={`/app/agents/${agent.id}`} style={{ fontSize: 10 }}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
