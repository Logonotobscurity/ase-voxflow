'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ScrollText } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import { formatDate } from '@/components/app-format';
import type { DomainEvent } from '@/lib/domain/schemas';

/**
 * Enterprise audit trail (ROUTE_ARCHITECTURE_SPEC §36). Comes from the
 * authoritative backend domain-event log (the transactional-outbox
 * envelope) via GET /api/v1/events — never a UI-owned copy.
 */
export function AuditPage() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | {
    status: 'ready';
    events: DomainEvent[];
  }>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  async function load() {
    try {
      const data = await requestJson<{ events: DomainEvent[] }>('/api/v1/events?limit=200');
      setState({ status: 'ready', events: data.events });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Failed to load audit events.' });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const types = useMemo(() => {
    if (state.status !== 'ready') return [] as string[];
    return [...new Set(state.events.map((e) => e.eventType))].sort();
  }, [state]);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.events.filter((event) => typeFilter === 'ALL' || event.eventType === typeFilter);
  }, [state, typeFilter]);

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>Audit</h1>
          <p>Authoritative domain-event trail — the same envelope the transactional outbox publishes.</p>
        </div>
        <div className="app-page-actions">
          <button className="btn btn-ghost" onClick={() => void load()} aria-label="Refresh audit trail">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <div className="app-card"><div className="state-box"><p>Loading audit events…</p></div></div>}
      {state.status === 'error' && (
        <div className="app-card">
          <div className="state-box">
            <div className="state-icon"><AlertTriangle size={20} /></div>
            <h3>Could not load audit events</h3>
            <p>{state.message}</p>
            <button className="btn btn-dark" style={{ marginTop: 12, fontSize: 11 }} onClick={() => void load()}>Retry</button>
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="filter-bar">
            <button className={`filter-btn ${typeFilter === 'ALL' ? 'active' : ''}`} onClick={() => setTypeFilter('ALL')}>All</button>
            {types.map((type) => (
              <button key={type} className={`filter-btn ${typeFilter === type ? 'active' : ''}`} onClick={() => setTypeFilter(type)} aria-pressed={typeFilter === type}>
                {type}
              </button>
            ))}
          </div>
          <div className="app-card">
            {visible.length === 0 ? (
              <div className="state-box">
                <div className="state-icon"><ScrollText size={20} /></div>
                <h3>No events match</h3>
                <p>Run workflows or execute agents to generate domain events here.</p>
              </div>
            ) : (
              <div className="step-list">
                {visible.slice(0, 100).map((event) => (
                  <div className="step-item" key={event.id}>
                    <span className="step-idx">{event.eventType.split('.')[1]?.slice(0, 3) ?? 'evt'}</span>
                    <div className="step-main">
                      <strong>{event.eventType}</strong>
                      <span>{event.aggregateType} {event.aggregateId.slice(0, 18)} · actor {event.actorId ?? 'system'} · corr {event.correlationId.slice(0, 10)}</span>
                    </div>
                    <div className="step-meta"><span>{formatDate(event.occurredAt)}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
