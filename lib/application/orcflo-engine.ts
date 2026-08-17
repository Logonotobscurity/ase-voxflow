import { createHash } from 'node:crypto';
import { PlatformError, asPlatformError } from '../domain/errors';
import { createDomainEvent, createId } from '../domain/events';
import { stableStringify } from '../domain/stable-json';
import {
  ModelCallRequestSchema,
  ModelCallResultSchema,
  ModelProviderSchema,
  OrcfloDecisionRecordSchema,
  OrcfloMeteringRecordSchema,
  OrcfloMeteringSummarySchema,
  OrcfloRunEventSchema,
  OrcfloRunSchema,
  OrcfloStepCacheEntrySchema,
  type ModelCallResult,
  type OrcfloDecisionRecord,
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
import type { RunEventBus } from './run-event-bus';
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
  /**
   * §48 idempotency — a stable key. When provided, a previous run with
   * the same (tenantId, idempotencyKey) is returned instead of starting
   * a duplicate; webhook/event triggers derive keys from their payload
   * so duplicate deliveries dedupe automatically.
   */
  idempotencyKey?: string;
  maxDurationMs?: number;
  maxCostMinor?: number;
  /**
   * Global safety cap on node executions per run (including loop
   * iterations). Default 1000, clamped to [1, 10000]. A workflow
   * exceeding it fails with WORKFLOW_ERROR and a machine-readable
   * reason (§40 of the workflow directive).
   */
  maxNodeExecutions?: number;
  /**
   * §47 — concurrency. Independent (ready-at-the-same-time) handler
   * nodes execute concurrently up to this limit. Default 4, clamped to
   * [1, 32]. Control nodes (for_each/condition/router) always run
   * sequentially and step/event ordering stays deterministic
   * (topological order within each wave), so parallel execution never
   * changes the observable run.
   */
  maxConcurrency?: number;
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
      /**
       * §11/§36 — in-process live run stream. When present, every appended
       * run event is also published here so SSE subscribers receive live
       * events without polling. Single-process semantics; a NATS-backed
       * bus replaces it in multi-instance deployments.
       */
      runEventBus?: RunEventBus;
    } = {},
  ) {
    this.baseHandlers = new Map(handlers);
  }

  async startRun(request: StartRunRequest): Promise<OrcfloRun> {
    const run = await this.createRun(request);
    return this.executeRun(run.id);
  }

  /**
   * §25/§36 durable execution — create a PENDING run without executing it.
   * The caller context and execution bounds are captured on the run so a
   * background worker (RunDispatcher) can execute it later with the exact
   * same policy / metering / event surface.
   */
  async createRun(request: StartRunRequest): Promise<OrcfloRun> {
    const { context } = request;
    if (!roleAllows(context.role, 'workflow:execute')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot execute workflows.`);
    }
    // §48 — validate the idempotency key at the request boundary so the
    // platform error envelope (not a raw Zod error) is returned.
    if (request.idempotencyKey !== undefined && request.idempotencyKey !== '') {
      const key = request.idempotencyKey.trim();
      if (key.length < 8 || key.length > 200) {
        throw new PlatformError(
          'VALIDATION_ERROR',
          'idempotencyKey must be between 8 and 200 characters.',
        );
      }
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

    // §48 idempotency — a previous run with the same tenant + key is
    // replayed as-is (historical runs are immutable; the new input is
    // deliberately ignored). A key reused for a different workflow is
    // a caller error.
    if (request.idempotencyKey !== undefined && request.idempotencyKey !== '') {
      const existing = await this.ports.runs.findByIdempotencyKey(context.tenantId, request.idempotencyKey);
      if (existing) {
        if (existing.workflowId !== workflow.id) {
          throw new PlatformError(
            'CONFLICT',
            `Idempotency key ${request.idempotencyKey} is already associated with a different workflow.`,
          );
        }
        return existing;
      }
    }
    const now = this.clock.isoNow();
    const run = OrcfloRunSchema.parse({
      id: createId('run'),
      tenantId: context.tenantId,
      workflowId: workflow.id,
      blueprintId: request.blueprintId,
      triggerId: request.triggerId,
      triggerKind: request.triggerKind,
      status: 'PENDING',
      input: request.input ?? {},
      steps: [],
      correlationId: context.correlationId,
      idempotencyKey: request.idempotencyKey === '' ? undefined : request.idempotencyKey,
      actorId: context.actorId,
      role: context.role,
      environment: context.environment,
      limits: {
        maxDurationMs: request.maxDurationMs === undefined ? undefined : Math.max(100, Math.min(request.maxDurationMs, 120_000)),
        maxCostMinor: request.maxCostMinor === undefined ? undefined : Math.max(0, Math.min(request.maxCostMinor, 100_000_000)),
        maxNodeExecutions: request.maxNodeExecutions === undefined ? undefined : Math.max(1, Math.min(Math.trunc(request.maxNodeExecutions), 10_000)),
        maxConcurrency: request.maxConcurrency === undefined ? undefined : Math.max(1, Math.min(Math.trunc(request.maxConcurrency), 32)),
      },
      createdAt: now,
      updatedAt: now,
    });
    try {
      await this.ports.runs.save(run);
    } catch (error) {
      // §48 — a concurrent request won the race with the same key.
      // Replay the winner instead of failing.
      if (request.idempotencyKey) {
        const winner = await this.ports.runs.findByIdempotencyKey(context.tenantId, request.idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
    return run;
  }

  /**
   * §25/§36/§49 durable execution — execute (or resume) a run:
   *
   *   PENDING → RUNNING → terminal
   *   WAITING_APPROVAL + approval.APPROVED → resume from the approval node
   *   WAITING_APPROVAL + approval.REJECTED → CANCELLED (at decision time)
   *
   * Terminal runs are returned as-is, so a worker may safely re-tick over
   * the same PENDING list without duplicating work. Runs already RUNNING
   * are left to the worker that owns them (single-process semantics in
   * this increment; multi-worker claim/lease is future work).
   */
  async executeRun(runId: string, options: { workerId?: string } = {}): Promise<OrcfloRun> {
    const stored = await this.ports.runs.findByIdGlobal(runId);
    if (!stored) throw new PlatformError('NOT_FOUND', `Run ${runId} was not found.`);
    if (stored.status === 'COMPLETED' || stored.status === 'FAILED' || stored.status === 'CANCELLED') {
      return stored;
    }
    if (stored.status === 'RUNNING') return stored;
    // Multi-worker claim guard: a PENDING run claimed by another worker
    // with a live lease is being executed elsewhere — leave it alone.
    // The claiming worker passes its own workerId and proceeds.
    if (
      stored.status === 'PENDING'
      && stored.claimedBy !== undefined
      && stored.claimedUntil !== undefined
      && Date.parse(stored.claimedUntil) > Date.now()
      && stored.claimedBy !== options.workerId
    ) {
      return stored;
    }

    const resume = stored.status === 'WAITING_APPROVAL' && stored.approval?.decision === 'APPROVED';
    if (stored.status === 'WAITING_APPROVAL' && !resume) return stored; // paused, no decision yet

    const storedWorkflow = await this.ports.workflows.findById(stored.tenantId, stored.workflowId);
    if (!storedWorkflow) throw new PlatformError('NOT_FOUND', `Workflow ${stored.workflowId} was not found.`);
    const workflow = WorkflowSchema.parse(storedWorkflow);
    const context: ActorContext = {
      tenantId: stored.tenantId,
      actorId: stored.actorId ?? 'actor_worker',
      role: stored.role ?? 'OPERATOR',
      correlationId: stored.correlationId,
      environment: stored.environment ?? 'demo',
    };
    const maxDurationMs = Math.min(stored.limits?.maxDurationMs ?? 30_000, 120_000);
    const maxCostMinor = Math.min(stored.limits?.maxCostMinor ?? 100_000, 100_000_000);
    const maxNodeExecutions = Math.max(1, Math.min(Math.trunc(stored.limits?.maxNodeExecutions ?? 1000), 10_000));
    const maxConcurrency = Math.max(1, Math.min(Math.trunc(stored.limits?.maxConcurrency ?? 4), 32));
    // The resumed phase gets a fresh deadline window so an approval pause
    // does not consume the run's execution budget; total wall time is
    // still reported from the original startedAt.
    const startedMs = this.clock.now();
    const startedAt = stored.startedAt ?? this.clock.isoNow();

    let run = resume
      ? stored
      : OrcfloRunSchema.parse({ ...stored, status: 'RUNNING', startedAt, updatedAt: this.clock.isoNow() });
    let sequence = (await this.ports.runEvents.listForRun(stored.tenantId, run.id))
      .reduce((max, event) => Math.max(max, event.sequence), 0);
    if (resume) {
      // Replace the WAITING_APPROVAL step with a COMPLETED (approved) step
      // so run history shows the decision and the resume seed below can
      // treat the approval node as executed.
      const approvalStep = run.steps.find((step) => step.status === 'WAITING_APPROVAL');
      if (!approvalStep) {
        throw new PlatformError(
          'WORKFLOW_ERROR',
          `Run ${run.id} is WAITING_APPROVAL but has no approval step to resume from.`,
        );
      }
      const replaced = run.steps.map((step) => (
        step === approvalStep
          ? this.stepResult(approvalStep.nodeId, 'COMPLETED', {
              approved: true,
              decidedBy: run.approval?.decidedBy,
              reason: run.approval?.reason,
            }, approvalStep.startedAt, { iteration: approvalStep.iteration })
          : step
      ));
      run = await this.updateRun(run, { steps: replaced });
      await this.emit(run, 'run.resumed', { workflowId: workflow.id, workflowVersion: workflow.version }, ++sequence);
    } else {
      await this.ports.runs.save(run);
      await this.emit(run, 'run.started', { workflowId: workflow.id, workflowVersion: workflow.version }, ++sequence);
      await this.meter(context, { metric: 'run.count', unit: 'count', amount: 1, run, workflow });
      await this.publishDomainEvent('orcflo.run.started', run, workflow, {}, context);
    }

    const evidence: ExecutionEvidence[] = [];
    const outputs: Record<string, unknown> = {};
    let spentMinor = 0;
    let evidenceCountTotal = 0;
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
      const keyOf = (act: Activation): string => `${act.nodeId}::${act.iteration}`;
      let pending: Activation[] = entryOrder.map((nodeId) => ({ nodeId, iteration: 0 }));
      const executedKeys = new Set<string>();
      const executedNodeIds = new Set<string>();
      const loopState = new Map<string, { items: unknown[]; index: number; iteration: number }>();
      if (resume) {
        const seed = this.buildResumeSeed(run, nodeById, incoming);
        Object.assign(outputs, seed.outputs);
        for (const key of seed.executedKeys) executedKeys.add(key);
        for (const id of seed.executedNodeIds) executedNodeIds.add(id);
        spentMinor = seed.spentMinor;
        evidenceCountTotal = seed.evidenceCountTotal;
        pending = seed.pending;
      }
      const topoIndex = new Map(topo.map((node, index) => [node.id, index]));
      const isControlType = (type: WorkflowNode['type']): boolean =>
        type === 'for_each' || type === 'condition' || type === 'router';
      let nodeExecutions = 0;

      // Wave loop (§47): each wave is the set of activations ready at the
      // same moment (deduped). Control nodes run sequentially (they mutate
      // loop/run state); handler nodes run concurrently up to maxConcurrency.
      // Every node in a wave sees the same base context (run input + all
      // prior waves' outputs), and step/event ordering is deterministic
      // (topological order within the wave), so parallel execution never
      // changes the observable run.
      while (pending.length > 0) {
        // 1. Snapshot the current wave.
        const wave: Activation[] = [];
        const waveSeen = new Set<string>();
        while (pending.length > 0) {
          const act = pending.shift()!;
          const key = keyOf(act);
          if (executedKeys.has(key) || waveSeen.has(key)) continue;
          waveSeen.add(key);
          wave.push(act);
        }
        wave.sort((a, b) => (topoIndex.get(a.nodeId) ?? 0) - (topoIndex.get(b.nodeId) ?? 0));
        const waveBaseInputs = { ...run.input, ...outputs };
        const nextPending: Activation[] = [];

        // 2. Control nodes (for_each / condition / router) — sequential.
        for (const act of wave) {
          const node = nodeById.get(act.nodeId)!;
          if (!isControlType(node.type)) continue;
          this.assertDeadline(startedMs, maxDurationMs);
          nodeExecutions += 1;
          if (nodeExecutions > maxNodeExecutions) {
            throw new PlatformError('WORKFLOW_ERROR', `Run exceeded its node execution cap (${maxNodeExecutions}).`);
          }
          const decision = evaluateWorkflowNodePolicy(node, context);
          if (decision.outcome === 'deny') {
            throw new PlatformError('AUTHORIZATION_DENIED', decision.reason);
          }
          const stepInput = { ...waveBaseInputs };
          if (act.loopItem) {
            stepInput.item = act.loopItem.item;
            stepInput.index = act.loopItem.index;
            stepInput.iteration = act.loopItem.iteration;
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
            step = this.stepResult(node.id, 'COMPLETED', nodeOutput, stepStartedAt, { iteration: act.iteration });
            await this.appendDecision(run, workflow, node, 'for_each',
              String(node.configuration.collection ?? ''), nodeOutput, act.iteration);
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
            step = this.stepResult(node.id, 'COMPLETED', output, stepStartedAt, { iteration: act.loopItem?.iteration ?? act.iteration });
            await this.appendDecision(run, workflow, node, 'condition',
              String(node.configuration.path ?? ''), output, act.loopItem?.iteration ?? act.iteration);
            evidence.push({
              type: 'internal_trace',
              summary: `condition node ${node.id} evaluated ${String(node.configuration.path)} -> ${String(output.result)}.`,
              data: { nodeId: node.id, path: node.configuration.path, result: output.result },
            });
          } else {
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
            step = this.stepResult(node.id, 'COMPLETED', output, stepStartedAt, { iteration: act.loopItem?.iteration ?? act.iteration });
            await this.appendDecision(run, workflow, node, 'router',
              String(node.configuration.pickPath ?? 'route'), output, act.loopItem?.iteration ?? act.iteration);
            evidence.push({
              type: 'internal_trace',
              summary: `router node ${node.id} selected route ${output.route}.`,
              data: { nodeId: node.id, route: output.route },
            });
          }

          run = await this.updateRun(run, { steps: [...run.steps, step] });
          await this.emit(run, 'step.completed', {
            nodeId: node.id,
            nodeType: node.type,
            costMinor: 0,
            evidenceCount: step.evidenceCount,
          }, ++sequence);
          await this.meter(context, { metric: 'step.count', unit: 'count', amount: 1, run, workflow, nodeId: node.id });

          executedKeys.add(keyOf(act));
          executedNodeIds.add(node.id);
          outputs[node.id] = nodeOutput;
          inFlightNodeId = undefined;
          this.enqueueFiredEdges(nextPending, firedEdges, act, loopItem);
        }

        // 3. Handler nodes (trigger, action, tool, ai_model, agent, mcp, ...).
        const handlerActs = wave.filter((act) => !isControlType(nodeById.get(act.nodeId)!.type));
        if (handlerActs.length === 0) {
          pending.push(...nextPending);
          continue;
        }

        // 3a. Policy pre-checks (deny -> fail; approval -> pause) — sequential.
        for (const act of handlerActs) {
          const node = nodeById.get(act.nodeId)!;
          const decision = evaluateWorkflowNodePolicy(node, context);
          if (decision.outcome === 'deny') {
            throw new PlatformError('AUTHORIZATION_DENIED', decision.reason);
          }
          if (decision.outcome === 'require_approval') {
            const step = this.stepResult(node.id, 'WAITING_APPROVAL', { reason: decision.reason }, undefined, {
              iteration: act.loopItem?.iteration ?? act.iteration,
            });
            run = await this.updateRun(run, { status: 'WAITING_APPROVAL', steps: [...run.steps, step] });
            await this.emit(run, 'step.started', { nodeId: node.id, nodeType: node.type, reason: decision.reason }, ++sequence);
            await this.publishDomainEvent('orcflo.run.approval_requested', run, workflow, {
              nodeId: node.id,
              nodeType: node.type,
              reason: decision.reason,
            }, context);
            return run;
          }
        }

        // 3b. Prepare activations and emit step.started (sequential, topo order).
        const prepared = handlerActs.map((act) => {
          const node = nodeById.get(act.nodeId)!;
          const stepInput = { ...waveBaseInputs };
          if (act.loopItem) {
            stepInput.item = act.loopItem.item;
            stepInput.index = act.loopItem.index;
            stepInput.iteration = act.loopItem.iteration;
          }
          return { act, node, stepInput, stepStartedAt: this.clock.isoNow() };
        });
        for (const p of prepared) {
          this.assertDeadline(startedMs, maxDurationMs);
          inFlightNodeId = p.node.id;
          await this.emit(run, 'step.started', { nodeId: p.node.id, nodeType: p.node.type }, ++sequence);
        }

        // 3c. Execute concurrently (§47). Results carry errors; nothing is
        // mutated here, so the run record is never written concurrently.
        const results = await this.mapWithConcurrency(prepared, maxConcurrency, async (p) => {
          try {
            const cacheable = p.node.configuration.cacheable === true;
            let cacheKey: string | undefined;
            if (cacheable) {
              cacheKey = this.stepCacheKey(workflow, p.node, p.stepInput);
              const entry = await this.ports.stepCache.findByKey(context.tenantId, cacheKey);
              if (entry) {
                return {
                  p,
                  cached: true as const,
                  cacheKey,
                  nodeOutput: entry.output,
                  step: this.stepResult(p.node.id, 'CACHED', entry.output, p.stepStartedAt, {
                    cacheKey,
                    cacheHit: true,
                    iteration: p.act.loopItem?.iteration ?? p.act.iteration,
                  }),
                  firedEdges: this.firedEdgesFor(p.node, entry.output, outgoing),
                  costMinor: 0,
                  evidenceAdded: [] as ExecutionEvidence[],
                };
              }
            }
            const handler = runHandlers.get(p.node.type);
            if (!handler) {
              throw new PlatformError('WORKFLOW_ERROR', `No deterministic handler is registered for node type ${p.node.type}.`);
            }
            const result = await this.executeWithRetry(p.node, handler, p.stepInput, startedMs, maxDurationMs);
            const resultCost = result.costMinor ?? 0;
            if (!Number.isSafeInteger(resultCost) || resultCost < 0) {
              throw new PlatformError('WORKFLOW_ERROR', `Node ${p.node.id} returned an invalid cost.`);
            }
            return {
              p,
              cached: false as const,
              cacheKey,
              nodeOutput: result.output,
              step: this.stepResult(p.node.id, 'COMPLETED', result.output, p.stepStartedAt, {
                cacheKey,
                costMinor: resultCost,
                evidenceCount: result.evidence.length,
                iteration: p.act.loopItem?.iteration ?? p.act.iteration,
              }),
              firedEdges: this.firedEdgesFor(p.node, result.output, outgoing),
              costMinor: resultCost,
              evidenceAdded: result.evidence,
            };
          } catch (error) {
            return { p, error };
          }
        });

        // 3d. Apply results sequentially in topological order (deterministic).
        for (const result of results) {
          const { p } = result;
          if ('error' in result) {
            inFlightNodeId = p.node.id;
            throw result.error;
          }
          nodeExecutions += 1;
          if (nodeExecutions > maxNodeExecutions) {
            throw new PlatformError('WORKFLOW_ERROR', `Run exceeded its node execution cap (${maxNodeExecutions}).`);
          }
          if (result.cached) {
            await this.ports.stepCache.recordHit(context.tenantId, result.cacheKey!, this.clock.isoNow());
            await this.meter(context, { metric: 'step.cache_hit', unit: 'count', amount: 1, run, workflow, nodeId: p.node.id });
            run = await this.updateRun(run, { steps: [...run.steps, result.step] });
            await this.emit(run, 'step.cached', { nodeId: p.node.id, nodeType: p.node.type, cacheKey: result.cacheKey }, ++sequence);
          } else {
            spentMinor += result.costMinor;
            if (spentMinor > maxCostMinor) {
              throw new PlatformError('WORKFLOW_ERROR', 'Run cost limit was exceeded.');
            }
            evidence.push(...result.evidenceAdded);
            if (result.cacheKey) {
              await this.meter(context, { metric: 'step.cache_miss', unit: 'count', amount: 1, run, workflow, nodeId: p.node.id });
            }
            run = await this.updateRun(run, { steps: [...run.steps, result.step] });
            await this.emit(run, 'step.completed', {
              nodeId: p.node.id,
              nodeType: p.node.type,
              costMinor: result.costMinor,
              evidenceCount: result.step.evidenceCount,
              cacheKey: result.cacheKey,
            }, ++sequence);
            if (result.cacheKey) {
              await this.ports.stepCache.save(OrcfloStepCacheEntrySchema.parse({
                id: createId('cache'),
                tenantId: context.tenantId,
                key: result.cacheKey,
                workflowId: workflow.id,
                workflowVersion: workflow.version,
                nodeId: p.node.id,
                inputHash: result.cacheKey,
                output: result.nodeOutput,
                hits: 0,
                createdAt: this.clock.isoNow(),
              }));
            }
          }
          await this.meter(context, { metric: 'step.count', unit: 'count', amount: 1, run, workflow, nodeId: p.node.id });
          executedKeys.add(keyOf(p.act));
          executedNodeIds.add(p.node.id);
          outputs[p.node.id] = result.nodeOutput;
          inFlightNodeId = undefined;
          this.enqueueFiredEdges(nextPending, result.firedEdges, p.act, p.act.loopItem);
        }

        pending.push(...nextPending);
      }

      // Record SKIPPED steps for nodes in untaken branches (run history).
      // The hasStepNodeIds guard prevents re-recording on resume, where the
      // persisted steps already contain SKIPPED entries for earlier passes.
      const hasStepNodeIds = new Set(run.steps.map((step) => step.nodeId));
      for (const node of topo) {
        if (executedNodeIds.has(node.id)) continue;
        if (hasStepNodeIds.has(node.id)) continue;
        if ((incoming.get(node.id) ?? []).length === 0) continue;
        run = await this.updateRun(run, {
          steps: [...run.steps, this.stepResult(node.id, 'SKIPPED', {
            reason: 'No incoming edge fired; this branch was not taken.',
          })],
        });
      }

      if (evidence.length === 0 && evidenceCountTotal === 0) {
        throw new PlatformError('WORKFLOW_ERROR', 'Run produced no observable completion evidence.');
      }
      const completedAt = this.clock.isoNow();
      const totalEvidence = evidenceCountTotal + evidence.length;
      run = await this.updateRun(run, {
        status: 'COMPLETED',
        output: { spentMinor, evidenceCount: totalEvidence, stepCount: run.steps.length },
        completedAt,
      });
      await this.emit(run, 'run.completed', { spentMinor, evidenceCount: totalEvidence }, ++sequence);
      await this.meter(context, {
        metric: 'run.duration_ms',
        unit: 'ms',
        amount: Math.max(0, this.clock.now() - Date.parse(startedAt ?? this.clock.isoNow())),
        run,
        workflow,
      });
      await this.publishDomainEvent('orcflo.run.completed', run, workflow, {
        spentMinor,
        evidenceCount: totalEvidence,
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

  // --- Resumable approval (§49) ---

  /**
   * Decide a run paused at WAITING_APPROVAL. APPROVED persists the
   * decision and resumes execution from the approval node; REJECTED
   * cancels the run. The decision is persisted system state — never a
   * frontend-only boolean.
   */
  async decideApproval(
    context: ActorContext,
    runId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ): Promise<OrcfloRun> {
    const run = await this.ports.runs.findById(context.tenantId, runId);
    if (!run) throw new PlatformError('NOT_FOUND', `Run ${runId} was not found.`);
    if (run.status !== 'WAITING_APPROVAL') {
      throw new PlatformError('CONFLICT', `Run ${runId} is not waiting for approval (status ${run.status}).`);
    }
    if (run.approval) {
      throw new PlatformError('CONFLICT', `Run ${runId} already has an approval decision.`);
    }
    if (!roleAllows(context.role, 'approval:decide')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot decide approvals.`);
    }
    const now = this.clock.isoNow();
    const decided = OrcfloRunSchema.parse({
      ...run,
      approval: { decision, decidedBy: context.actorId, reason, decidedAt: now },
      updatedAt: now,
    });
    await this.ports.runs.save(decided);
    if (decision === 'REJECTED') {
      const cancelled = OrcfloRunSchema.parse({ ...decided, status: 'CANCELLED', completedAt: now, updatedAt: now });
      await this.ports.runs.save(cancelled);
      const workflow = await this.ports.workflows.findById(context.tenantId, cancelled.workflowId);
      let sequence = (await this.ports.runEvents.listForRun(cancelled.tenantId, cancelled.id))
        .reduce((max, event) => Math.max(max, event.sequence), 0);
      await this.emit(cancelled, 'run.cancelled', { reason: reason ?? 'Rejected by human.' }, ++sequence);
      if (workflow) {
        await this.publishDomainEvent('orcflo.run.cancelled', cancelled, workflow, {
          reason: reason ?? 'Rejected by human.',
        }, context);
      }
      return cancelled;
    }
    return this.executeRun(runId);
  }

  /**
   * §49 resume seeding — rebuild execution state from the persisted steps
   * of a WAITING_APPROVAL run so execution continues past the approval
   * node without re-running completed work:
   *
   *   - outputs / executedKeys / executedNodeIds from COMPLETED+CACHED steps
   *   - spentMinor and evidenceCountTotal from step metadata
   *   - a ready-set of unexecuted nodes whose every non-loop incoming edge
   *     is satisfied by the persisted outputs (edge conditions honored:
   *     condition result, router route, loopExit)
   *
   * Resuming inside an active for_each loop is rejected with a clear
   * error until loop checkpoints exist.
   */
  private buildResumeSeed(
    run: OrcfloRun,
    nodeById: Map<string, WorkflowNode>,
    incoming: Map<string, WorkflowEdge[]>,
  ): {
    outputs: Record<string, unknown>;
    executedKeys: Set<string>;
    executedNodeIds: Set<string>;
    spentMinor: number;
    evidenceCountTotal: number;
    pending: Array<{ nodeId: string; iteration: number; loopItem?: { item: unknown; index: number; iteration: number } }>;
  } {
    const outputs: Record<string, unknown> = {};
    const executedKeys = new Set<string>();
    const executedNodeIds = new Set<string>();
    let spentMinor = 0;
    let evidenceCountTotal = 0;
    for (const step of run.steps) {
      if (step.status === 'COMPLETED' || step.status === 'CACHED') {
        executedKeys.add(`${step.nodeId}::${step.iteration}`);
        executedNodeIds.add(step.nodeId);
        if (step.output !== undefined) outputs[step.nodeId] = step.output;
        spentMinor += step.costMinor;
        evidenceCountTotal += step.evidenceCount;
      }
    }
    // Active-loop guard: a for_each head still mid-iteration cannot be
    // resumed without a persisted checkpoint.
    for (const node of nodeById.values()) {
      if (node.type !== 'for_each') continue;
      const lastEmitted = [...run.steps]
        .reverse()
        .find((step) => step.nodeId === node.id && step.status === 'COMPLETED'
          && (step.output as { done?: boolean } | undefined)?.done === false);
      if (lastEmitted) {
        throw new PlatformError(
          'WORKFLOW_ERROR',
          `Resuming a run paused inside an active for_each loop (node ${node.id}) is not yet supported.`,
        );
      }
    }
    // Ready-set: unexecuted nodes whose every non-loop incoming edge is
    // satisfied by the persisted outputs.
    const pending: Array<{ nodeId: string; iteration: number }> = [];
    for (const node of nodeById.values()) {
      if (executedNodeIds.has(node.id)) continue;
      const ins = (incoming.get(node.id) ?? []).filter((edge) => edge.loop !== true);
      if (ins.length === 0) {
        pending.push({ nodeId: node.id, iteration: 0 });
        continue;
      }
      let satisfied = 0;
      let blocked = false;
      for (const edge of ins) {
        if (!executedNodeIds.has(edge.source)) {
          blocked = true;
          break;
        }
        const sourceOutput = outputs[edge.source];
        const sourceType = nodeById.get(edge.source)?.type;
        if (sourceType === 'router') {
          if (edge.sourceHandle === (sourceOutput as { route?: string } | undefined)?.route) satisfied += 1;
          else { blocked = true; break; }
        } else if (edgeGuardFires(edge, sourceOutput)) {
          satisfied += 1;
        } else {
          blocked = true;
          break;
        }
      }
      if (!blocked && satisfied > 0) pending.push({ nodeId: node.id, iteration: 0 });
    }
    return { outputs, executedKeys, executedNodeIds, spentMinor, evidenceCountTotal, pending };
  }

  // --- Persisted decisions (branch coverage / audit) ---

  async listRunDecisions(context: ActorContext, runId: string): Promise<OrcfloDecisionRecord[]> {
    this.assertRead(context);
    return this.ports.decisions.listForRun(context.tenantId, runId);
  }

  /** Append one persisted decision record for a control-node decision. */
  private async appendDecision(
    run: OrcfloRun,
    workflow: Workflow,
    node: WorkflowNode,
    kind: OrcfloDecisionRecord['kind'],
    subject: string,
    result: unknown,
    iteration: number,
  ): Promise<void> {
    await this.ports.decisions.append(OrcfloDecisionRecordSchema.parse({
      id: createId('drec'),
      tenantId: run.tenantId,
      runId: run.id,
      workflowId: workflow.id,
      nodeId: node.id,
      kind,
      subject,
      result,
      iteration,
      occurredAt: this.clock.isoNow(),
    }));
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

  /**
   * §47 — run `operation` over `items` with at most `limit` concurrent
   * invocations, preserving input order in the results. Exceptions are
   * captured per item and re-thrown in input order after all workers
   * settle, so a failing branch never leaks an unhandled rejection.
   */
  private async mapWithConcurrency<T, U>(
    items: readonly T[],
    limit: number,
    operation: (item: T) => Promise<U>,
  ): Promise<U[]> {
    const results = new Array<U | undefined>(items.length);
    const errors: Array<{ index: number; error: unknown }> = [];
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(Math.trunc(limit), items.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await operation(items[index]);
        } catch (error) {
          errors.push({ index, error });
        }
      }
    });
    await Promise.all(workers);
    if (errors.length > 0) {
      errors.sort((a, b) => a.index - b.index);
      throw errors[0].error;
    }
    return results as U[];
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
      iteration: 0,
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
    this.options.runEventBus?.publish(event);
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
