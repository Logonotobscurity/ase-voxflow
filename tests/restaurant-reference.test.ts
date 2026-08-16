import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WorkflowCreateSchema } from '../lib/domain/schemas';

describe('Capability 12 — restaurant-ordering reference workflow', () => {
  it('parses against WorkflowCreateSchema (canonical contract, no special subsystem)', () => {
    const raw = readFileSync('data/restaurant-ordering.reference.json', 'utf8');
    const parsed = WorkflowCreateSchema.parse(JSON.parse(raw));
    expect(parsed.nodes).toHaveLength(9);
    expect(parsed.edges).toHaveLength(8);
    // The graph must be a DAG; the topological-order check inside the
    // canonical contract would throw on a cycle, so reaching this
    // assertion is the evidence.
    const ids = new Set(parsed.nodes.map((n) => n.id));
    for (const edge of parsed.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
    // The full intent→entity→availability→validation→confirmation→
    // transaction→execution→verification pattern must be present.
    const labels = parsed.nodes.map((n) => n.label.toLowerCase()).join(' | ');
    expect(labels).toContain('capture');
    expect(labels).toContain('menu');
    expect(labels).toContain('availability');
    expect(labels).toContain('validate');
    expect(labels).toContain('confirmation');
    expect(labels).toContain('payment');
    expect(labels).toContain('kitchen');
    expect(labels).toContain('receipt');
  });
});
