import type { ExecutionEvidence, PlatformPorts } from './ports';
import { PlatformError, asPlatformError } from '../domain/errors';
import { createDomainEvent, createId } from '../domain/events';
import { evaluateWorkflowNodePolicy, roleAllows, type ActorContext } from '../domain/policy';
import {
  WorkflowExecutionSchema,
  type NodeExecutionResult,
  type Workflow,
  type WorkflowExecution,
  type WorkflowNode,
} from '../domain/schemas';
import { topologicalOrder, validateWorkflowGraph } from '../domain/workflow-graph';

export type WorkflowNodeResult = {
  output: Record<string, unknown>;
  evidence: ExecutionEvidence[];
  costMinor?: number;
};
export type WorkflowNodeHandler = (
  node: WorkflowNode,
  input: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<WorkflowNodeResult> | WorkflowNodeResult;

export type WorkflowRunResult = {
  execution: WorkflowExecution;
  evidence: ExecutionEvidence[];
};

export class WorkflowRunner {
  constructor(
    private readonly ports: PlatformPorts,
    private readonly handlers: ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler>,
  ) {}

  async run(request: {
    workflowId: string;
    input?: Record<string, unknown>;
    context: ActorContext;
    maxDurationMs?: number;
    maxCostMinor?: number;
  }): Promise<WorkflowRunResult> {
    if (!roleAllows(request.context.role, 'workflow:execute')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${request.context.role} cannot execute workflows.`);
    }
    const workflow = await this.ports.workflows.findById(request.context.tenantId, request.workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${request.workflowId} was not found.`);
    if (workflow.status !== 'READY') {
      throw new PlatformError('CONFLICT', `Workflow ${workflow.id} must be READY before execution.`);
    }
    validateWorkflowGraph(workflow);
    // Orcflo control flow: the legacy linear runner has no loop
    // semantics. Bounded loops (and per-edge branching) require the
    // Orcflo engine; refusing here keeps behavior honest instead of
    // running a loop graph as a single linear pass.
    if (workflow.edges.some((edge) => edge.loop === true)) {
      throw new PlatformError(
        'CONFLICT',
        `Workflow ${workflow.id} contains a bounded loop; execute it through the Orcflo engine (/api/v1/orcflo/runs) instead.`,
      );
    }
    const maxDurationMs = Math.min(request.maxDurationMs ?? 30_000, 120_000);
    const maxCostMinor = Math.min(request.maxCostMinor ?? 100_000, 100_000_000);
    const started = Date.now();
    const startedAt = new Date().toISOString();
    let execution = WorkflowExecutionSchema.parse({
      id: createId('exec'),
      tenantId: request.context.tenantId,
      workflowId: workflow.id,
      status: 'RUNNING',
      input: request.input ?? {},
      nodeResults: [],
      correlationId: request.context.correlationId,
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await this.ports.executions.save(execution);
    await this.emit('workflow.execution.started', workflow, execution, {}, request.context);

    const evidence: ExecutionEvidence[] = [];
    let spentMinor = 0;
    try {
      for (const node of topologicalOrder(workflow)) {
        const decision = evaluateWorkflowNodePolicy(node, request.context);
        if (decision.outcome === 'deny') {
          throw new PlatformError('AUTHORIZATION_DENIED', decision.reason);
        }
        if (decision.outcome === 'require_approval') {
          const result = this.nodeResult(node.id, 'WAITING_APPROVAL', { reason: decision.reason });
          execution = await this.updateExecution(execution, {
            status: 'WAITING_APPROVAL',
            nodeResults: [...execution.nodeResults, result],
          });
          await this.emit('workflow.execution.approval_requested', workflow, execution, {
            nodeId: node.id,
            nodeType: node.type,
            reason: decision.reason,
          }, request.context);
          return { execution, evidence };
        }

        this.assertDeadline(started, maxDurationMs);
        const handler = this.handlers.get(node.type);
        if (!handler) {
          throw new PlatformError('WORKFLOW_ERROR', `No deterministic handler is registered for node type ${node.type}.`);
        }
        const nodeStartedAt = new Date().toISOString();
        const result = await this.executeWithRetry(node, handler, request.input ?? {}, started, maxDurationMs);
        const resultCost = result.costMinor ?? 0;
        if (!Number.isSafeInteger(resultCost) || resultCost < 0) {
          throw new PlatformError('WORKFLOW_ERROR', `Node ${node.id} returned an invalid cost.`);
        }
        spentMinor += resultCost;
        if (spentMinor > maxCostMinor) {
          throw new PlatformError('WORKFLOW_ERROR', 'Workflow cost limit was exceeded.');
        }
        evidence.push(...result.evidence);
        execution = await this.updateExecution(execution, {
          nodeResults: [...execution.nodeResults, this.nodeResult(node.id, 'COMPLETED', {
            ...result.output,
            evidence: result.evidence,
            costMinor: result.costMinor ?? 0,
          }, nodeStartedAt)],
        });
      }

      if (evidence.length === 0) {
        throw new PlatformError('WORKFLOW_ERROR', 'Workflow produced no observable completion evidence.');
      }
      const completedAt = new Date().toISOString();
      execution = await this.updateExecution(execution, {
        status: 'COMPLETED',
        output: { spentMinor, evidenceCount: evidence.length },
        completedAt,
      });
      await this.emit('workflow.execution.completed', workflow, execution, {
        spentMinor,
        evidenceCount: evidence.length,
      }, request.context);
      return { execution, evidence };
    } catch (error) {
      const failure = asPlatformError(error);
      const failedNode = execution.nodeResults.at(-1)?.nodeId;
      execution = await this.updateExecution(execution, {
        status: 'FAILED',
        output: { code: failure.code, message: failure.message, failedAfterNode: failedNode },
        completedAt: new Date().toISOString(),
      });
      await this.emit('workflow.execution.failed', workflow, execution, {
        code: failure.code,
        message: failure.message,
      }, request.context);
      throw failure;
    }
  }

  private async executeWithRetry(
    node: WorkflowNode,
    handler: WorkflowNodeHandler,
    input: Record<string, unknown>,
    started: number,
    maxDurationMs: number,
  ): Promise<WorkflowNodeResult> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= node.retryPolicy.maxRetries) {
      attempt += 1;
      try {
        const configuredTimeout = Number(node.configuration.timeoutMs ?? 10_000);
        const timeoutMs = Math.max(1, Math.min(configuredTimeout, maxDurationMs - (Date.now() - started)));
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            Promise.resolve().then(() => handler(node, input, controller.signal)),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(new PlatformError('TIMEOUT', `Node ${node.id} exceeded its ${timeoutMs}ms deadline.`));
              }, timeoutMs);
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      } catch (error) {
        lastError = error;
        const failure = asPlatformError(error);
        if (!failure.retryable || attempt > node.retryPolicy.maxRetries) throw failure;
        const delayMs = node.retryPolicy.backoffMs * attempt;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        this.assertDeadline(started, maxDurationMs);
      }
    }
    throw asPlatformError(lastError);
  }

  private async updateExecution(
    execution: WorkflowExecution,
    patch: Partial<WorkflowExecution>,
  ): Promise<WorkflowExecution> {
    const updated = WorkflowExecutionSchema.parse({ ...execution, ...patch, updatedAt: new Date().toISOString() });
    await this.ports.executions.save(updated);
    return updated;
  }

  private nodeResult(
    nodeId: string,
    status: NodeExecutionResult['status'],
    output: Record<string, unknown>,
    startedAt = new Date().toISOString(),
  ): NodeExecutionResult {
    return {
      nodeId,
      status,
      attempt: 1,
      startedAt,
      completedAt: status === 'COMPLETED' ? new Date().toISOString() : undefined,
      output,
    };
  }

  private assertDeadline(started: number, maxDurationMs: number): void {
    if (Date.now() - started >= maxDurationMs) {
      throw new PlatformError('TIMEOUT', 'Workflow execution deadline was reached.', { retryable: true });
    }
  }

  private async emit(
    eventType: string,
    workflow: Workflow,
    execution: WorkflowExecution,
    payload: Record<string, unknown>,
    context: ActorContext,
  ) {
    await this.ports.events.publish(createDomainEvent(eventType, { type: 'workflow_execution', id: execution.id }, {
      workflowId: workflow.id,
      executionId: execution.id,
      ...payload,
    }, context));
  }
}
