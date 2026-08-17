'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, formatDurationMs } from '@/components/app-format';
import type { OrcfloMeteringRecord, OrcfloMeteringSummary } from '@/lib/domain/orcflo';

/**
 * Usage & cost (ROUTE_ARCHITECTURE_SPEC §34). Real metering from the
 * Execution Kernel — the summary plus the raw record breakdown, derived
 * from metering records, never unrelated counters. Budget/projection/
 * alerts are honest target state.
 */
export function UsagePage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    summary: OrcfloMeteringSummary;
    records: OrcfloMeteringRecord[];
  }>({ status: 'loading' });

  async function load() {
    try {
      const [summary, records] = await Promise.all([
        requestJson<{ summary: OrcfloMeteringSummary }>('/api/v1/orcflo/metering'),
        requestJson<{ records: OrcfloMeteringRecord[] }>('/api/v1/orcflo/metering/records?limit=200'),
      ]);
      setState({ status: 'ready', summary: summary.summary, records: records.records });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load usage.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Usage</h1>
          <p>Metered execution cost and activity from the kernel.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh usage">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading usage…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load usage</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card"><span className="kpi-label">Runs</span><div className="kpi-value">{state.summary.runs}</div><div className="kpi-note">{formatDurationMs(state.summary.durationMs)} total</div></div>
            <div className="kpi-card"><span className="kpi-label">Steps</span><div className="kpi-value">{state.summary.steps}</div><div className="kpi-note">{state.summary.failedSteps} failed</div></div>
            <div className="kpi-card"><span className="kpi-label">Model calls</span><div className="kpi-value">{state.summary.modelCalls}</div><div className="kpi-note">{state.summary.tokensIn} in · {state.summary.tokensOut} out</div></div>
            <div className="kpi-card"><span className="kpi-label">Cost</span><div className="kpi-value">{formatCostMinor(state.summary.costMinor)}</div><div className="kpi-note">{state.summary.cacheHits} cache hits</div></div>
          </div>

          <div className="app-card">
            <h2>Metering records <span className="count">{state.records.length}</span></h2>
            {state.records.length === 0 ? (
              <div className="state-box"><p>No metering records yet — run a workflow to see activity.</p></div>
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>Metric</th><th>Amount</th><th>Unit</th><th>Run</th><th>When</th></tr>
                </thead>
                <tbody>
                  {state.records.slice(0, 50).map((record) => (
                    <tr key={record.id}>
                      <td><span className="tag tag-cyan">{record.metric}</span></td>
                      <td>{record.amount}</td>
                      <td className="muted">{record.unit}</td>
                      <td className="muted">{record.runId?.slice(0, 14) ?? '—'}</td>
                      <td className="muted">{formatDate(record.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="notice-banner" style={{ marginTop: 14 }}>
            <span><strong>Target state:</strong> budgets, projected usage and alerts are future work (spec §34). Today this page shows actual metered usage.</span>
          </div>
        </>
      )}
    </AppShell>
  );
}
