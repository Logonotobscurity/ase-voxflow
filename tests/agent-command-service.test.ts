import { describe, expect, it } from 'vitest';
import { AgentCommandService } from '../lib/application/agent-command-service';
import { actorContext, memoryPorts } from './helpers';

describe('AgentCommandService', () => {
  it('records a text-only reversible proposal with an atomic outbox intent', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);

    const result = await service.propose({
      text: 'Add a condition node after vendor lookup',
      modality: 'TEXT',
      workflowId: 'workflow_test',
      context: actorContext,
    });

    expect(result).toMatchObject({
      proposalOnly: true,
      command: {
        modality: 'TEXT',
        intent: 'add_node',
        status: 'PROPOSED',
        requiresConfirmation: false,
        target: { workflowId: 'workflow_test' },
      },
    });
    const events = await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'agent.command.proposed',
      aggregateType: 'agent_command',
      aggregateId: result.command.id,
      payload: { rawTextPersisted: false, textLength: result.command.text.length },
    });
    expect(JSON.stringify(events[0].payload)).not.toContain('vendor lookup');
    const outbox = await ports.outbox.listPending(actorContext.tenantId);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].eventId).toBe(events[0].id);
  });

  it('keeps an execution request proposal-only and requires explicit review', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);

    const result = await service.propose({
      text: 'Run this workflow now',
      modality: 'VOICE_TRANSCRIPT',
      workflowId: 'workflow_test',
      context: actorContext,
    });

    expect(result.command).toMatchObject({
      modality: 'VOICE_TRANSCRIPT',
      intent: 'run_workflow',
      status: 'PROPOSED',
      riskLevel: 'HIGH',
      requiresConfirmation: true,
    });
    expect(result.message).toMatch(/no action has been executed/i);
  });

  it('records unmatched input as rejected without claiming execution', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);

    const result = await service.propose({
      text: 'Tell me a joke',
      modality: 'TEXT',
      context: actorContext,
    });

    expect(result.command).toMatchObject({ intent: 'unknown', status: 'REJECTED' });
    expect(await ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId))
      .toEqual([expect.objectContaining({ eventType: 'agent.command.rejected' })]);
  });

  it('denies a viewer mutation proposal before writing an audit event', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);

    await expect(service.propose({
      text: 'Add an approval node',
      modality: 'TEXT',
      context: { ...actorContext, role: 'VIEWER' },
    })).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    await expect(ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId))
      .resolves.toEqual([]);
  });

  it('rolls back the audit event when outbox persistence fails', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);
    ports.outbox.save = async () => {
      throw new Error('Injected outbox failure');
    };

    await expect(service.propose({
      text: 'Add a condition node',
      modality: 'TEXT',
      context: actorContext,
    })).rejects.toThrow('Injected outbox failure');
    await expect(ports.events.listByCorrelation(actorContext.tenantId, actorContext.correlationId))
      .resolves.toEqual([]);
  });
});
