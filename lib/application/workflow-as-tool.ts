import { PlatformError } from '../domain/errors';
import {
  ToolDefinitionSchema,
  type ToolDefinition,
} from '../domain/schemas';
import { roleAllows, type ActorContext } from '../domain/policy';
import type {
  OrcfloRuntimePorts,
  ToolExecutor,
  ToolInvocation,
  ToolResult,
} from './ports';
import type { OrcfloEngine } from './orcflo-engine';

/**
 * Workflow-as-Tool — the AGENT → WORKFLOW bridge.
 *
 * A published (READY) workflow is registered as a first-class
 * `ToolDefinition` in the canonical tool registry. The agent runtime
 * then sees it exactly like any other tool: the agent must be assigned
 * the tool (`agent.toolIds`), `evaluateToolPolicy` governs risk and
 * permissions, and execution goes through the shared `ToolExecutor`
 * port — no second tool system.
 *
 * Every execution delegates to `OrcfloEngine.startRun`, so all run
 * guarantees (READY-only, policy, evidence, metering, stream) apply to
 * the nested run. Cross-boundary recursion is bounded:
 *   - `WORKFLOW_TOOL_DEPTH_KEY` — reserved input key tracking nesting
 *     depth; exceeding `maxDepth` fails with `WORKFLOW_ERROR`.
 *   - `WORKFLOW_TOOL_PARENT_KEY` — reserved input key carrying the
 *     parent agent execution id for traceability (correlation is
 *     preserved end-to-end via `ActorContext.correlationId`).
 */
export const WORKFLOW_TOOL_DEPTH_KEY = '__orcfloDepth';
export const WORKFLOW_TOOL_PARENT_KEY = '__orcfloParentExecutionId';
export const WORKFLOW_TOOL_DEFAULT_MAX_DEPTH = 3;

export function workflowToolId(workflowId: string): string {
  return `wtool_${workflowId}`;
}

function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `workflow_${slug || 'untitled'}`;
}

export type WorkflowToolRegisterOptions = {
  inputSchema?: Record<string, unknown>;
  description?: string;
  riskLevel?: ToolDefinition['riskLevel'];
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Registers / describes / unregisters a workflow as a tool.
 *
 * `register` persists a `ToolDefinition` (upsert); `unregister` soft-
 * disables it by flipping `availability` to `UNAVAILABLE` so the policy
 * gate denies it (fail-closed), without adding a destructive delete to
 * the tool repository contract.
 */
export class WorkflowAsToolService {
  constructor(private readonly ports: OrcfloRuntimePorts) {}

  async describe(context: ActorContext, workflowId: string, options: WorkflowToolRegisterOptions = {}): Promise<ToolDefinition> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read workflows.`);
    }
    const workflow = await this.ports.workflows.findById(context.tenantId, workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${workflowId} was not found.`);
    if (workflow.status !== 'READY') {
      throw new PlatformError('CONFLICT', `Workflow ${workflowId} must be READY before it can be called as a tool.`);
    }
    const now = new Date().toISOString();
    return ToolDefinitionSchema.parse({
      id: workflowToolId(workflow.id),
      tenantId: context.tenantId,
      name: slugifyName(workflow.name),
      description: options.description
        ?? `${workflow.description || workflow.name} — Orcflo workflow-as-tool. Runs workflow ${workflow.id}.`,
      inputSchema: options.inputSchema
        ?? (typeof workflow.metadata.inputSchema === 'object' && workflow.metadata.inputSchema !== null
          ? workflow.metadata.inputSchema
          : { type: 'object', properties: {}, additionalProperties: true }),
      permissions: [],
      riskLevel: options.riskLevel ?? 'MEDIUM',
      timeoutMs: options.timeoutMs ?? 30_000,
      cost: { currency: 'NGN', amountMinor: 0 },
      availability: 'AVAILABLE',
      metadata: {
        orcfloTool: true,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        ...options.metadata,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  async register(context: ActorContext, workflowId: string, options: WorkflowToolRegisterOptions = {}): Promise<ToolDefinition> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot register workflow tools.`);
    }
    const tool = await this.describe(context, workflowId, options);
    const existing = await this.ports.tools.list(context.tenantId);
    const nameCollision = existing.find((candidate) => (
      candidate.id !== tool.id
      && candidate.name === tool.name
      && candidate.metadata?.orcfloTool !== true
    ));
    if (nameCollision) {
      throw new PlatformError('CONFLICT', `Tool name ${tool.name} is already in use by another tool.`);
    }
    await this.ports.tools.save(tool);
    return tool;
  }

  async unregister(context: ActorContext, workflowId: string): Promise<ToolDefinition> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot unregister workflow tools.`);
    }
    const id = workflowToolId(workflowId);
    const existing = await this.ports.tools.findById(context.tenantId, id);
    if (!existing) throw new PlatformError('NOT_FOUND', `Workflow tool ${id} was not registered.`);
    const now = new Date().toISOString();
    const disabled = ToolDefinitionSchema.parse({
      ...existing,
      availability: 'UNAVAILABLE',
      updatedAt: now,
    });
    await this.ports.tools.save(disabled);
    return disabled;
  }
}

/**
 * Executes an invocation whose tool is a registered Orcflo workflow
 * tool. Fails closed when the tool is unavailable, when the recursion
 * depth limit is reached, or when the caller context is missing.
 */
export class WorkflowAsToolExecutor implements ToolExecutor {
  constructor(
    private readonly getEngine: () => OrcfloEngine,
    private readonly options: { maxDepth?: number } = {},
  ) {}

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const metadata = invocation.tool.metadata as Record<string, unknown> | undefined;
    if (metadata?.orcfloTool !== true) {
      throw new PlatformError('TOOL_EXECUTION_FAILED', `Tool ${invocation.tool.name} is not an Orcflo workflow tool.`);
    }
    if (invocation.tool.availability !== 'AVAILABLE') {
      throw new PlatformError('TOOL_EXECUTION_FAILED', `Workflow tool ${invocation.tool.name} is unavailable.`);
    }
    const workflowId = typeof metadata.workflowId === 'string' ? metadata.workflowId : undefined;
    if (!workflowId) {
      throw new PlatformError('CONFIGURATION_ERROR', `Workflow tool ${invocation.tool.id} has no workflowId metadata.`);
    }
    const context = invocation.context;
    if (!context) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'Workflow tool invocation requires the caller actor context. Wire the canonical agent runtime to supply it.',
      );
    }
    if (invocation.signal.aborted) {
      throw new PlatformError('TIMEOUT', `Workflow tool ${invocation.tool.name} was aborted.`, { retryable: true });
    }

    const maxDepth = this.options.maxDepth ?? WORKFLOW_TOOL_DEFAULT_MAX_DEPTH;
    const parentDepth = Number(invocation.input[WORKFLOW_TOOL_DEPTH_KEY] ?? 0);
    if (!Number.isFinite(parentDepth) || parentDepth < 0 || parentDepth >= maxDepth) {
      throw new PlatformError(
        'WORKFLOW_ERROR',
        `Workflow tool recursion depth limit (${maxDepth}) was reached while calling ${invocation.tool.name}.`,
      );
    }

    const engine = this.getEngine();
    const run = await engine.startRun({
      workflowId,
      context,
      input: {
        ...invocation.input,
        [WORKFLOW_TOOL_DEPTH_KEY]: parentDepth + 1,
        [WORKFLOW_TOOL_PARENT_KEY]: invocation.executionId,
      },
      maxDurationMs: invocation.tool.timeoutMs,
    });
    const spentMinor = (run.output as { spentMinor?: number } | undefined)?.spentMinor ?? 0;
    return {
      output: {
        runId: run.id,
        workflowId,
        status: run.status,
        output: run.output,
        steps: run.steps.map((step) => ({ nodeId: step.nodeId, status: step.status })),
      },
      costMinor: Number.isSafeInteger(spentMinor) ? spentMinor : 0,
      evidence: [{
        type: 'tool_result',
        summary: `Workflow ${workflowId} executed as run ${run.id} (status ${run.status}).`,
        reference: `run:${run.id}`,
        data: { workflowId, runId: run.id, status: run.status },
      }],
    };
  }
}

/**
 * Routes invocations to the workflow executor when the tool is an
 * Orcflo workflow tool, otherwise to the canonical deterministic
 * executor. This keeps one `ToolExecutor` port while letting the
 * registry stay extensible.
 */
export class WorkflowAwareToolExecutor implements ToolExecutor {
  constructor(
    private readonly inner: ToolExecutor,
    private readonly workflow: WorkflowAsToolExecutor,
  ) {}

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const metadata = invocation.tool.metadata as Record<string, unknown> | undefined;
    if (metadata?.orcfloTool === true) {
      return this.workflow.execute(invocation);
    }
    return this.inner.execute(invocation);
  }
}
