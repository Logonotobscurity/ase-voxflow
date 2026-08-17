'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatCostMinor, formatDate, statusTone, titleCase } from '@/components/app-format';
import type { Agent } from '@/lib/domain/schemas';

/**
 * Agent command center (ROUTE_ARCHITECTURE_SPEC §23). Shows structured
 * identity, objective, tools, permissions, policies and budget from the
 * Agent Runtime — never raw chain-of-thought (the domain has none to
 * show; decisions/actions/evidence live on runs, which the run surfaces
 * expose).
 */
export function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    agent: Agent;
  }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    params.then(({ agentId }) => {
      if (cancelled) return;
      void load(agentId);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(id: string) {
    try {
      const data = await requestJson<{ agent: Agent }>(`/api/v1/agents/${id}`);
      setState({ status: 'ready', agent: data.agent });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load agent.' });
    }
  }

  return (
    <AppShell>
      <Link href="/app/agents" className="app-shell-link muted" style={{ marginBottom: 14, width: 'fit-content' }}>
        <ArrowLeft size={13} /> Back to agents
      </Link>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading agent…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Agent not found</h3>
            <p>{state.message}</p>
            <Link className="btn btn-dark" href="/app/agents" style={{ marginTop: 12, fontSize: 11 }}>Back to registry</Link>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="detail-hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span className="wf-icon" style={{ width: 46, height: 46, borderRadius: 14 }}><Bot size={22} /></span>
                <div>
                  <h1>{state.agent.name}</h1>
                  <div className="sub">
                    <span className={`tag tag-${statusTone(state.agent.status)}`}>{state.agent.status}</span>
                    <span>v{state.agent.version}</span>
                    <span>{state.agent.role}</span>
                    <span>Created {formatDate(state.agent.createdAt)}</span>
                  </div>
                  <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 12 }}>{state.agent.description}</p>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => void load(state.agent.id)} style={{ fontSize: 11 }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>

          <div className="app-grid">
            <div className="app-card">
              <h2>Objective</h2>
              <div className="step-list">
                {state.agent.goals.map((goal, index) => (
                  <div className="step-item" key={index}>
                    <span className="step-idx">{index + 1}</span>
                    <div className="step-main"><strong>{goal}</strong></div>
                  </div>
                ))}
              </div>
              <h2 style={{ marginTop: 18 }}>Instructions</h2>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--ink-soft)', margin: 0 }}>{state.agent.instructions}</p>
            </div>

            <div>
              <div className="app-card" style={{ marginBottom: 14 }}>
                <h2>Authority</h2>
                <div className="decision-list">
                  <div className="decision-item"><strong>Tools</strong> · {state.agent.toolIds.length === 0 ? 'none assigned' : state.agent.toolIds.join(', ')}</div>
                  <div className="decision-item"><strong>Permissions</strong> · {state.agent.permissions.length === 0 ? 'none' : state.agent.permissions.join(', ')}</div>
                  <div className="decision-item"><strong>Capabilities</strong> · {state.agent.capabilities.length === 0 ? 'none' : state.agent.capabilities.join(', ')}</div>
                  <div className="decision-item"><strong>Environments</strong> · {state.agent.policies.allowedEnvironments.join(', ')}</div>
                  <div className="decision-item"><strong>Data</strong> · {state.agent.policies.dataClassification} · retention {state.agent.policies.retentionDays}d</div>
                </div>
              </div>
              <div className="app-card">
                <h2>Limits & budget</h2>
                <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 0 }}>
                  <div className="kpi-card"><span className="kpi-label">Iterations</span><div className="kpi-value" style={{ fontSize: 19 }}>{state.agent.policies.limits.maxIterations}</div></div>
                  <div className="kpi-card"><span className="kpi-label">Duration</span><div className="kpi-value" style={{ fontSize: 19 }}>{state.agent.policies.limits.maxDurationMs / 1000}s</div></div>
                  <div className="kpi-card"><span className="kpi-label">Tool calls</span><div className="kpi-value" style={{ fontSize: 19 }}>{state.agent.policies.limits.maxToolCalls}</div></div>
                  <div className="kpi-card"><span className="kpi-label">Budget</span><div className="kpi-value" style={{ fontSize: 19 }}>{formatCostMinor(state.agent.policies.limits.maxBudgetMinor)}</div></div>
                </div>
              </div>
            </div>
          </div>

          <div className="app-card">
            <h2><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> How this agent executes</h2>
            <p style={{ fontSize: 11, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0 }}>
              This agent runs through the canonical Agent Runtime ({titleCase(state.agent.role)} role). Inside a workflow it executes as an{' '}
              <code>agent</code> node; outside, the runtime bounds it by the limits above. Raw chain-of-thought is never stored or exposed —
              structured decisions, actions, evidence and outcomes live on runs (see <Link href="/app/runs" className="row-link">Runs</Link>).
            </p>
          </div>
        </>
      )}
    </AppShell>
  );
}
