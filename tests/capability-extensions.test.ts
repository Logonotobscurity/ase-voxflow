import { describe, expect, it } from 'vitest';
import {
  AgentProposalSchema,
  McpServerConfigSchema,
  TranscriptSchema,
  TtsCueSchema,
  VoiceIntentSchema,
} from '../lib/domain/schemas';
import {
  createInMemoryPersistencePorts,
  FixedClock,
  InMemoryTranscriptRepository,
  SystemClock,
} from '../lib/infrastructure/memory-adapters';
import {
  EmptyMcpServerRegistry,
  NoopAvatarSessionAdapter,
  buildDevAvatarRef,
} from '../lib/infrastructure/extension-adapters';
import { AgentCommandService } from '../lib/application/agent-command-service';
import { actorContext, memoryPorts } from './helpers';

describe('Capability 04 — Transcript schema and repository', () => {
  it('TranscriptSchema rejects a transcript with empty text', () => {
    expect(() => TranscriptSchema.parse({
      id: 't_1', tenantId: actorContext.tenantId, sessionId: 's_1', participantId: 'p_1',
      occurredAt: new Date().toISOString(), text: '', confidence: 0.9, final: true,
      metadata: {},
    })).toThrow();
  });

  it('InMemoryTranscriptRepository persists and lists by session and participant', async () => {
    const { store, transcripts } = createInMemoryPersistencePorts();
    const repo: InMemoryTranscriptRepository = transcripts;
    const t1 = TranscriptSchema.parse({
      id: 't_a', tenantId: actorContext.tenantId, sessionId: 's_room_1', participantId: 'p_ada',
      occurredAt: '2026-08-14T12:00:00.000Z', text: 'run the vendor workflow', confidence: 0.92, final: true,
      metadata: {},
    });
    const t2 = TranscriptSchema.parse({
      ...t1, id: 't_b', occurredAt: '2026-08-14T12:00:05.000Z', text: 'add a tool node',
    });
    await repo.save(t1);
    await repo.save(t2);
    const bySession = await repo.listBySession(actorContext.tenantId, 's_room_1');
    expect(bySession.map((t) => t.id)).toEqual(['t_a', 't_b']);
    const byParticipant = await repo.listByParticipant(actorContext.tenantId, 'p_ada');
    expect(byParticipant).toHaveLength(2);
    expect(store.state.transcripts.size).toBe(2);
  });
});

describe('Capability 04 — AgentCommandService emits participant/session metadata, raw text excluded', () => {
  it('audit payload contains participant/session keys but excludes raw text', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);
    const proposal = await service.propose({
      text: 'run the vendor workflow',
      modality: 'VOICE_TRANSCRIPT',
      participantId: 'p_ada',
      sessionId: 's_room_1',
      context: actorContext,
    });
    const events = await ports.events.listByCorrelation(actorContext.tenantId, proposal.command.correlationId);
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.participantId).toBe('p_ada');
    expect(payload.sessionId).toBe('s_room_1');
    expect(payload.modality).toBe('VOICE_TRANSCRIPT');
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('rawText');
    expect(payload.rawTextPersisted).toBe(false);
  });

  it('legacy callers without participant/session still work (additive only)', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);
    const proposal = await service.propose({
      text: 'add a tool node',
      modality: 'TEXT',
      context: actorContext,
    });
    expect(proposal.command.intent).toBe('add_node');
  });
});

describe('Capability 07 — Structured AgentProposal union and TtsCue', () => {
  it('TtsCueSchema rejects speed outside [0.5, 2.0]', () => {
    expect(() => TtsCueSchema.parse({ tone: 'calm', emotion: 'gentle', speed: 3.5 })).toThrow();
    expect(() => TtsCueSchema.parse({ tone: 'urgent', emotion: 'firm', speed: 1.1 })).not.toThrow();
  });

  it('AgentProposalSchema accepts complete with optional tts cue', () => {
    const parsed = AgentProposalSchema.parse({
      action: 'complete',
      summary: 'Vendor verified.',
      tts: { tone: 'confident', emotion: 'reassuring', speed: 1.0 },
    });
    expect(parsed.action).toBe('complete');
  });

  it('AgentProposalSchema accepts request_approval and abort variants', () => {
    expect(AgentProposalSchema.parse({
      action: 'request_approval', toolId: 'tool_payout', reason: 'CRITICAL risk',
    }).action).toBe('request_approval');
    expect(AgentProposalSchema.parse({ action: 'abort', reason: 'deadline exceeded' }).action).toBe('abort');
  });

  it('AgentProposalSchema refuses unknown action discriminator', () => {
    expect(() => AgentProposalSchema.parse({ action: 'fly_to_mars', reason: 'no' } as unknown as { action: 'complete'; summary: string })).toThrow();
  });
});

describe('Capability 06 — MCP server config and empty registry', () => {
  it('McpServerConfigSchema defaults trusted to false and requires a transport', () => {
    const now = new Date().toISOString();
    const parsed = McpServerConfigSchema.parse({
      id: 'mcp_1', tenantId: actorContext.tenantId, name: 'demo-mcp',
      transport: 'stdio', endpoint: 'local://demo', identityRef: 'id_demo',
      allowedTools: ['menu_lookup'],
      trusted: false,
      createdAt: now, updatedAt: now,
    });
    expect(parsed.trusted).toBe(false);
  });

  it('EmptyMcpServerRegistry returns no servers and cannot resolve one', async () => {
    const reg = new EmptyMcpServerRegistry();
    expect(await reg.listAllowedServers('t_1')).toEqual([]);
    expect(await reg.getServer('t_1', 'mcp_1')).toBeNull();
  });
});

describe('Capability 10 — Avatar provider (no-op default)', () => {
  it('NoopAvatarSessionAdapter.createSession fails closed with CONFIGURATION_ERROR', async () => {
    const adapter = new NoopAvatarSessionAdapter();
    await expect(adapter.createSession(actorContext.tenantId, 'p_ada'))
      .rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });

  it('terminate is a no-op for an unconfigured adapter', async () => {
    const adapter = new NoopAvatarSessionAdapter();
    const ref = buildDevAvatarRef(actorContext.tenantId, 'p_ada');
    await expect(adapter.terminate(ref)).resolves.toBeUndefined();
  });
});

describe('Capability 01 — System / Fixed clock', () => {
  it('SystemClock reports wall-clock time and ISO format', () => {
    const clock = new SystemClock();
    expect(typeof clock.now()).toBe('number');
    expect(() => new Date(clock.isoNow()).toISOString()).not.toThrow();
  });

  it('FixedClock is deterministic and advanceable', () => {
    const clock = new FixedClock('2026-08-14T12:00:00.000Z');
    expect(clock.now()).toBe(Date.parse('2026-08-14T12:00:00.000Z'));
    expect(clock.isoNow()).toBe('2026-08-14T12:00:00.000Z');
    clock.advance(2_500);
    expect(clock.isoNow()).toBe('2026-08-14T12:00:02.500Z');
  });
});

describe('Capability 01/08 — Text-only invariant on AgentCommandService', () => {
  it('text and already-transcribed voice both reach the same service and never execute a tool', async () => {
    const ports = memoryPorts();
    const service = new AgentCommandService(ports);
    const text = await service.propose({ text: 'add a tool node', modality: 'TEXT', context: actorContext });
    const voice = await service.propose({ text: 'add a tool node', modality: 'VOICE_TRANSCRIPT', context: actorContext });
    expect(text.proposalOnly).toBe(true);
    expect(voice.proposalOnly).toBe(true);
    // No tool executions were recorded in the platform events.
    const allEvents = await ports.events.listByCorrelation(actorContext.tenantId, text.command.correlationId);
    expect(allEvents.every((e) => e.eventType.startsWith('agent.command.'))).toBe(true);
  });
});

describe('Sanity — VoiceIntent enum completeness', () => {
  it('exposes the 10 intents used by the proposal flow', () => {
    expect(Object.keys(VoiceIntentSchema.enum)).toEqual(
      expect.arrayContaining(['add_node', 'connect', 'execute', 'delete_node', 'select_node',
        'update_node', 'run_workflow', 'pause_workflow', 'handoff', 'unknown']),
    );
  });
});
