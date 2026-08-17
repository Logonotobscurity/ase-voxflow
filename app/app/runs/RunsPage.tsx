'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PlaySquare, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, statusTone } from '@/components/app-format';
import type { OrcfloRun, OrcfloRunStatus } from '@/lib/domain/orcflo';

const STATUSES: Array<OrcfloRunStatus | 'ALL'> = ['ALL', 'COMPLETED', 'WAITING_APPROVAL', 'RUNNING', 'PENDING', 'FAILED', 'CANCELLED'];

/**
 * Global execution history (ROUTE_ARCHITECTURE_SPEC §26). Real runs from
 * the Execution Kernel with status filtering; each row opens the
 * Execution Observatory.
 */
export function RunsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    runs: OrcfloRun[];
  }>({ status: 'loading' });
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('ALL');

  async function load() {
    try {
      const data = await requestJson<{ runs: OrcfloRun[] }>('/api/v1/orcflo/runs?limit=50');
      setState({ status: 'ready', runs: data.runs });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load runs.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.runs.filter((run) => filter === 'ALL' || run.status === filter);
  }, [state, filter]);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Runs</h1>
          <p>Execution history from the kernel — every run, its stream, decisions and outcome.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh runs">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading runs…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load runs</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="filter-bar">
            {STATUSES.map((status) => (
              <button key={status} className={`filter-btn ${filter === status ? 'active' : ''}`} onClick={() => setFilter(status)} aria-pressed={filter === status}>
                {status === 'ALL' ? 'All' : status.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="app-card">
            {visible.length === 0 ? (
              <div className="state-box">
                <div className="state-icon"><PlaySquare size={20} /></div>
                <h3>No runs match</h3>
                <p>Run a workflow from its detail page and it will appear here.</p>
              </div>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>Run</th><th>Status</th><th>Trigger</th><th>Started</th><th>Cost</th><th /></tr>
                </thead>
                <tbody>
                  {visible.map((run) => (
                    <tr key={run.id}>
                      <td><Link className="row-link" href={`/app/runs/${run.id}`}>{run.id.slice(0, 18)}</Link></td>
                      <td><span className={`tag tag-${statusTone(run.status)}`}>{run.status.replace('_', ' ')}</span></td>
                      <td className="muted">{run.triggerKind ?? 'manual'}</td>
                      <td className="muted">{formatDate(run.startedAt ?? run.createdAt)}</td>
                      <td className="muted">{run.output && typeof run.output === 'object' ? formatCostMinor((run.output as { spentMinor?: number }).spentMinor) : '—'}</td>
                      <td><Link className="btn btn-ghost" href={`/app/runs/${run.id}`} style={{ fontSize: 10 }}>Open</Link></td>
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
