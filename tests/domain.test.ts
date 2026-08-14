import { describe, expect, it } from 'vitest';
import { assertAgentTransition, canTransitionAgent } from '../lib/domain/agent-lifecycle';
import { classifyVoiceIntent } from '../lib/domain/voice-intent';
import { topologicalOrder, validateWorkflowGraph } from '../lib/domain/workflow-graph';
import { workflowFixture } from './helpers';

describe('domain invariants', () => {
  it('allows declared agent transitions and rejects terminal-state revival', () => {
    expect(canTransitionAgent('READY', 'RUNNING')).toBe(true);
    expect(canTransitionAgent('COMPLETED', 'READY')).toBe(false);
    expect(() => assertAgentTransition('COMPLETED', 'READY')).toThrow(/cannot transition/i);
  });

  it('orders a valid workflow DAG', () => {
    const workflow = workflowFixture();
    validateWorkflowGraph(workflow);
    expect(topologicalOrder(workflow).map((node) => node.id)).toEqual(['start', 'end']);
  });

  it('rejects dangling and self-referencing edges', () => {
    const workflow = workflowFixture({
      edges: [{ id: 'bad_edge', source: 'start', target: 'missing', metadata: {} }],
    });
    expect(() => validateWorkflowGraph(workflow)).toThrow(/unknown node/i);
  });

  it('classifies reversible and consequential voice intents deterministically', () => {
    expect(classifyVoiceIntent('Add a condition node after vendor lookup')).toMatchObject({
      intent: 'add_node',
      entities: { nodeType: 'condition' },
    });
    expect(classifyVoiceIntent('Execute this workflow')).toMatchObject({ intent: 'execute' });
    expect(classifyVoiceIntent('Tell me a joke')).toMatchObject({ intent: 'unknown' });
  });
});
