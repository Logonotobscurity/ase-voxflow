import { z } from 'zod';
import type { ExecutionEvidence, PlatformPorts } from './ports';
import { assertAgentTransition } from '../domain/agent-lifecycle';
import { PlatformError, asPlatformError } from '../domain/errors';
import { createDomainEvent } from '../domain/events';
import { evaluateToolPolicy, type ActorContext } from '../domain/policy';
import { AgentSchema, type Agent } from '../domain/schemas';

const ProposalSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invoke_tool'), toolId: z.string().min(1), input: z.record(z.string(), z.unknown()).default({}) }).strict(),
  z.object({ action: z.literal('complete'), summary: z.string().min(1).max(2_000) }).strict(),
]);

export type AgentProposal = z.infer<typeof ProposalSchema>;
export type PlannerState = {
  objective: string;
  input: Record<string, unknown>;
  iteration: number;
  observations: Array<{ toolId: string; output: Record<string, unknown> }>;
  evidence: ExecutionEvidence[];
  spentMinor: number;
};
export type AgentPlanner = (state: Readonly<PlannerState>, signal: AbortSignal) => Promise<unknown>;

export type AgentRunResult = {
  status: 'COMPLETED' | 'WAITING_APPROVAL';
  summary: string;
  iterations: number;
  toolCalls: number;
  spentMinor: number;
  evidence: ExecutionEvidence[];
};

export class BoundedAgentRuntime {
  constructor(private readonly ports: PlatformPorts) {}

  async run(request: {
    agentId: string;
    executionId: string;
    objective: string;
    input?: Record<string, unknown>;
    context: ActorContext;
    planner: AgentPlanner;
  }): Promise<AgentRunResult> {
    const agent = await this.ports.agents.findById(request.context.tenantId, request.agentId);
    if (!agent) throw new PlatformError('NOT_FOUND', `Agent ${request.agentId} was not found.`);

    let runningAgent = agent;
    if (agent.status === 'READY') {
      runningAgent = await this.transition(agent, 'RUNNING', request.context);
    }
    if (runningAgent.status !== 'RUNNING') {
      throw new PlatformError('CONFLICT', `Agent ${agent.id} cannot run from ${agent.status}.`);
    }

    const state: PlannerState = {
      objective: request.objective,
      input: request.input ?? {},
      iteration: 0,
      observations: [],
      evidence: [],
      spentMinor: 0,
    };
    const startedAt = Date.now();
    let toolCalls = 0;
    let noProgressIterations = 0;

    try {
      while (state.iteration < runningAgent.policies.limits.maxIterations) {
        this.assertWithinDeadline(startedAt, runningAgent.policies.limits.maxDurationMs);
        state.iteration += 1;
        const proposal = ProposalSchema.parse(await this.runWithDeadline(
          (signal) => request.planner(structuredClone(state), signal),
          this.remainingMs(startedAt, runningAgent.policies.limits.maxDurationMs),
          'Agent planner',
        ));

        if (proposal.action === 'complete') {
          if (state.evidence.length === 0) {
            throw new PlatformError(
              'AGENT_EXECUTION_FAILED',
              'Completion was proposed without observable execution evidence.',
            );
          }
          await this.transition(runningAgent, 'COMPLETED', request.context);
          await this.emit('agent.execution.completed', runningAgent.id, {
            executionId: request.executionId,
            iterations: state.iteration,
            toolCalls,
            spentMinor: state.spentMinor,
            evidenceCount: state.evidence.length,
          }, request.context);
          return {
            status: 'COMPLETED',
            summary: proposal.summary,
            iterations: state.iteration,
            toolCalls,
            spentMinor: state.spentMinor,
            evidence: state.evidence,
          };
        }

        if (toolCalls >= runningAgent.policies.limits.maxToolCalls) {
          throw new PlatformError('AGENT_EXECUTION_FAILED', 'Agent tool-call limit was reached.');
        }
        const tool = await this.ports.tools.findById(request.context.tenantId, proposal.toolId);
        if (!tool) throw new PlatformError('NOT_FOUND', `Tool ${proposal.toolId} was not found.`);
        const decision = evaluateToolPolicy(runningAgent, tool, request.context);
        if (decision.outcome === 'deny') {
          throw new PlatformError('AUTHORIZATION_DENIED', decision.reason);
        }
        if (decision.outcome === 'require_approval') {
          await this.transition(runningAgent, 'WAITING', request.context);
          await this.emit('agent.execution.approval_requested', runningAgent.id, {
            executionId: request.executionId,
            toolId: tool.id,
            reason: decision.reason,
          }, request.context);
          return {
            status: 'WAITING_APPROVAL',
            summary: decision.reason,
            iterations: state.iteration,
            toolCalls,
            spentMinor: state.spentMinor,
            evidence: state.evidence,
          };
        }

        const projected = state.spentMinor + tool.cost.amountMinor;
        if (projected > runningAgent.policies.limits.maxBudgetMinor) {
          throw new PlatformError('AGENT_EXECUTION_FAILED', 'Agent budget limit would be exceeded.');
        }
        const beforeEvidence = state.evidence.length;
        const result = await this.runWithDeadline(
          (signal) => this.ports.toolExecutor.execute({
            tenantId: request.context.tenantId,
            executionId: request.executionId,
            agentId: runningAgent.id,
            tool,
            input: proposal.input,
            signal,
            // Orcflo bridge — carry the caller's actor context so the
            // workflow-as-tool executor can start a nested run with full
            // tenancy, role, and correlation.
            context: request.context,
          }),
          Math.min(tool.timeoutMs, this.remainingMs(startedAt, runningAgent.policies.limits.maxDurationMs)),
          `Tool ${tool.name}`,
        );
        if (!Number.isSafeInteger(result.costMinor) || result.costMinor < 0) {
          throw new PlatformError('TOOL_EXECUTION_FAILED', `Tool ${tool.name} returned an invalid cost.`);
        }
        toolCalls += 1;
        state.spentMinor += result.costMinor;
        if (state.spentMinor > runningAgent.policies.limits.maxBudgetMinor) {
          throw new PlatformError('AGENT_EXECUTION_FAILED', 'Tool result exceeded the agent budget limit.');
        }
        state.observations.push({ toolId: tool.id, output: result.output });
        state.evidence.push(...result.evidence);
        noProgressIterations = state.evidence.length > beforeEvidence ? 0 : noProgressIterations + 1;
        if (noProgressIterations >= runningAgent.policies.limits.maxNoProgressIterations) {
          throw new PlatformError('AGENT_EXECUTION_FAILED', 'Agent stopped after making no observable progress.');
        }
        await this.emit('tool.execution.completed', tool.id, {
          executionId: request.executionId,
          agentId: runningAgent.id,
          costMinor: result.costMinor,
          evidenceCount: result.evidence.length,
        }, request.context);
      }
      throw new PlatformError('AGENT_EXECUTION_FAILED', 'Agent iteration limit was reached.');
    } catch (error) {
      const failure = asPlatformError(error);
      if (runningAgent.status === 'RUNNING') {
        await this.transition(runningAgent, 'FAILED', request.context);
      }
      await this.emit('agent.execution.failed', runningAgent.id, {
        executionId: request.executionId,
        code: failure.code,
        message: failure.message,
        iterations: state.iteration,
        toolCalls,
      }, request.context);
      throw failure;
    }
  }

  private async transition(agent: Agent, status: Agent['status'], _context: ActorContext): Promise<Agent> {
    assertAgentTransition(agent.status, status);
    const updated = AgentSchema.parse({ ...agent, status, version: agent.version + 1, updatedAt: new Date().toISOString() });
    await this.ports.agents.save(updated);
    return updated;
  }

  private async emit(eventType: string, aggregateId: string, payload: Record<string, unknown>, context: ActorContext) {
    await this.ports.events.publish(createDomainEvent(eventType, { type: 'agent', id: aggregateId }, payload, context));
  }

  private async runWithDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T> | T,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new PlatformError('TIMEOUT', `${operationName} exceeded its ${timeoutMs}ms deadline.`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private assertWithinDeadline(startedAt: number, maxDurationMs: number) {
    if (Date.now() - startedAt >= maxDurationMs) {
      throw new PlatformError('TIMEOUT', 'Agent execution deadline was reached.');
    }
  }

  private remainingMs(startedAt: number, maxDurationMs: number): number {
    return Math.max(1, maxDurationMs - (Date.now() - startedAt));
  }
}
