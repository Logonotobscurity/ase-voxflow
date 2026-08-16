import { createHash } from 'node:crypto';
import { PlatformError, asPlatformError } from '../domain/errors';
import { createDomainEvent, createId } from '../domain/events';
import { stableStringify } from '../domain/stable-json';
import {
  ModelCallRequestSchema,
  ModelCallResultSchema,
  ModelProviderSchema,
  OrcfloMeteringRecordSchema,
  OrcfloMeteringSummarySchema,
  OrcfloRunEventSchema,
  OrcfloRunSchema,
  OrcfloStepCacheEntrySchema,
  type ModelCallResult,
  type OrcfloMeteringMetric,
  type OrcfloMeteringSummary,
  type OrcfloModelProvider,
  type OrcfloRun,
  type OrcfloRunEventType,
  type OrcfloStepResult,
  type OrcfloTriggerKind,
} from '../domain/orcflo';
import { evaluateWorkflowNodePolicy, roleAllows, type ActorContext } from '../domain/policy';
import { topologicalOrder, validateWorkflowGraph } from '../domain/workflow-graph';
import { edgeGuardFires, evaluateCondition, resolveCollection, selectRoute } from '../domain/control-flow';
import type {
  Clock,
  ExecutionEvidence,
  ModelProviderGateway,
  OrcfloRuntimePorts,
} from './ports';
import type { BoundedAgentRuntime } from './agent-runtime';
import { WorkflowSchema, type Workflow, type WorkflowEdge, type WorkflowNode } from '../domain/schemas';

const wallClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

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

export type StartRunRequest = {
  workflowId: string;
  input?: Record<string, unknown>;
  context: ActorContext;
  triggerId?: string;
  triggerKind?: OrcfloTriggerKind;
  blueprintId?: string;
  maxDurationMs?: number;
  maxCostMinor?: number;
  /**
   * Global safety cap on node executions per run (including loop
   * iterations). Default 1000, clamped to [1, 10000]. A workflow
   * exceeding it fails with WORKFLOW_ERROR and a machine-readable
   * reason (§40 of the workflow directive).
   */
  maxNodeExecutions?: number;
};

/**
 * OrcfloEngine — deterministic workflow run engine.
 *
 * Executes a canonical `Workflow` as an `OrcfloRun` with:
 *   - an append-only run stream (`runEvents`), replayed by the SSE route;
 *   - an opt-in content-hashed step cache (`node.configuration.cacheable
 *     === true`), consulted before re-executing a deterministic node;
 *   - metering records for every observable unit;
 *   - a fail-closed `ModelProviderGateway` behind `agent` nodes and the
 *     model API;
 *   - step outputs threaded into downstream step inputs.
 *
 * The engine is synchronous within the request: runs start and finish
 * in `startRun`. A durable background worker, resumable approval, and
 * live long-poll subscription remain future work (see
 * docs/ARCHITECTURE.md §3/§5); the stream contract is already replayable.
 */
export class OrcfloEngine {
  private readonly baseHandlers: ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler>;

  constructor(
    private readonly ports: OrcfloRuntimePorts,
    handlers: ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler>,
    private readonly model: ModelProviderGateway,
    private readonly clock: Clock = wallClock,
    private readonly options: {
      /**
       * The canonical bounded agent runtime. When present, `agent`
       * workflow nodes execute through it (the AGENT → WORKFLOW bridge);
       * when absent, agent nodes fail closed with CONFIGURATION_ERROR so
       * no second agent implementation ever runs inside the engine.
       */
      agentRuntime?: BoundedAgentRuntime;
    } = {},
  ) {
    this.baseHandlers = new Map(handlers);
  }

  async startRun(request: StartRunRequest): Promise<OrcfloRun> {
    const { context } = request;
    if (!roleAllows(context.role, 'workflow:execute')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot execute workflows.`);
    }
    const stored = await this.ports.workflows.findById(context.tenantId, request.workflowId);
    if (!stored) throw new PlatformError('NOT_FOUND', `Workflow ${request.workflowId} was not found.`);
    // Normalize through the canonical contract so node defaults (retry
    // policy, configuration, metadata) are always present at runtime,
    // even when a caller saved a non-parsed row.
    const workflow = WorkflowSchema.parse(stored);
    if (workflow.status !== 'READY') {
      throw new PlatformError('CONFLICT', `Workflow ${workflow.id} must be READY before a run can start.`);
    }
    validateWorkflowGraph(workflow);
    const maxDurationMs = Math.min(request.maxDurationMs ?? 30_000, 120_000);
    const maxCostMinor = Math.min(request.maxCostMinor ?? 100_000, 100_000_000);
    const startedMs = this.clock.now();
    const startedAt = this.clock.isoNow();

    let run = OrcfloRunSchema.parse({
      id: createId('run'),
      tenantId: context.tenantId,
      workflowId: workflow.id,
      blueprintId: request.blueprintId,
      triggerId: request.triggerId,
      triggerKind: request.triggerKind,
      status: 'RUNNING',
      input: request.input ?? {},
      steps: [],
      correlationId: context.correlationId,
      startedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    await this.ports.runs.save(run);
    let sequence = 1;
    await this.emit(run, 'run.started', { workflowId: workflow.id, workflowVersion: workflow.version }, sequence);
    await this.meter(context, { metric: 'run.count', unit: 'count', amount: 1, run, workflow });
    await this.publishDomainEvent('orcflo.run.started', run, workflow, {}, context);

    const evidence: ExecutionEvidence[] = [];
    const outputs: Record<string, unknown> = {};
    let spentMinor = 0;
    let inFlightNodeId: string | undefined;
    try {
      const runHandlers = new Map<WorkflowNode['type'], WorkflowNodeHandler>(this.baseHandlers);
      runHandlers.set('agent', this.createAgentNodeHandler(context, run.id));
      runHandlers.set('ai_model', this.createAiModelNodeHandler(context));

      // --- Control-flow traversal (§12/§13/§14 of the workflow directive) ---
      // The graph (not canvas coordinates, not a plain topo pass) decides
      // execution: entry nodes first, then edges fire deterministically
      // (condition guards, router handles, loop body/exit paths). The only
      // allowed cycles are bounded for_each loops via `loop` back edges.
      const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
      const outgoing = new Map<string, WorkflowEdge[]>();
      const incoming = new Map<string, WorkflowEdge[]>();
      for (const edge of workflow.edges) {
        const from = outgoing.get(edge.source) ?? [];
        from.push(edge);
        outgoing.set(edge.source, from);
        const to = incoming.get(edge.target) ?? [];
        to.push(edge);
        incoming.set(edge.target, to);
      }
      const nonLoopEdges = workflow.edges.filter((edge) => edge.loop !== true);
      const topo = topologicalOrder({ nodes: workflow.nodes, edges: nonLoopEdges });
      const entryIds = workflow.nodes
        .filter((node) => (incoming.get(node.id) ?? []).every((edge) => edge.loop === true))
        .map((node) => node.id);
      const entryOrder = topo.filter((node) => entryIds.includes(node.id)).map((node) => node.id);

      type Activation = {
        nodeId: string;
        /** Loop iteration scope for dedupe; 0 outside loops. */
        iteration: number;
        loopItem?: { item: unknown; index: number; iteration: number };
      };
      const pending: Activation[] = entryOrder.map((nodeId) => ({ nodeId, iteration: 0 }));
      const executedKeys = new Set<string>();
      const executedNodeIds = new Set<string>();
      const loopState = new Map<string, { items: unknown[]; index: number; iteration: number }>();
      const maxNodeExecutions = Math.max(1, Math.min(Math.trunc(request.maxNodeExecutions ?? 1000), 10_000));
      let nodeExecutions = 0;

      while (pending.length > 0) {
        const activation = pending.shift()!;
        const key = `${activation.nodeId}::${activation.iteration}`;
        if (executedKeys.has(key)) continue;
        const node = nodeById.get(activation.nodeId)!;
        this.assertDeadline(startedMs, maxDurationMs);
        nodeExecutions += 1;
        if (nodeExecutions > maxNodeExecutions) {
          throw new PlatformError(
            'WORKFLOW_ERROR',
            `Run exceeded its node execution cap (${maxNodeExecutions}).`,
          );
        }

        const decision = evaluateWorkflowNodePolicy(node, context);
        if (decision.outcome === 'deny') {
          throw new PlatformError('AUTHORIZATION_DENIED', decision.reason);
        }
        if (decision.outcome === 'require_approval') {
          const step = this.stepResult(node.id, 'WAITING_APPROVAL', { reason: decision.reason });
          run = await this.updateRun(run, { status: 'WAITING_APPROVAL', steps: [...run.steps, step] });
          await this.emit(run, 'step.started', { nodeId: node.id, nodeType: node.type, reason: decision.reason }, ++sequence);
          await this.publishDomainEvent('orcflo.run.approval_requested', run, workflow, {
            nodeId: node.id,
            nodeType: node.type,
            reason: decision.reason,
          }, context);
          return run;
        }

        const stepInput = { ...run.input, ...outputs };
        if (activation.loopItem) {
          // Loop body nodes consume the current item through input.item /
          // input.index / input.iteration (deterministic, no templating DSL).
          stepInput.item = activation.loopItem.item;
          stepInput.index = activation.loopItem.index;
          stepInput.iteration = activation.loopItem.iteration;
        }
        const stepStartedAt = this.clock.isoNow();
        inFlightNodeId = node.id;
        await this.emit(run, 'step.started', { nodeId: node.id, nodeType: node.type }, ++sequence);

        let step: OrcfloStepResult;
        let nodeOutput: unknown;
        let firedEdges: WorkflowEdge[] = [];
        let loopItem: Activation['loopItem'];

        if (node.type === 'for_each') {
          // Bounded loop head (§14). Visits alternate: emit one item and
          // fire the body edges, or (done) fire the loopExit edges.
          const maxItems = this.clampInt(node.configuration.maxItems, 1, 10_000, 100);
          const maxIterations = this.clampInt(node.configuration.maxIterations, 1, 10_000, 100);
          let state = loopState.get(node.id);
          if (!state) {
            const items = resolveCollection(stepInput, String(node.configuration.collection ?? ''));
            if (items.length > maxItems) {
              throw new PlatformError(
                'WORKFLOW_ERROR',
                `for_each node ${node.id} exceeded its item limit: ${items.length} items, maxItems ${maxItems}.`,
              );
            }
            state = { items, index: 0, iteration: 0 };
            loopState.set(node.id, state);
          }
          const done = state.index >= state.items.length || state.iteration >= maxIterations;
          if (done) {
            if (state.index < state.items.length) {
              throw new PlatformError(
                'WORKFLOW_ERROR',
                `for_each node ${node.id} reached its iteration limit (${maxIterations}) with items remaining; the loop could not terminate.`,
              );
            }
            nodeOutput = { done: true, count: state.items.length, processed: state.index, iterations: state.iteration };
            firedEdges = (outgoing.get(node.id) ?? []).filter((edge) => edge.loopExit === true);
            loopState.delete(node.id);
          } else {
            const item = state.items[state.index];
            const iteration = state.iteration;
            state.index += 1;
            state.iteration += 1;
            nodeOutput = { item, index: iteration, iteration, done: false, count: state.items.length };
            firedEdges = (outgoing.get(node.id) ?? []).filter((edge) => edge.loop !== true && edge.loopExit !== true);
            loopItem = { item, index: iteration, iteration };
          }
          step = this.stepResult(node.id, 'COMPLETED', nodeOutput, stepStartedAt);
          evidence.push({
            type: 'internal_trace',
            summary: `for_each node ${node.id} emitted ${String((nodeOutput as Record<string, unknown>).done)} at iteration ${String((nodeOutput as Record<string, unknown>).iteration ?? 'final')}.`,
            data: { nodeId: node.id, done: (nodeOutput as Record<string, unknown>).done },
          });
        } else if (node.type === 'condition') {
          // Deterministic condition (§12) — code, never an LLM.
          const output = evaluateCondition(node.configuration, stepInput);
          nodeOutput = output;
          firedEdges = (outgoing.get(node.id) ?? []).filter(
            (edge) => edge.loop === true || edgeGuardFires(edge, output),
          );
          step = this.stepResult(node.id, 'COMPLETED', output, stepStartedAt);
          evidence.push({
            type: 'internal_trace',
            summary: `condition node ${node.id} evaluated ${String(node.configuration.path)} -> ${String(output.result)}.`,
            data: { nodeId: node.id, path: node.configuration.path, result: output.result },
          });
        } else if (node.type === 'router') {
          // Router (§13) — structured, deterministic branch selection.
          const output = selectRoute(node.configuration, stepInput);
          nodeOutput = output;
          firedEdges = (outgoing.get(node.id) ?? []).filter((edge) => edge.sourceHandle === output.route);
          if (firedEdges.length === 0 && (outgoing.get(node.id) ?? []).length > 0) {
            throw new PlatformError(
              'WORKFLOW_ERROR',
              `Router node ${node.id} selected route "${output.route}" but no outgoing edge carries that sourceHandle.`,
            );
          }
          step = this.stepResult(node.id, 'COMPLETED', output, stepStartedAt);
          evidence.push({
            type: 'internal_trace',
            summary: `router node ${node.id} selected route ${output.route}.`,
            data: { nodeId: node.id, route: output.route },
          });
        } else {
          // Handler-based nodes (trigger, action, tool, ai_model, agent,
          // mcp, handoff, ...) with cache, retry, cost and evidence.
          const cacheable = node.configuration.cacheable === true;
          let cacheKey: string | undefined;
          if (cacheable) {
            cacheKey = this.stepCacheKey(workflow, node, stepInput);
            const entry = await this.ports.stepCache.findByKey(context.tenantId, cacheKey);
            if (entry) {
              await this.ports.stepCache.recordHit(context.tenantId, cacheKey, this.clock.isoNow());
              await this.meter(context, { metric: 'step.cache_hit', unit: 'count', amount: 1, run, workflow, nodeId: node.id });
              step = this.stepResult(node.id, 'CACHED', entry.output, stepStartedAt, { cacheKey, cacheHit: true });
              run = await this.updateRun(run, { steps: [...run.steps, step] });
              await this.emit(run, 'step.cached', { nodeId: node.id, nodeType: node.type, cacheKey }, ++sequence);
              nodeOutput = entry.output;
              firedEdges = this.firedEdgesFor(node, nodeOutput, outgoing);
              executedKeys.add(key);
              executedNodeIds.add(node.id);
              outputs[node.id] = nodeOutput;
              inFlightNodeId = undefined;
              this.enqueueFiredEdges(pending, firedEdges, activation);
              continue;
            }
            await this.meter(context, { metric: 'step.cache_miss', unit: 'count', amount: 1, run, workflow, nodeId: node.id });
          }

          const handler = runHandlers.get(node.type);
          if (!handler) {
            throw new PlatformError('WORKFLOW_ERROR', `No deterministic handler is registered for node type ${node.type}.`);
          }
          const result = await this.executeWithRetry(node, handler, stepInput, startedMs, maxDurationMs);
          const resultCost = result.costMinor ?? 0;
          if (!Number.isSafeInteger(resultCost) || resultCost < 0) {
            throw new PlatformError('WORKFLOW_ERROR', `Node ${node.id} returned an invalid cost.`);
          }
          spentMinor += resultCost;
          if (spentMinor > maxCostMinor) {
            throw new PlatformError('WORKFLOW_ERROR', 'Run cost limit was exceeded.');
          }
          evidence.push(...result.evidence);
          nodeOutput = result.output;
          step = this.stepResult(node.id, 'COMPLETED', result.output, stepStartedAt, {
            cacheKey,
            costMinor: resultCost,
            evidenceCount: result.evidence.length,
          });
          firedEdges = this.firedEdgesFor(node, nodeOutput, outgoing);

          if (cacheKey) {
            await this.ports.stepCache.save(OrcfloStepCacheEntrySchema.parse({
              id: createId('cache'),
              tenantId: context.tenantId,
              key: cacheKey,
              workflowId: workflow.id,
              workflowVersion: workflow.version,
              nodeId: node.id,
              inputHash: cacheKey,
              output: result.output,
              hits: 0,
              createdAt: this.clock.isoNow(),
            }));
          }
        }

        run = await this.updateRun(run, { steps: [...run.steps, step] });
        await this.emit(run, 'step.completed', {
          nodeId: node.id,
          nodeType: node.type,
          costMinor: node.type === 'for_each' || node.type === 'condition' || node.type === 'router' ? 0 : (step.costMinor ?? 0),
          evidenceCount: step.evidenceCount,
        }, ++sequence);
        await this.meter(context, { metric: 'step.count', unit: 'count', amount: 1, run, workflow, nodeId: node.id });

        executedKeys.add(key);
        executedNodeIds.add(node.id);
        outputs[node.id] = nodeOutput;
        inFlightNodeId = undefined;
        this.enqueueFiredEdges(pending, firedEdges, activation, loopItem);
      }

      // Record SKIPPED steps for nodes in untaken branches (run history).
      for (const node of topo) {
        if (executedNodeIds.has(node.id)) continue;
        if ((incoming.get(node.id) ?? []).length === 0) continue;
        run = await this.updateRun(run, {
          steps: [...run.steps, this.stepResult(node.id, 'SKIPPED', {
            reason: 'No incoming edge fired; this branch was not taken.',
          })],
        });
      }

      if (evidence.length === 0) {
        throw new PlatformError('WORKFLOW_ERROR', 'Run produced no observable completion evidence.');
      }
      const completedAt = this.clock.isoNow();
      run = await this.updateRun(run, {
        status: 'COMPLETED',
        output: { spentMinor, evidenceCount: evidence.length, stepCount: run.steps.length },
        completedAt,
      });
      await this.emit(run, 'run.completed', { spentMinor, evidenceCount: evidence.length }, ++sequence);
      await this.meter(context, {
        metric: 'run.duration_ms',
        unit: 'ms',
        amount: Math.max(0, this.clock.now() - startedMs),
        run,
        workflow,
      });
      await this.publishDomainEvent('orcflo.run.completed', run, workflow, {
        spentMinor,
        evidenceCount: evidence.length,
      }, context);
      return run;
    } catch (error) {
      const failure = asPlatformError(error);
      const failedNode = inFlightNodeId ?? run.steps.at(-1)?.nodeId;
      run = await this.updateRun(run, {
        status: 'FAILED',
        output: { code: failure.code, message: failure.message, failedAfterNode: failedNode },
        completedAt: this.clock.isoNow(),
      });
      if (failedNode) {
        await this.emit(run, 'step.failed', { nodeId: failedNode, code: failure.code, message: failure.message }, ++sequence);
      }
      await this.emit(run, 'run.failed', { code: failure.code, message: failure.message }, ++sequence);
      if (failedNode) {
        await this.meter(context, { metric: 'step.failed', unit: 'count', amount: 1, run, workflow, nodeId: failedNode });
      }
      await this.publishDomainEvent('orcflo.run.failed', run, workflow, {
        code: failure.code,
        message: failure.message,
      }, context);
      throw failure;
    }
  }

  // --- Read side (routes) ---

  async getRun(context: ActorContext, runId: string): Promise<OrcfloRun | null> {
    this.assertRead(context);
    return this.ports.runs.findById(context.tenantId, runId);
  }

  async listRuns(context: ActorContext, options: { workflowId?: string; limit?: number } = {}): Promise<OrcfloRun[]> {
    this.assertRead(context);
    return this.ports.runs.list(context.tenantId, options);
  }

  async listRunEvents(context: ActorContext, runId: string): Promise<import('../domain/orcflo').OrcfloRunEvent[]> {
    this.assertRead(context);
    return this.ports.runEvents.listForRun(context.tenantId, runId);
  }

  // --- Model providers ---

  async saveModelProvider(context: ActorContext, input: {
    name: string;
    kind: OrcfloModelProvider['kind'];
    model?: string;
    endpoint?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
  }): Promise<OrcfloModelProvider> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot save model providers.`);
    }
    const id = createId('model');
    const now = this.clock.isoNow();
    const provider = ModelProviderSchema.parse({
      ...input,
      id,
      tenantId: context.tenantId,
      model: input.model,
      endpoint: input.endpoint,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
      createdAt: now,
      updatedAt: now,
    });
    if (provider.kind === 'external' && !provider.endpoint) {
      throw new PlatformError('VALIDATION_ERROR', 'An endpoint is required for external model providers.');
    }
    await this.ports.modelProviders.save(provider);
    return provider;
  }

  async listModelProviders(context: ActorContext): Promise<OrcfloModelProvider[]> {
    this.assertRead(context);
    return this.ports.modelProviders.list(context.tenantId);
  }

  async callModel(context: ActorContext, request: {
    providerId: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<ModelCallResult> {
    const parsed = ModelCallRequestSchema.parse(request);
    if (!roleAllows(context.role, 'tool:invoke')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot invoke model providers.`);
    }
    const provider = await this.ports.modelProviders.findById(context.tenantId, parsed.providerId);
    if (!provider) throw new PlatformError('NOT_FOUND', `Model provider ${parsed.providerId} was not found.`);
    if (!provider.enabled) {
      throw new PlatformError('PROVIDER_ERROR', `Model provider ${provider.name} is disabled.`);
    }
    const startedMs = this.clock.now();
    try {
      const result = await this.model.call(provider, {
        tenantId: context.tenantId,
        providerId: provider.id,
        prompt: parsed.prompt,
        maxTokens: parsed.maxTokens,
      });
      const completed = ModelCallResultSchema.parse({ ...result, durationMs: Math.max(0, this.clock.now() - startedMs) });
      await this.meter(context, { metric: 'model.call', unit: 'count', amount: 1 });
      await this.meter(context, { metric: 'model.tokens_in', unit: 'tokens', amount: completed.tokensIn });
      await this.meter(context, { metric: 'model.tokens_out', unit: 'tokens', amount: completed.tokensOut });
      return completed;
    } catch (error) {
      const failure = asPlatformError(error);
      await this.meter(context, { metric: 'model.failed', unit: 'count', amount: 1 });
      throw failure;
    }
  }

  // --- Metering ---

  async meteringSummary(context: ActorContext, since?: string): Promise<OrcfloMeteringSummary> {
    this.assertRead(context);
    const records = await this.ports.metering.list(context.tenantId, since ? { since } : {});
    const sum = (metric: OrcfloMeteringMetric): number =>
      records.filter((record) => record.metric === metric).reduce((total, record) => total + record.amount, 0);
    return OrcfloMeteringSummarySchema.parse({
      tenantId: context.tenantId,
      since,
      runs: sum('run.count'),
      steps: sum('step.count'),
      cacheHits: sum('step.cache_hit'),
      cacheMisses: sum('step.cache_miss'),
      failedSteps: sum('step.failed'),
      modelCalls: sum('model.call'),
      modelFailures: sum('model.failed'),
      tokensIn: sum('model.tokens_in'),
      tokensOut: sum('model.tokens_out'),
      durationMs: sum('run.duration_ms'),
      costMinor: sum('cost.minor'),
    });
  }

  // --- Internals ---

  private assertRead(context: ActorContext): void {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read workflow runtime data.`);
    }
  }

  /**
   * AGENT node — the WORKFLOW → AGENT bridge.
   *
   * Executes through the canonical `BoundedAgentRuntime` (same agent
   * lifecycle, policy, tool registry, budget and evidence gates as a
   * direct agent run). No second agent implementation exists inside the
   * workflow engine. Node configuration:
   *
   *   - `agentId` (required) — the registered, tenant-scoped agent.
   *   - `toolId` (optional) — a tool the deterministic planner invokes
   *     once before completing; the agent's own `toolIds` assignment
   *     and `evaluateToolPolicy` still govern it.
   *   - `objective` / `promptTemplate` (optional) — the bounded objective.
   *
   * Lifecycle boundary: the canonical runtime transitions the agent
   * READY → RUNNING → COMPLETED (or FAILED). Re-running an agent node
   * therefore requires a fresh/READY agent — reuse is governed by the
   * canonical lifecycle, exactly as outside workflows.
   */
  private createAgentNodeHandler(context: ActorContext, runId: string): WorkflowNodeHandler {
    return async (node, input, signal): Promise<WorkflowNodeResult> => {
      if (signal.aborted) {
        throw new PlatformError('TIMEOUT', `${node.label} was aborted.`, { retryable: true });
      }
      const runtime = this.options.agentRuntime;
      if (!runtime) {
        throw new PlatformError(
          'CONFIGURATION_ERROR',
          `Agent node ${node.id} cannot execute: no canonical agent runtime is wired. Agent nodes run only through BoundedAgentRuntime.`,
        );
      }
      const agentId = node.configuration.agentId;
      if (typeof agentId !== 'string' || agentId.length === 0) {
        throw new PlatformError(
          'CONFIGURATION_ERROR',
          `Agent node ${node.id} requires configuration.agentId. No agent is configured.`,
        );
      }
      const toolId = typeof node.configuration.toolId === 'string' && node.configuration.toolId.length > 0
        ? node.configuration.toolId
        : undefined;
      const objective = typeof node.configuration.objective === 'string'
        ? node.configuration.objective
        : typeof node.configuration.promptTemplate === 'string'
          ? node.configuration.promptTemplate
          : `Process the run input for ${node.label}.`;

      const result = await runtime.run({
        agentId,
        executionId: `${runId}::${node.id}`,
        objective,
        input,
        context,
        planner: async (state) => {
          if (signal.aborted) {
            throw new PlatformError('TIMEOUT', `${node.label} agent was aborted.`, { retryable: true });
          }
          if (toolId && state.iteration === 1 && state.observations.length === 0) {
            return { action: 'invoke_tool', toolId, input: { ...state.input } };
          }
          return {
            action: 'complete',
            summary: `Agent node ${node.label} completed after ${state.iteration} iteration(s) with ${state.evidence.length} evidence item(s).`,
          };
        },
      });
      if (result.status === 'WAITING_APPROVAL') {
        throw new PlatformError(
          'WORKFLOW_ERROR',
          `Agent node ${node.id} requires human approval; approval resumption inside runs is not yet wired.`,
        );
      }
      return {
        output: {
          agentId,
          status: result.status,
          summary: result.summary,
          iterations: result.iterations,
          toolCalls: result.toolCalls,
          spentMinor: result.spentMinor,
          evidenceCount: result.evidence.length,
        },
        evidence: result.evidence,
        costMinor: result.spentMinor,
      };
    };
  }

  /**
   * AI_MODEL node — a direct, bounded call through the fail-closed model
   * gateway. Distinct from AGENT nodes: an AI model node has no agent
   * lifecycle, tools, or autonomy; it receives only the mapped context.
   */
  private createAiModelNodeHandler(context: ActorContext): WorkflowNodeHandler {
    return async (node, input, signal): Promise<WorkflowNodeResult> => {
      if (signal.aborted) {
        throw new PlatformError('TIMEOUT', `${node.label} was aborted.`, { retryable: true });
      }
      const providerId = node.configuration.modelProviderId;
      if (typeof providerId !== 'string' || providerId.length === 0) {
        throw new PlatformError(
          'CONFIGURATION_ERROR',
          `AI model node ${node.id} requires configuration.modelProviderId. No model provider is configured.`,
        );
      }
      const provider = await this.ports.modelProviders.findById(context.tenantId, providerId);
      if (!provider) {
        throw new PlatformError('NOT_FOUND', `Model provider ${providerId} was not found for AI model node ${node.id}.`);
      }
      const promptTemplate = typeof node.configuration.promptTemplate === 'string'
        ? node.configuration.promptTemplate
        : `Process the run input for ${node.label}.`;
      const requestedMaxTokens = Number(node.configuration.maxTokens ?? 256);
      const maxTokens = Number.isFinite(requestedMaxTokens)
        ? Math.max(1, Math.min(Math.trunc(requestedMaxTokens), 4_096))
        : 256;
      const result = await this.callModel(context, {
        providerId: provider.id,
        prompt: `${promptTemplate}\n\nInput: ${stableStringify(input)}`,
        maxTokens,
      });
      return {
        output: {
          providerId: provider.id,
          providerName: provider.name,
          model: provider.model ?? null,
          response: result.text ?? null,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
        evidence: [{
          type: 'internal_trace',
          summary: `AI model node ${node.id} completed via ${provider.kind} model provider ${provider.name}.`,
          data: { nodeId: node.id, providerId: provider.id, simulated: provider.kind === 'demo' },
        }],
        costMinor: 0,
      };
    };
  }

  /** Clamp an integer config value; falls back when missing/NaN. */
  private clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(Math.trunc(number), max));
  }

  /**
   * Which outgoing edges fire after `node` completes. Handler nodes and
   * condition nodes use `edge.condition` guards; routers fire only the
   * edge whose `sourceHandle` matches the chosen route. Loop back edges
   * are always included here — `enqueueFiredEdges` turns them into a
   * re-entry of the loop head for the next iteration.
   */
  private firedEdgesFor(
    node: WorkflowNode,
    output: unknown,
    outgoing: Map<string, WorkflowEdge[]>,
  ): WorkflowEdge[] {
    const candidates = outgoing.get(node.id) ?? [];
    if (node.type === 'router') {
      const route = (output as { route?: string }).route;
      return candidates.filter((edge) => edge.sourceHandle === route);
    }
    return candidates.filter((edge) => edge.loop === true || edgeGuardFires(edge, output));
  }

  /** Enqueue the targets of fired edges; loop back edges re-enter the head. */
  private enqueueFiredEdges(
    pending: Array<{ nodeId: string; iteration: number; loopItem?: { item: unknown; index: number; iteration: number } }>,
    firedEdges: WorkflowEdge[],
    activation: { iteration: number; loopItem?: { item: unknown; index: number; iteration: number } },
    loopItem?: { item: unknown; index: number; iteration: number },
  ): void {
    for (const edge of firedEdges) {
      if (edge.loop === true) {
        // Back edge: the loop body finished one pass; revisit the head
        // for the next item (or the done check).
        pending.push({ nodeId: edge.target, iteration: (activation.loopItem?.iteration ?? 0) + 1 });
        continue;
      }
      pending.push({ nodeId: edge.target, iteration: activation.iteration, loopItem: loopItem ?? activation.loopItem });
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
        const timeoutMs = Math.max(1, Math.min(configuredTimeout, maxDurationMs - (this.clock.now() - started)));
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

  private stepResult(
    nodeId: string,
    status: OrcfloStepResult['status'],
    output: unknown,
    startedAt = this.clock.isoNow(),
    extras: Partial<Omit<OrcfloStepResult, 'nodeId' | 'status' | 'startedAt'>> = {},
  ): OrcfloStepResult {
    return {
      nodeId,
      status,
      attempt: 1,
      startedAt,
      output,
      completedAt: status === 'COMPLETED' || status === 'CACHED' || status === 'FAILED' ? this.clock.isoNow() : undefined,
      cacheHit: false,
      costMinor: 0,
      evidenceCount: 0,
      modelCalls: 0,
      ...extras,
    };
  }

  private async updateRun(run: OrcfloRun, patch: Partial<OrcfloRun>): Promise<OrcfloRun> {
    const updated = OrcfloRunSchema.parse({ ...run, ...patch, updatedAt: this.clock.isoNow() });
    await this.ports.runs.save(updated);
    return updated;
  }

  private stepCacheKey(workflow: Workflow, node: WorkflowNode, input: Record<string, unknown>): string {
    const digest = createHash('sha256')
      .update(stableStringify({
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        nodeId: node.id,
        configuration: node.configuration,
        input,
      }))
      .digest('hex');
    return `sc_${digest.slice(0, 60)}`;
  }

  private assertDeadline(started: number, maxDurationMs: number): void {
    if (this.clock.now() - started >= maxDurationMs) {
      throw new PlatformError('TIMEOUT', 'Run deadline was reached.', { retryable: true });
    }
  }

  private async emit(
    run: OrcfloRun,
    eventType: OrcfloRunEventType,
    payload: Record<string, unknown>,
    sequence: number,
  ): Promise<void> {
    const event = OrcfloRunEventSchema.parse({
      id: createId('runevt'),
      tenantId: run.tenantId,
      runId: run.id,
      sequence,
      eventType,
      nodeId: typeof payload.nodeId === 'string' ? payload.nodeId : undefined,
      status: typeof payload.status === 'string' ? payload.status : undefined,
      payload,
      occurredAt: this.clock.isoNow(),
    });
    await this.ports.runEvents.append(event);
  }

  private async meter(
    context: ActorContext,
    input: {
      metric: OrcfloMeteringMetric;
      unit: string;
      amount: number;
      run?: OrcfloRun;
      workflow?: Workflow;
      nodeId?: string;
    },
  ): Promise<void> {
    await this.ports.metering.record(OrcfloMeteringRecordSchema.parse({
      id: createId('meter'),
      tenantId: context.tenantId,
      runId: input.run?.id,
      workflowId: input.workflow?.id ?? input.run?.workflowId,
      nodeId: input.nodeId,
      metric: input.metric,
      unit: input.unit,
      amount: input.amount,
      recordedAt: this.clock.isoNow(),
    }));
  }

  private async publishDomainEvent(
    eventType: string,
    run: OrcfloRun,
    workflow: Workflow,
    payload: Record<string, unknown>,
    context: ActorContext,
  ): Promise<void> {
    await this.ports.events.publish(createDomainEvent(eventType, { type: 'orcflo_run', id: run.id }, {
      workflowId: workflow.id,
      runId: run.id,
      ...payload,
    }, context));
  }
}
