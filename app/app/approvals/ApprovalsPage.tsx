'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatDate, statusTone } from '@/components/app-format';
import type { OrcfloRun } from '@/lib/domain/orcflo';

/**
 * Human intervention inbox (ROUTE_ARCHITECTURE_SPEC §29). Source of truth
 * is the Execution Kernel: runs in WAITING_APPROVAL (waiting) and runs
 * with a persisted approval decision (decided). Approve/Reject mutate
 * through the governance API; the demo identity (BUILDER) sees the
 * permission state honestly instead of a fabricated decision.
 */
export function ApprovalsPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    runs: OrcfloRun[];
  }>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const data = await requestJson<{ runs: OrcfloRun[] }>('/api/v1/orcflo/runs?limit=100');
      setState({ status: 'ready', runs: data.runs });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load approvals.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(run: OrcfloRun, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(run.id);
    setNotice('');
    try {
      await requestJson<{ run: OrcfloRun }>(`/api/v1/orcflo/runs/${run.id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      if (err.code === 'AUTHORIZATION_DENIED' || err.status === 403) {
        setNotice('Approval decisions require the APPROVER role. The demo identity (Ada M.) is BUILDER — switch to an APPROVER session to decide.');
      } else {
        setNotice(err.message ?? 'Approval failed.');
      }
    } finally {
      setBusyId(null);
    }
  }

  const waiting = state.status === 'ready' ? state.runs.filter((r) => r.status === 'WAITING_APPROVAL') : [];
  const decided = state.status === 'ready' ? state.runs.filter((r) => r.approval) : [];

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Approvals</h1>
          <p>Human intervention inbox — governance over consequential execution.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh approvals">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {notice && <div className="notice-banner"><ShieldAlert size={15} /> {notice}</div>}
      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading approvals…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load approvals</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="app-grid">
            <div className="app-card">
              <h2>Waiting <span className="count">{waiting.length}</span></h2>
              {waiting.length === 0 ? (
                <div className="state-box"><p>Nothing waiting for a human. 🎉</p></div>
              ) : (
                <div className="step-list">
                  {waiting.map((run) => (
                    <div className="step-item" key={run.id}>
                      <span className={`run-dot ${statusTone(run.status)}`} />
                      <div className="step-main">
                        <strong><Link className="row-link" href={`/app/runs/${run.id}`}>{run.id.slice(0, 18)}</Link></strong>
                        <span>{run.triggerKind ?? 'manual'} · {formatDate(run.startedAt)}</span>
                      </div>
                      <button className="btn btn-primary" onClick={() => void decide(run, 'APPROVED')} disabled={busyId === run.id} style={{ fontSize: 10 }}><Check size={12} /> Approve</button>
                      <button className="btn btn-danger" onClick={() => void decide(run, 'REJECTED')} disabled={busyId === run.id} style={{ fontSize: 10 }}><X size={12} /> Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="app-card">
              <h2>Decided <span className="count">{decided.length}</span></h2>
              {decided.length === 0 ? (
                <div className="state-box"><p>No decided approvals yet.</p></div>
              ) : (
                <div className="step-list">
                  {decided.map((run) => (
                    <div className="step-item" key={run.id}>
                      <span className={`run-dot ${statusTone(run.approval!.decision === 'APPROVED' ? 'COMPLETED' : 'CANCELLED')}`} />
                      <div className="step-main">
                        <strong><Link className="row-link" href={`/app/runs/${run.id}`}>{run.id.slice(0, 18)}</Link></strong>
                        <span>{run.approval!.decision} by {run.approval!.decidedBy ?? 'unknown'} · {formatDate(run.approval!.decidedAt)}</span>
                      </div>
                      <span className={`tag ${run.approval!.decision === 'APPROVED' ? 'tag-green' : 'tag-red'}`}>{run.approval!.decision}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
