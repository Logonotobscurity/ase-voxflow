'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, Clock3, LayoutGrid, PlaySquare, Plus, RefreshCw, ShieldAlert, Zap,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, formatDurationMs, statusTone } from '@/components/app-format';
import type { Workflow } from '@/lib/domain/schemas';
import type { OrcfloRun, OrcfloMeteringSummary } from '@/lib/domain/orcflo';

/**
 * Mission Control (ROUTE_ARCHITECTURE_SPEC §17). Real counts and a live-ish
 * run feed from the domain APIs: workflows (Workflow Domain), runs and
 * metering (Execution Kernel). Pending approvals are derived from runs in
 * WAITING_APPROVAL — the canonical source, not a frontend copy.
 */
export function DashboardPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    workflows: Workflow[];
    runs: OrcfloRun[];
    summary: OrcfloMeteringSummary;
  }>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const [wf, runs, metering] = await Promise.all([
        requestJson<{ workflows: Workflow[] }>('/api/v1/workflows'),
        requestJson<{ runs: OrcfloRun[] }>('/api/v1/orcflo/runs?limit=12'),
        requestJson<{ summary: OrcfloMeteringSummary }>('/api/v1/orcflo/metering'),
      ]);
      setState({ status: 'ready', workflows: wf.workflows, runs: runs.runs, summary: metering.summary });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load dashboard.' });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const workflowName = (id: string) => state.status === 'ready'
    ? state.workflows.find((w) => w.id === id)?.name ?? id.slice(0, 12)
    : id.slice(0, 12);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Mission Control</h1>
          <p>Active runs, pending approvals, recent outcomes and usage — from the execution kernel.</p>
        </div>
        <div className="app-page-actions">
          <Link href="/app/workflows/new" className="btn btn-dark" style={{ fontSize: 11 }}>
            <Plus size={14} /> New workflow
          </Link>
          <button className="btn btn-ghost" onClick={() => void load()} disabled={refreshing} aria-label="Refresh dashboard">
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="app-card">
          <div className="state-box"><div className="state-icon"><RefreshCw size={20} /></div><p>Loading execution state…</p></div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load Mission Control</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label"><LayoutGrid size={12} /> Workflows</span>
              <div className="kpi-value">{state.workflows.length}</div>
              <div className="kpi-note">{state.workflows.filter((w) => w.status === 'READY').length} ready to run</div>
            </div>
            <div className="kpi-card">
              <span className="kpi-label"><PlaySquare size={12} /> Runs</span>
              <div className="kpi-value">{state.summary.runs}</div>
              <div className="kpi-note">{state.summary.durationMs !== undefined ? `${formatDurationMs(state.summary.durationMs)} total` : ''}</div>
            </div>
            <div className="kpi-card">
              <span className="kpi-label"><Clock3 size={12} /> Pending approvals</span>
              <div className="kpi-value">{state.runs.filter((r) => r.status === 'WAITING_APPROVAL').length}</div>
              <div className="kpi-note">Runs paused for a human</div>
            </div>
            <div className="kpi-card">
              <span className="kpi-label"><Zap size={12} /> Cost</span>
              <div className="kpi-value">{formatCostMinor(state.summary.costMinor)}</div>
              <div className="kpi-note">{state.summary.modelCalls} model calls · {state.summary.steps} steps</div>
            </div>
          </div>

          <div className="app-grid">
            <div className="app-card">
              <h2>Recent runs <span className="count">{state.runs.length}</span></h2>
              {state.runs.length === 0 ? (
                <div className="state-box">
                  <h3>No runs yet</h3>
                  <p>Start a run from a workflow or fire a trigger — the stream and decisions will appear here.</p>
                </div>
              ) : (
                <table className="app-table">
                  <thead>
                    <tr><th>Run</th><th>Workflow</th><th>Status</th><th>Cost</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {state.runs.map((run) => (
                      <tr key={run.id}>
                        <td><Link className="row-link" href={`/app/runs/${run.id}`}>{run.id.slice(0, 14)}</Link></td>
                        <td className="muted">{workflowName(run.workflowId)}</td>
                        <td><span className={`tag tag-${statusTone(run.status)}`}>{run.status.replace('_', ' ')}</span></td>
                        <td className="muted">
                          {run.output && typeof run.output === 'object'
                            ? formatCostMinor((run.output as { spentMinor?: number }).spentMinor)
                            : '—'}
                        </td>
                        <td className="muted">{formatDate(run.startedAt ?? run.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div className="app-card" style={{ marginBottom: 14 }}>
                <h2>Pending approvals <span className="count">{state.runs.filter((r) => r.status === 'WAITING_APPROVAL').length}</span></h2>
                {state.runs.filter((r) => r.status === 'WAITING_APPROVAL').length === 0 ? (
                  <div className="state-box"><p>Nothing waiting for a human.</p></div>
                ) : (
                  <div className="step-list">
                    {state.runs.filter((r) => r.status === 'WAITING_APPROVAL').map((run) => (
                      <div className="step-item" key={run.id}>
                        <span className="step-idx"><ShieldAlert size={12} /></span>
                        <div className="step-main">
                          <strong>{workflowName(run.workflowId)}</strong>
                          <span>{run.id.slice(0, 18)} · {formatDate(run.startedAt)}</span>
                        </div>
                        <Link className="btn btn-ghost" href={`/app/runs/${run.id}`} style={{ fontSize: 10 }}>Review</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="app-card">
                <h2>Failures <span className="count">{state.runs.filter((r) => r.status === 'FAILED').length}</span></h2>
                {state.runs.filter((r) => r.status === 'FAILED').length === 0 ? (
                  <div className="state-box"><p>No failed runs in the recent window.</p></div>
                ) : (
                  <div className="step-list">
                    {state.runs.filter((r) => r.status === 'FAILED').map((run) => (
                      <div className="step-item" key={run.id}>
                        <span className="step-idx"><AlertTriangle size={12} /></span>
                        <div className="step-main">
                          <strong>{workflowName(run.workflowId)}</strong>
                          <span>{String((run.output as { message?: unknown } | undefined)?.message ?? 'Unknown failure')}</span>
                        </div>
                        <Link className="btn btn-ghost" href={`/app/runs/${run.id}`} style={{ fontSize: 10 }}>Inspect</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
