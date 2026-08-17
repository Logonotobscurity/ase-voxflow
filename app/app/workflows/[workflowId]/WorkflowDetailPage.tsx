'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Play, Rocket, Workflow as WorkflowIcon } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, statusTone, titleCase } from '@/components/app-format';
import type { Workflow } from '@/lib/domain/schemas';
import type { OrcfloRun } from '@/lib/domain/orcflo';

/**
 * Workflow detail (ROUTE_ARCHITECTURE_SPEC §20-adjacent; the studio editor
 * lives at /app/canvas). Owned by the Workflow Domain: the page reads the
 * canonical workflow via GET /api/v1/workflows/:id, lists its runs from the
 * Execution Kernel, and mutates only through the same APIs (run, publish).
 */
export function WorkflowDetailPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    workflow: Workflow;
    runs: OrcfloRun[];
  }>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    params.then(({ workflowId: id }) => {
      if (cancelled) return;
      void load(id);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(id: string) {
    try {
      const [wf, runs] = await Promise.all([
        requestJson<{ workflow: Workflow }>(`/api/v1/workflows/${id}`),
        requestJson<{ runs: OrcfloRun[] }>(`/api/v1/orcflo/runs?workflowId=${encodeURIComponent(id)}&limit=10`),
      ]);
      setState({ status: 'ready', workflow: wf.workflow, runs: runs.runs });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load workflow.' });
    }
  }

  async function runWorkflow() {
    if (!state.status || state.status !== 'ready') return;
    setBusy(true);
    setNotice('');
    try {
      const data = await requestJson<{ run: OrcfloRun }>('/api/v1/orcflo/runs', {
        method: 'POST',
        body: JSON.stringify({ workflowId: state.workflow.id }),
      });
      router.push(`/app/runs/${data.run.id}`);
    } catch (e) {
      setNotice(`Run failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!state.status || state.status !== 'ready') return;
    setBusy(true);
    setNotice('');
    try {
      const w = state.workflow;
      const data = await requestJson<{ workflow: Workflow }>('/api/v1/workflows', {
        method: 'POST',
        body: JSON.stringify({
          id: w.id,
          name: w.name,
          description: w.description,
          status: 'READY',
          nodes: w.nodes,
          edges: w.edges,
          metadata: w.metadata,
        }),
      });
      setNotice(`Published as v${data.workflow.version}.`);
      setState({ status: 'ready', workflow: data.workflow, runs: state.runs });
    } catch (e) {
      setNotice(`Publish failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link href="/app/workflows" className="app-shell-link muted" style={{ marginBottom: 14, width: 'fit-content' }}>
        <ArrowLeft size={13} /> Back to workflows
      </Link>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading workflow…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Workflow not found</h3>
            <p>{state.message}</p>
            <Link className="btn btn-dark" href="/app/workflows" style={{ marginTop: 12, fontSize: 11 }}>Back to library</Link>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="detail-hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h1>{state.workflow.name}</h1>
                <div className="sub">
                  <span className={`tag tag-${statusTone(state.workflow.status)}`}>{state.workflow.status}</span>
                  <span>v{state.workflow.version}</span>
                  <span>{state.workflow.nodes.length} nodes · {state.workflow.edges.length} edges</span>
                  <span>Updated {formatDate(state.workflow.updatedAt)}</span>
                </div>
                {state.workflow.description && <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 12 }}>{state.workflow.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <button className="btn btn-dark" onClick={() => void runWorkflow()} disabled={busy || state.workflow.status !== 'READY'} style={{ fontSize: 11 }} title={state.workflow.status !== 'READY' ? 'Publish before running' : 'Start a run'}>
                  <Play size={13} /> {busy ? 'Starting…' : 'Run'}
                </button>
                {state.workflow.status !== 'READY' && (
                  <button className="btn btn-primary" onClick={() => void publish()} disabled={busy} style={{ fontSize: 11 }}>
                    <Rocket size={13} /> Publish
                  </button>
                )}
                <Link className="btn btn-ghost" href="/app/canvas" style={{ fontSize: 11 }}>
                  <WorkflowIcon size={13} /> Studio
                </Link>
              </div>
            </div>
            {notice && <div className="notice-banner" style={{ marginTop: 14, marginBottom: 0 }}>{notice}</div>}
          </div>

          <div className="app-grid">
            <div className="app-card">
              <h2>Nodes <span className="count">{state.workflow.nodes.length}</span></h2>
              <div className="node-list">
                {state.workflow.nodes.map((node) => (
                  <div className="node-item" key={node.id}>
                    <i>{node.type.slice(0, 3)}</i>
                    <span>
                      <strong>{node.label}</strong>
                      <span>{node.id} · {titleCase(node.type)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="app-card">
              <h2>Run history <span className="count">{state.runs.length}</span></h2>
              {state.runs.length === 0 ? (
                <div className="state-box">
                  <h3>No runs yet</h3>
                  <p>Run this workflow (once published) to see executions, the stream and decisions here.</p>
                </div>
              ) : (
                <div className="step-list">
                  {state.runs.map((run) => (
                    <div className="step-item" key={run.id}>
                      <span className={`run-dot ${statusTone(run.status)}`} />
                      <div className="step-main">
                        <strong><Link className="row-link" href={`/app/runs/${run.id}`}>{run.id.slice(0, 18)}</Link></strong>
                        <span>{run.triggerKind ?? 'manual'} · {formatDate(run.startedAt ?? run.createdAt)}</span>
                      </div>
                      <div className="step-meta">
                        <span className={`tag tag-${statusTone(run.status)}`}>{run.status.replace('_', ' ')}</span>
                        <span>{run.output && typeof run.output === 'object' ? formatCostMinor((run.output as { spentMinor?: number }).spentMinor) : ''}</span>
                      </div>
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
