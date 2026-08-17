'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, GitBranch, RefreshCw, ShieldAlert, X,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, statusTone } from '@/components/app-format';
import type { OrcfloRun, OrcfloRunEvent, OrcfloDecisionRecord } from '@/lib/domain/orcflo';

/**
 * Execution Observatory (ROUTE_ARCHITECTURE_SPEC §27) — "executed ≠ verified"
 * is visible here. All state comes from the Execution Kernel: the run
 * aggregate, its persisted decisions, and the replayable event stream.
 * Approval mutations go through the governance API and expose the
 * permission state honestly when the demo identity lacks approval:decide.
 */
export function RunDetailPage({ params }: { params: Promise<{ executionId: string }> }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    run: OrcfloRun;
    decisions: OrcfloDecisionRecord[];
    events: OrcfloRunEvent[];
  }>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    params.then(({ executionId: id }) => {
      if (cancelled) return;
      setRunId(id);
      void load(id);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadEvents(id: string): Promise<OrcfloRunEvent[]> {
    try {
      const response = await fetch(`/api/v1/orcflo/runs/${id}/stream`, { cache: 'no-store' });
      if (!response.ok) return [];
      const text = await response.text();
      const events: OrcfloRunEvent[] = [];
      let data = '';
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) data += line.slice(6);
        if (line.startsWith('event: ')) {
          if (data) {
            try { events.push(JSON.parse(data) as OrcfloRunEvent); } catch { /* skip malformed */ }
            data = '';
          }
        }
      }
      if (data) { try { events.push(JSON.parse(data) as OrcfloRunEvent); } catch { /* skip */ } }
      return events;
    } catch {
      return [];
    }
  }

  async function load(id: string) {
    try {
      const [runData, decisionsData, events] = await Promise.all([
        requestJson<{ run: OrcfloRun }>(`/api/v1/orcflo/runs/${id}`),
        requestJson<{ decisions: OrcfloDecisionRecord[] }>(`/api/v1/orcflo/runs/${id}/decisions`).catch(() => ({ decisions: [] as OrcfloDecisionRecord[] })),
        loadEvents(id),
      ]);
      setState({ status: 'ready', run: runData.run, decisions: decisionsData.decisions, events });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load run.' });
    }
  }

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!runId) return;
    setBusy(true);
    setApprovalNotice('');
    try {
      const data = await requestJson<{ run: OrcfloRun }>(`/api/v1/orcflo/runs/${runId}/approval`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setState({ status: 'ready', run: data.run, decisions: state.status === 'ready' ? state.decisions : [], events: state.status === 'ready' ? state.events : [] });
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      if (err.code === 'AUTHORIZATION_DENIED' || err.status === 403) {
        setApprovalNotice('Approval decisions require the APPROVER role. The demo identity (Ada M.) is BUILDER — switch to an APPROVER session to decide.');
      } else {
        setApprovalNotice(err.message ?? 'Approval failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link href="/app/dashboard" className="app-shell-link muted" style={{ marginBottom: 14, width: 'fit-content' }}>
        <ArrowLeft size={13} /> Mission Control
      </Link>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading execution…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Run not found</h3>
            <p>{state.message}</p>
            <Link className="btn btn-dark" href="/app/dashboard" style={{ marginTop: 12, fontSize: 11 }}>Back to dashboard</Link>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="detail-hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h1>Run {state.run.id.slice(0, 18)}</h1>
                <div className="sub">
                  <span className={`tag tag-${statusTone(state.run.status)}`}>{state.run.status.replace('_', ' ')}</span>
                  <span>{state.run.triggerKind ?? 'manual'} trigger</span>
                  <span>Workflow {state.run.workflowId.slice(0, 16)}</span>
                  <span>Started {formatDate(state.run.startedAt ?? state.run.createdAt)}</span>
                  {state.run.completedAt && <span>Finished {formatDate(state.run.completedAt)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost" onClick={() => runId && void load(runId)} disabled={busy} style={{ fontSize: 11 }}>
                  <RefreshCw size={13} /> Refresh
                </button>
                {state.run.status === 'WAITING_APPROVAL' && (
                  <>
                    <button className="btn btn-primary" onClick={() => void decide('APPROVED')} disabled={busy} style={{ fontSize: 11 }}>
                      <Check size={13} /> Approve
                    </button>
                    <button className="btn btn-danger" onClick={() => void decide('REJECTED')} disabled={busy} style={{ fontSize: 11 }}>
                      <X size={13} /> Reject
                    </button>
                  </>
                )}
              </div>
            </div>
            {approvalNotice && <div className="notice-banner" style={{ marginTop: 14, marginBottom: 0 }}><ShieldAlert size={15} /> {approvalNotice}</div>}
            {state.run.approval && (
              <div className="sub" style={{ marginTop: 10 }}>
                <span className={`tag ${state.run.approval.decision === 'APPROVED' ? 'tag-green' : 'tag-red'}`}>
                  {state.run.approval.decision} by {state.run.approval.decidedBy ?? 'unknown'}
                </span>
                {state.run.approval.reason && <span>{state.run.approval.reason}</span>}
              </div>
            )}
          </div>

          {state.run.status === 'WAITING_APPROVAL' && (
            <div className="approval-panel">
              <h2><ShieldAlert size={16} style={{ verticalAlign: -2 }} /> Waiting for human approval</h2>
              <p>Execution paused at a governed boundary. Approving resumes from the approval node; rejecting cancels the run.</p>
            </div>
          )}

          <div className="obs-grid">
            <div className="obs-card">
              <h2>Steps <span className="count">{state.run.steps.length}</span></h2>
              <div className="step-list">
                {state.run.steps.length === 0 ? (
                  <div className="state-box"><p>No steps recorded yet.</p></div>
                ) : (
                  state.run.steps.map((step, index) => (
                    <div className="step-item" key={`${step.nodeId}-${index}`}>
                      <span className="step-idx">{index + 1}</span>
                      <span className={`run-dot ${statusTone(step.status)}`} />
                      <div className="step-main">
                        <strong>{step.nodeId} {step.iteration > 0 ? `· iter ${step.iteration}` : ''}</strong>
                        <span>{step.status} · {step.cacheHit ? 'cache hit' : `${formatCostMinor(step.costMinor)}`}{step.evidenceCount ? ` · ${step.evidenceCount} evidence` : ''}</span>
                      </div>
                      <div className="step-meta">
                        <span className={`tag tag-${statusTone(step.status)}`}>{step.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="obs-card">
              <h2>Inputs</h2>
              <pre className="obs-code">{JSON.stringify(state.run.input, null, 2)}</pre>
              {state.run.output !== undefined && (
                <>
                  <h2 style={{ marginTop: 16 }}>Outcome</h2>
                  <pre className="obs-code">{JSON.stringify(state.run.output, null, 2)}</pre>
                </>
              )}
            </div>
          </div>

          <div className="obs-grid">
            <div className="obs-card">
              <h2>Event stream <span className="count">{state.events.length}</span></h2>
              {state.events.length === 0 ? (
                <div className="state-box"><p>The run stream is empty or unavailable.</p></div>
              ) : (
                <div className="step-list">
                  {state.events.map((event) => (
                    <div className="step-item" key={event.id}>
                      <span className="step-idx">{event.sequence}</span>
                      <div className="step-main">
                        <strong>{event.eventType}</strong>
                        <span>{event.nodeId ?? ''} {formatDate(event.occurredAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="obs-card">
              <h2>Decisions <span className="count">{state.decisions.length}</span></h2>
              {state.decisions.length === 0 ? (
                <div className="state-box"><p>No control-node decisions were recorded for this run.</p></div>
              ) : (
                <div className="decision-list">
                  {state.decisions.map((decision) => (
                    <div className="decision-item" key={decision.id}>
                      <strong>{decision.kind}</strong> · {decision.nodeId}
                      <span style={{ color: 'var(--muted)' }}> ({decision.subject})</span>
                      <pre style={{ margin: '6px 0 0', fontSize: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(decision.result)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {state.run.status === 'FAILED' && state.run.output && typeof state.run.output === 'object' && (
            <div className="app-card">
              <h2><GitBranch size={14} style={{ verticalAlign: -2 }} /> Failure</h2>
              <pre className="obs-code">{JSON.stringify(state.run.output, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
