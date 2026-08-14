import { PlatformError } from './errors';
import type { AgentStatus } from './schemas';

const transitions: Record<AgentStatus, readonly AgentStatus[]> = {
  REGISTERED: ['READY', 'FAILED'],
  READY: ['RUNNING', 'PAUSED', 'FAILED'],
  RUNNING: ['WAITING', 'PAUSED', 'COMPLETED', 'FAILED'],
  WAITING: ['RUNNING', 'PAUSED', 'FAILED'],
  PAUSED: ['READY', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionAgent(from: AgentStatus, to: AgentStatus): boolean {
  return transitions[from].includes(to);
}

export function assertAgentTransition(from: AgentStatus, to: AgentStatus): void {
  if (!canTransitionAgent(from, to)) {
    throw new PlatformError('CONFLICT', `Agent cannot transition from ${from} to ${to}.`, {
      safeMetadata: { from, to },
    });
  }
}

export function allowedAgentTransitions(status: AgentStatus): readonly AgentStatus[] {
  return transitions[status];
}
