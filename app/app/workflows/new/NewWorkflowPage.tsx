'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, Braces, FilePlus2, Sparkles, Wand2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import type { OrcfloBlueprint } from '@/lib/domain/orcflo';
import type { Workflow } from '@/lib/domain/schemas';

type Mode = 'scratch' | 'blueprint' | 'describe';

/**
 * Primary creation surface (ROUTE_ARCHITECTURE_SPEC §19). Three modes:
 * FROM SCRATCH (creates a real DRAFT workflow), FROM BLUEPRINT (instantiates
 * a real blueprint into a workflow), DESCRIBE GOAL (honest target state —
 * natural-language generation is not wired, so the panel says so and offers
 * the working paths instead of fabricating an LLM result).
 */
export function NewWorkflowPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('scratch');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // scratch
  const [name, setName] = useState('');
  // blueprint
  const [blueprints, setBlueprints] = useState<OrcfloBlueprint[] | null>(null);
  const [bpError, setBpError] = useState('');
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  const [bpValues, setBpValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode !== 'blueprint' || blueprints !== null) return;
    requestJson<{ blueprints: OrcfloBlueprint[] }>('/api/v1/orcflo/blueprints')
      .then((data) => setBlueprints(data.blueprints))
      .catch((e) => setBpError(e instanceof Error ? e.message : 'Failed to load blueprints.'));
  }, [mode, blueprints]);

  async function createScratch() {
    setError('');
    setBusy(true);
    try {
      const data = await requestJson<{ workflow: Workflow }>('/api/v1/workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || 'Untitled workflow',
          description: 'Created from scratch in the workflow builder.',
          status: 'DRAFT',
          version: 1,
          nodes: [{
            id: 'start', type: 'trigger', label: 'Start', configuration: { executionMode: 'demo' },
            retryPolicy: { maxRetries: 0, backoffMs: 0 }, metadata: {},
          }],
          edges: [],
          metadata: { source: 'app-workflows-new' },
        }),
      });
      router.push(`/app/workflows/${data.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workflow.');
    } finally {
      setBusy(false);
    }
  }

  async function instantiateBlueprint() {
    setError('');
    if (!selectedBp) return;
    const blueprint = blueprints?.find((bp) => bp.id === selectedBp);
    if (!blueprint) return;
    setBusy(true);
    try {
      const values: Record<string, unknown> = {};
      for (const parameter of blueprint.parameters) {
        const raw = bpValues[parameter.key];
        if (raw !== undefined && raw !== '') {
          if (parameter.type === 'number') values[parameter.key] = Number(raw);
          else if (parameter.type === 'boolean') values[parameter.key] = raw === 'true';
          else if (parameter.type === 'json') values[parameter.key] = JSON.parse(raw);
          else values[parameter.key] = raw;
        }
      }
      const data = await requestJson<{ workflow: Workflow }>(
        `/api/v1/orcflo/blueprints/${blueprint.id}/instantiate`,
        { method: 'POST', body: JSON.stringify({ values, status: 'READY', workflowName: blueprint.name }) },
      );
      router.push(`/app/workflows/${data.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to instantiate blueprint.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>New workflow</h1>
          <p>Three ways to define work — the graph is always the canonical source of truth.</p>
        </div>
      </div>

      {error && <div className="error-banner"><AlertTriangle size={15} /> {error}</div>}

      <div className="creation-modes">
        <button className={`creation-card ${mode === 'scratch' ? 'selected' : ''}`} onClick={() => setMode('scratch')}>
          <span className="cc-icon"><FilePlus2 size={19} /></span>
          <h3>From scratch</h3>
          <p>Create an empty draft workflow and open it in the visual studio.</p>
        </button>
        <button className={`creation-card ${mode === 'blueprint' ? 'selected' : ''}`} onClick={() => setMode('blueprint')}>
          <span className="cc-icon"><Braces size={19} /></span>
          <h3>From blueprint</h3>
          <p>Instantiate a reusable blueprint into a first-class workflow.</p>
        </button>
        <button className={`creation-card ${mode === 'describe' ? 'selected' : ''}`} onClick={() => setMode('describe')}>
          <span className="cc-icon"><Sparkles size={19} /></span>
          <h3>Describe a goal</h3>
          <p>Natural-language workflow generation — target state, not wired yet.</p>
        </button>
      </div>

      {mode === 'scratch' && (
        <div className="creation-form">
          <label className="field-label">Workflow name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vendor onboarding" />
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-dark" onClick={() => void createScratch()} disabled={busy}>
              {busy ? 'Creating…' : 'Create draft workflow'}
            </button>
          </div>
        </div>
      )}

      {mode === 'blueprint' && (
        <div className="creation-form">
          {bpError && <div className="error-banner">{bpError}</div>}
          {blueprints === null && !bpError && <div className="state-box"><p>Loading blueprints…</p></div>}
          {blueprints !== null && blueprints.length === 0 && (
            <div className="state-box">
              <h3>No blueprints yet</h3>
              <p>Blueprints are created through the API (<code>/api/v1/orcflo/blueprints</code>) — once one exists it appears here.</p>
            </div>
          )}
          {blueprints !== null && blueprints.length > 0 && (
            <>
              {blueprints.map((bp) => (
                <button key={bp.id} className={`bp-pick ${selectedBp === bp.id ? 'selected' : ''}`} onClick={() => setSelectedBp(bp.id)}>
                  <span><strong>{bp.name}</strong><span>{bp.description || `${bp.parameters.length} parameters · v${bp.version}`}</span></span>
                  <span className={`tag ${selectedBp === bp.id ? 'tag-green' : 'tag-gray'}`}>{selectedBp === bp.id ? 'Selected' : 'Select'}</span>
                </button>
              ))}
              {selectedBp && (
                <div style={{ marginTop: 14 }}>
                  {blueprints.find((bp) => bp.id === selectedBp)?.parameters.map((parameter) => (
                    <div key={parameter.key}>
                      <label className="field-label">{parameter.label}{parameter.required ? ' *' : ''}</label>
                      <input
                        className="field"
                        value={bpValues[parameter.key] ?? ''}
                        onChange={(e) => setBpValues((v) => ({ ...v, [parameter.key]: e.target.value }))}
                        placeholder={parameter.type}
                      />
                    </div>
                  ))}
                  <button className="btn btn-dark" style={{ marginTop: 14 }} onClick={() => void instantiateBlueprint()} disabled={busy}>
                    {busy ? 'Instantiating…' : 'Instantiate workflow'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'describe' && (
        <div className="creation-form">
          <label className="field-label">Describe the goal</label>
          <textarea
            className="field"
            placeholder="e.g. Build a system that researches every lead and sends qualified ones to Salesforce."
            aria-describedby="describe-note"
          />
          <div className="notice-banner" id="describe-note" style={{ marginTop: 14 }}>
            <Wand2 size={15} />
            <span>
              Natural-language workflow generation is a target (route spec §19) and is <strong>not wired to a provider</strong>.
              Nothing is generated or executed until a verified generation contract exists. Use <strong>From blueprint</strong> or{' '}
              <strong>From scratch</strong> to create a real workflow today.
            </span>
          </div>
          <button className="btn btn-ghost" disabled title="Not wired — no workflow-generation provider exists">
            <Sparkles size={13} /> Generate workflow (target)
          </button>
        </div>
      )}
    </AppShell>
  );
}
