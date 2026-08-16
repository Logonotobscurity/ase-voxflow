import type { PlatformPorts } from './ports';
import { PlatformError } from '../domain/errors';
import { createDomainEvent, createId } from '../domain/events';
import { roleAllows, type ActorContext } from '../domain/policy';
import { classifyVoiceIntent } from '../domain/voice-intent';
import {
  AgentCommandSchema,
  type AgentCommand,
  type AgentCommandModality,
  type VoiceIntent,
} from '../domain/schemas';

const consequentialIntents = new Set<VoiceIntent>([
  'execute',
  'run_workflow',
  'pause_workflow',
  'delete_node',
  'handoff',
]);

const permissionByIntent: Partial<Record<VoiceIntent, string>> = {
  add_node: 'workflow:write',
  connect: 'workflow:write',
  delete_node: 'workflow:write',
  select_node: 'workflow:read',
  update_node: 'workflow:write',
  execute: 'workflow:execute',
  run_workflow: 'workflow:execute',
  pause_workflow: 'workflow:execute',
  handoff: 'agent:run',
};

export type ProposeAgentCommandRequest = {
  text: string;
  modality: AgentCommandModality;
  workflowId?: string;
  /**
   * Capability 02 / 04 — optional participant and session identifiers for
   * multi-user voice contexts. When omitted (legacy / text-only callers)
   * the audit event simply does not include these keys.
   */
  participantId?: string;
  sessionId?: string;
  context: ActorContext;
};

export type AgentCommandProposal = {
  command: AgentCommand;
  proposalOnly: true;
  message: string;
};

/**
 * Creates policy-checked command proposals for text and already-transcribed voice.
 * It never invokes a tool or workflow. The audit event intentionally excludes raw
 * command text; a correlated execution must enter through its canonical service.
 */
export class AgentCommandService {
  constructor(private readonly ports: PlatformPorts) {}

  async propose(request: ProposeAgentCommandRequest): Promise<AgentCommandProposal> {
    const classified = classifyVoiceIntent(request.text);
    const requiredPermission = permissionByIntent[classified.intent];
    if (requiredPermission && !roleAllows(request.context.role, requiredPermission)) {
      throw new PlatformError(
        'AUTHORIZATION_DENIED',
        `Role ${request.context.role} cannot propose ${classified.intent}.`,
      );
    }

    const requiresConfirmation = consequentialIntents.has(classified.intent);
    const status = classified.intent === 'unknown' ? 'REJECTED' as const : 'PROPOSED' as const;
    const command = AgentCommandSchema.parse({
      id: createId('command'),
      tenantId: request.context.tenantId,
      requestedBy: request.context.actorId,
      correlationId: request.context.correlationId,
      modality: request.modality,
      text: request.text,
      intent: classified.intent,
      entities: classified.entities,
      confidence: classified.confidence,
      riskLevel: requiresConfirmation ? 'HIGH' : classified.intent === 'unknown' ? 'MEDIUM' : 'LOW',
      status,
      requiresConfirmation,
      target: request.workflowId ? { workflowId: request.workflowId } : {},
      createdAt: new Date().toISOString(),
      ...(request.participantId ? { participantId: request.participantId } : {}),
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    });

    const eventType = status === 'REJECTED' ? 'agent.command.rejected' : 'agent.command.proposed';
    const event = createDomainEvent(eventType, { type: 'agent_command', id: command.id }, {
      commandId: command.id,
      modality: command.modality,
      intent: command.intent,
      confidence: command.confidence,
      riskLevel: command.riskLevel,
      requiresConfirmation: command.requiresConfirmation,
      ...(command.target.workflowId ? { workflowId: command.target.workflowId } : {}),
      ...(command.participantId ? { participantId: command.participantId } : {}),
      ...(command.sessionId ? { sessionId: command.sessionId } : {}),
      textLength: command.text.length,
      entityKeys: Object.keys(command.entities),
      rawTextPersisted: false,
    }, request.context);

    await this.ports.unitOfWork.run(async (ports) => {
      await ports.events.publish(event);
    });

    return {
      command,
      proposalOnly: true,
      message: status === 'REJECTED'
        ? 'No deterministic command matched; no action has been executed.'
        : requiresConfirmation
          ? 'Explicit review is required; no action has been executed.'
          : 'A reversible command proposal was recorded; only a supported client handler may apply it.',
    };
  }
}
