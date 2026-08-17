'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { requestJson } from '@/components/client-api';
import type { Agent } from '@/lib/domain/schemas';

/**
 * Agent builder (ROUTE_ARCHITECTURE_SPEC §22). Schema-backed: the form
 * maps 1:1 to AgentCreateSchema and creates a real REGISTERED agent via
 * POST /api/v1/agents. Tool/permission selectors use free-form comma
 * lists in this wave (a selector against the tool registry is Wave 3);
 * the builder never fabricates agent state.
 */
export function NewAgentPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    role: 'operator',
    goals: '',
    instructions: '',
    toolIds: '',
    capabilities: '',
    permissions: '',
    maxIterations: '6',
    maxDurationMs: '30000',
    maxBudgetMinor: '100000',
    allowedEnvironments: 'demo',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function create() {
    setError('');
    setBusy(true);
    try {
      const goals = form.goals.split('\n').map((g) => g.trim()).filter(Boolean);
      if (goals.length === 0) throw new Error('Add at least one goal.');
      const data = await requestJson<{ agent: Agent }>('/api/v1/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || 'Agent created in the builder.',
          role: form.role.trim(),
          goals,
          instructions: form.instructions.trim() || 'Follow your objective within your granted capabilities.',
          toolIds: form.toolIds.split(',').map((t) => t.trim()).filter(Boolean),
          capabilities: form.capabilities.split(',').map((c) => c.trim()).filter(Boolean),
          permissions: form.permissions.split(',').map((p) => p.trim()).filter(Boolean),
          policies: {
            limits: {
              maxIterations: Number(form.maxIterations) || 6,
              maxDurationMs: Number(form.maxDurationMs) || 30_000,
              maxBudgetMinor: Number(form.maxBudgetMinor) || 100_000,
              maxToolCalls: 12,
              maxNoProgressIterations: 3,
            },
            requireApprovalFor: [],
            allowedEnvironments: form.allowedEnvironments.split(',').map((e) => e.trim()).filter(Boolean) as Agent['policies']['allowedEnvironments'],
            dataClassification: 'INTERNAL',
            retentionDays: 30,
          },
          metadata: { source: 'app-agents-new' },
        }),
      });
      router.push(`/app/agents/${data.agent.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="app-page-head">
        <div>
          <h1>New agent</h1>
          <p>A bounded autonomous decision-maker — identity, objective, tools, permissions and budget.</p>
        </div>
      </div>

      {error && <div className="error-banner"><AlertTriangle size={15} /> {error}</div>}

      <div className="creation-form">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="field-label">Name *</label>
            <input className="field" value={form.name} onChange={set('name')} placeholder="e.g. Sales research agent" />
          </div>
          <div>
            <label className="field-label">Role *</label>
            <input className="field" value={form.role} onChange={set('role')} placeholder="e.g. operator" />
          </div>
        </div>
        <label className="field-label">Description</label>
        <input className="field" value={form.description} onChange={set('description')} placeholder="What this agent is for" />

        <label className="field-label">Goals * (one per line)</label>
        <textarea className="field" value={form.goals} onChange={set('goals')} placeholder={'Research prospective customers\nScore them against qualification criteria\nAdd qualified companies to the CRM'} />

        <label className="field-label">Instructions</label>
        <textarea className="field" value={form.instructions} onChange={set('instructions')} placeholder="Behavioral expectations — not security controls." />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="field-label">Tool ids (comma-separated)</label>
            <input className="field" value={form.toolIds} onChange={set('toolIds')} placeholder="tool_lookup, tool_research" />
          </div>
          <div>
            <label className="field-label">Permissions (comma-separated)</label>
            <input className="field" value={form.permissions} onChange={set('permissions')} placeholder="crm.read, vendor.lookup" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="field-label">Capabilities (comma-separated)</label>
            <input className="field" value={form.capabilities} onChange={set('capabilities')} placeholder="vendor_lookup" />
          </div>
          <div>
            <label className="field-label">Allowed environments (comma-separated)</label>
            <input className="field" value={form.allowedEnvironments} onChange={set('allowedEnvironments')} placeholder="demo" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <div>
            <label className="field-label">Max iterations</label>
            <input className="field" type="number" value={form.maxIterations} onChange={set('maxIterations')} />
          </div>
          <div>
            <label className="field-label">Max duration (ms)</label>
            <input className="field" type="number" value={form.maxDurationMs} onChange={set('maxDurationMs')} />
          </div>
          <div>
            <label className="field-label">Budget (minor units)</label>
            <input className="field" type="number" value={form.maxBudgetMinor} onChange={set('maxBudgetMinor')} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="btn btn-dark" onClick={() => void create()} disabled={busy}>
            <Save size={14} /> {busy ? 'Creating…' : 'Create agent'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
