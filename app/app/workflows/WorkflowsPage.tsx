'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, Search, Workflow as WorkflowIcon } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatDate, statusTone } from '@/components/app-format';
import type { Workflow, WorkflowStatus } from '@/lib/domain/schemas';

const STATUSES: Array<WorkflowStatus | 'ALL'> = ['ALL', 'READY', 'DRAFT', 'PAUSED', 'ARCHIVED'];

/**
 * Operational workflow library (ROUTE_ARCHITECTURE_SPEC §18). Source of
 * truth is the canonical workflow repository via /api/v1/workflows; the
 * page only filters/sorts what the domain returns.
 */
export function WorkflowsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    workflows: Workflow[];
  }>({ status: 'loading' });
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('ALL');
  const [query, setQuery] = useState('');

  async function load() {
    try {
      const data = await requestJson<{ workflows: Workflow[] }>('/api/v1/workflows');
      setState({ status: 'ready', workflows: data.workflows });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load workflows.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.workflows
      .filter((w) => filter === 'ALL' || w.status === filter)
      .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [state, filter, query]);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Workflows</h1>
          <p>The canonical workflow library — drafts, published and archived definitions.</p>
        </div>
        <div className="app-page-actions">
          <Link href="/app/workflows/new" className="btn btn-dark" style={{ fontSize: 11 }}>
            <Plus size={14} /> New workflow
          </Link>
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh workflows">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="app-card"><div className="state-box"><p>Loading workflows…</p></div></div>
      )}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load workflows</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="filter-bar">
            {STATUSES.map((status) => (
              <button
                key={status}
                className={`filter-btn ${filter === status ? 'active' : ''}`}
                onClick={() => setFilter(status)}
                aria-pressed={filter === status}
              >
                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
            <span className="filter-search-wrap"><Search size={13} /><input className="filter-search" placeholder="Search workflows…" value={query} onChange={(e) => setQuery(e.target.value)} /></span>
          </div>

          <div className="app-card">
            {visible.length === 0 ? (
              <div className="state-box">
                <div className="state-icon"><WorkflowIcon size={20} /></div>
                <h3>{query || filter !== 'ALL' ? 'No workflows match' : 'No workflows yet'}</h3>
                <p>
                  {query || filter !== 'ALL'
                    ? 'Try a different filter or search term.'
                    : 'Create your first workflow from scratch, from a blueprint, or by describing a goal.'}
                </p>
                {!query && filter === 'ALL' && (
                  <Link className="btn btn-dark" href="/app/workflows/new" style={{ marginTop: 12, fontSize: 11 }}>
                    <Plus size={14} /> New workflow
                  </Link>
                )}
              </div>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>Workflow</th><th>Status</th><th>Version</th><th>Nodes</th><th>Updated</th><th /></tr>
                </thead>
                <tbody>
                  {visible.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <Link className="row-link" href={`/app/workflows/${w.id}`}>
                          <div className="wf-row">
                            <span className="wf-icon"><WorkflowIcon size={16} /></span>
                            <span className="wf-name">
                              <strong>{w.name}</strong>
                              <span>{w.description || w.id}</span>
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td><span className={`tag tag-${statusTone(w.status)}`}>{w.status}</span></td>
                      <td className="muted">v{w.version}</td>
                      <td className="muted">{w.nodes.length}</td>
                      <td className="muted">{formatDate(w.updatedAt)}</td>
                      <td>
                        <Link className="btn btn-ghost" href={`/app/workflows/${w.id}`} style={{ fontSize: 10 }}>Open</Link>
                      </td>
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
