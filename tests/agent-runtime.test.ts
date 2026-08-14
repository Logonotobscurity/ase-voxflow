import { describe, expect, it } from 'vitest';
import { BoundedAgentRuntime } from '../lib/application/agent-runtime';
import { PlatformError } from '../lib/domain/errors';
import { actorContext, agentFixture, memoryPorts, toolFixture } from './helpers';

async function setup(options: { evidence?: boolean; riskLevel?: 'LOW' | 'CRITICAL' } = {}) {
  const ports = memoryPorts(new Map([['tool_lookup', () => ({
    output: { vendorId: 'vendor_kora', verified: true },
    costMinor: 20,
    evidence: options.evidence === false ? [] : [{
      type: 'tool_result' as const,
      summary: 'Seeded vendor vendor_kora was found.',
      reference: 'vendor_kora',
    }],
  })]]));
  await ports.agents.save(agentFixture());
  await ports.tools.save(toolFixture({ riskLevel: options.riskLevel ?? 'LOW' }));
  return { ports, runtime: new BoundedAgentRuntime(ports) };
}

describe('BoundedAgentRuntime', () => {
  it('requires tool evidence before accepting a completion proposal', async () => {
    const { ports, runtime } = await setup();
    const proposals = [
      { action: 'invoke_tool', toolId: 'tool_lookup', input: { name: 'Kora' } },
      { action: 'complete', summary: 'Vendor was verified.' },
    ];
    const result = await runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_1',
      objective: 'Verify Kora Packaging',
      context: actorContext,
      planner: async () => proposals.shift(),
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.toolCalls).toBe(1);
    expect(result.evidence).toHaveLength(1);
    expect((await ports.agents.findById(actorContext.tenantId, 'agent_test'))?.status).toBe('COMPLETED');
    expect(await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId))
      .toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'agent.execution.completed' })]));
  });

  it('fails a completion proposal with no observable evidence', async () => {
    const { ports, runtime } = await setup();
    await expect(runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_2',
      objective: 'Claim success without doing work',
      context: actorContext,
      planner: async () => ({ action: 'complete', summary: 'Done' }),
    })).rejects.toMatchObject({ code: 'AGENT_EXECUTION_FAILED' });
    expect((await ports.agents.findById(actorContext.tenantId, 'agent_test'))?.status).toBe('FAILED');
  });

  it('stops after bounded no-progress iterations', async () => {
    const { runtime } = await setup({ evidence: false });
    await expect(runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_3',
      objective: 'Loop without evidence',
      context: actorContext,
      planner: async () => ({ action: 'invoke_tool', toolId: 'tool_lookup', input: {} }),
    })).rejects.toMatchObject({ code: 'AGENT_EXECUTION_FAILED' });
  });

  it('waits for approval instead of invoking a critical tool', async () => {
    let calls = 0;
    const { runtime } = await setup({ riskLevel: 'CRITICAL' });
    const result = await runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_4',
      objective: 'Perform critical action',
      context: actorContext,
      planner: async () => {
        calls += 1;
        return { action: 'invoke_tool', toolId: 'tool_lookup', input: {} };
      },
    });
    expect(result.status).toBe('WAITING_APPROVAL');
    expect(result.toolCalls).toBe(0);
    expect(calls).toBe(1);
  });

  it('enforces tenant isolation and rejects identifier takeover', async () => {
    const { ports, runtime } = await setup();
    await expect(runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_5',
      objective: 'Cross tenant access',
      context: { ...actorContext, tenantId: 'tenant_other' },
      planner: async () => ({ action: 'complete', summary: 'Done' }),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<PlatformError>);
    await expect(ports.agents.save(agentFixture({ tenantId: 'tenant_other' })))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect((await ports.agents.findById(actorContext.tenantId, 'agent_test'))?.tenantId).toBe(actorContext.tenantId);
  });

  it('enforces a wall-clock deadline when the planner ignores cancellation', async () => {
    const { ports, runtime } = await setup();
    const agent = await ports.agents.findById(actorContext.tenantId, 'agent_test');
    if (!agent) throw new Error('Expected agent fixture.');
    agent.policies.limits.maxDurationMs = 100;
    await ports.agents.save(agent);

    await expect(runtime.run({
      agentId: 'agent_test',
      executionId: 'exec_agent_timeout',
      objective: 'Wait forever',
      context: actorContext,
      planner: async () => new Promise(() => undefined),
    })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect((await ports.agents.findById(actorContext.tenantId, 'agent_test'))?.status).toBe('FAILED');
  });
});
