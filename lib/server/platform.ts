import 'server-only';

import type { OrcfloPersistencePorts, OrcfloRuntimePorts, PlatformPorts } from '../application/ports';
import { AgentCommandService } from '../application/agent-command-service';
import { BoundedAgentRuntime } from '../application/agent-runtime';
import { DemoModelProviderGateway, NoopModelProviderGateway } from '../application/model-providers';
import { OrcfloBlueprintService } from '../application/orcflo-blueprints';
import { OrcfloEngine } from '../application/orcflo-engine';
import { OrcfloPublicInterfaceService } from '../application/orcflo-public';
import { OrcfloTriggerService } from '../application/orcflo-triggers';
import { RunDispatcher } from '../application/run-dispatcher';
import { RunEventBus } from '../application/run-event-bus';
import { ScheduleDispatcher } from '../application/schedule-dispatcher';
import { TransactionService } from '../application/transaction-service';
import {
  WorkflowAwareToolExecutor,
  WorkflowAsToolExecutor,
  WorkflowAsToolService,
  WORKFLOW_TOOL_DEFAULT_MAX_DEPTH,
} from '../application/workflow-as-tool';
import { WorkflowRunner, type WorkflowNodeHandler } from '../application/workflow-runner';
import type { WorkflowNode } from '../domain/schemas';
import { PlatformError } from '../domain/errors';
import {
  createInMemoryPersistencePorts,
  DeterministicToolExecutor,
  InMemoryUnitOfWork,
  SystemClock,
} from '../infrastructure/memory-adapters';
import {
  createPrismaPersistencePorts,
  PrismaUnitOfWork,
} from '../infrastructure/prisma-adapters';
import { getPrismaClient } from '../infrastructure/prisma-client';
import { EmptyMcpServerRegistry, NoopAvatarSessionAdapter } from '../infrastructure/extension-adapters';
import {
  BearerTokenIdentityVerifier,
  DemoHeaderIdentityVerifier,
} from '../infrastructure/identity-verifiers';
import {
  DefaultOutboxDispatchConfig,
  OutboxDispatcher,
  createNoopOutboxPublisher,
  type DispatchOutcome,
  summarizeOutcomes,
} from '../application/outbox-dispatcher';

export type PlatformApplication = {
  ports: PlatformPorts;
  commands: AgentCommandService;
  agents: BoundedAgentRuntime;
  workflows: WorkflowRunner;
  transactions: TransactionService;
  /**
   * Orcflo — the deterministic workflow run engine. Runs, run stream,
   * step cache, metering, fail-closed model providers, four triggers,
   * and blueprints all hang off this root.
   */
  orcflo: OrcfloEngine;
  triggers: OrcfloTriggerService;
  blueprints: OrcfloBlueprintService;
  /**
   * §34 — public workflow interfaces. Anonymous, rate-limited,
   * input-validated execution of a READY workflow through a public slug.
   */
  publicInterfaces: OrcfloPublicInterfaceService;
  /**
   * Durable execution — the in-process run worker (PENDING -> executed)
   * and the schedule worker (due cron buckets -> runs). Both are wired as
   * unref'd loops, like the outbox dispatcher.
   */
  runDispatcher: RunDispatcher;
  scheduleDispatcher: ScheduleDispatcher;
  runEventBus: RunEventBus;
  startRunDispatcherLoop: () => void;
  stopRunDispatcherLoop: () => void;
  startScheduleDispatcherLoop: () => void;
  stopScheduleDispatcherLoop: () => void;
  /**
   * Orcflo bridge — workflow-as-tool registry. A READY workflow can be
   * registered as a callable tool in the canonical tool registry so the
   * Agent Runtime can invoke it; agent nodes inside workflows run
   * through the same BoundedAgentRuntime.
   */
  workflowTools: WorkflowAsToolService;
  persistence: 'ephemeral-memory' | 'postgresql';
  /** Capability 06 — empty allowlist by default. Wire a real registry to enable MCP. */
  mcpServers: import('../application/ports').McpServerRegistry;
  /** Capability 10 — no-op by default. Wire a real provider to enable avatars. */
  avatar: import('../application/ports').AvatarSessionAdapter;
  /**
   * Audit §3 — outbox dispatcher wired in memory mode. Postgres mode
   * wires the real Prisma adapter; production deploys that connect
   * a broker (NATS or similar) replace the noop publisher at this
   * composition point.
   */
  outboxDispatcher: OutboxDispatcher;
  /**
   * Audit §3 — control the in-process dispatcher loop. Tests should
   * NOT call `start()`; they invoke `tick()` directly.
   */
  startOutboxDispatcherLoop: () => void;
  stopOutboxDispatcherLoop: () => void;
};

const globalPlatform = globalThis as unknown as { asePlatform?: PlatformApplication };

export function getPlatform(): PlatformApplication {
  if (globalPlatform.asePlatform) return globalPlatform.asePlatform;
  const persistenceMode = process.env.ASE_PERSISTENCE_MODE ?? 'memory';
  const runtimeMode = process.env.ASE_RUNTIME_MODE ?? 'demo';
  const toolExecutor = new DeterministicToolExecutor(new Map());
  const clock = new SystemClock();
  let ports: PlatformPorts;
  let orcfloPersistence: OrcfloPersistencePorts;
  let persistence: PlatformApplication['persistence'];

  if (persistenceMode === 'postgres') {
    const prisma = getPrismaClient();
    const persistencePorts = createPrismaPersistencePorts(prisma);
    orcfloPersistence = persistencePorts.orcflo;
    ports = {
      ...persistencePorts,
      unitOfWork: new PrismaUnitOfWork(prisma),
      toolExecutor,
      clock,
    };
    persistence = 'postgresql';
  } else if (persistenceMode === 'memory') {
    const { store, ports: persistencePorts, tenantMembers, orcflo } = createInMemoryPersistencePorts();
    orcfloPersistence = orcflo;
    ports = {
      ...persistencePorts,
      unitOfWork: new InMemoryUnitOfWork(store, persistencePorts),
      toolExecutor,
      clock,
      tenantMembers,
    };
    persistence = 'ephemeral-memory';
  } else {
    throw new PlatformError('CONFIGURATION_ERROR', `Unsupported ASE_PERSISTENCE_MODE: ${persistenceMode}.`);
  }

  // Orcflo bridge — workflow-as-tool. The executor starts nested runs
  // through the engine; the engine reference is resolved lazily so the
  // tool executor can be wired before the engine exists (no cycle).
  const engineRef: { current?: OrcfloEngine } = {};
  const maxWorkflowToolDepth = Number.parseInt(
    process.env.ASE_ORCFLO_TOOL_MAX_DEPTH ?? String(WORKFLOW_TOOL_DEFAULT_MAX_DEPTH),
    10,
  );
  const workflowToolExecutor = new WorkflowAsToolExecutor(() => {
    if (!engineRef.current) {
      throw new PlatformError('CONFIGURATION_ERROR', 'The Orcflo engine is not initialized.');
    }
    return engineRef.current;
  }, { maxDepth: Number.isFinite(maxWorkflowToolDepth) ? maxWorkflowToolDepth : WORKFLOW_TOOL_DEFAULT_MAX_DEPTH });
  ports = {
    ...ports,
    // One ToolExecutor port: workflow tools route to the engine, every
    // other tool goes through the deterministic demo executor.
    toolExecutor: new WorkflowAwareToolExecutor(ports.toolExecutor, workflowToolExecutor),
  };

  // Orcflo — deterministic run engine. The model gateway is fail-closed:
  // demo runtime modes may use the deterministic demo gateway; every
  // other mode refuses all model calls (no verified provider SDK exists).
  const orcfloPorts: OrcfloRuntimePorts = { ...ports, ...orcfloPersistence };
  const modelGateway = runtimeMode === 'demo'
    ? new DemoModelProviderGateway()
    : new NoopModelProviderGateway();

  // Audit §1 — identity verifier selection.
  if (runtimeMode === 'demo') {
    ports.identity = new DemoHeaderIdentityVerifier();
    // Demo bootstrap: the documented demo defaults (tenant_demo /
    // actor_ada / BUILDER, see README) must be able to authenticate in
    // the ephemeral memory runtime even though a membership authority
    // is wired. Seeding is demo+memory-only and matches the identity
    // layer's own bootstrap intent; non-demo modes never seed.
    if (persistenceMode === 'memory' && ports.tenantMembers) {
      void ports.tenantMembers.upsert({ tenantId: 'tenant_demo', actorId: 'actor_ada', role: 'BUILDER' });
      // Demo approver — lets the demo exercise §49 approval decisions
      // without a separate provisioning surface (demo+memory only).
      void ports.tenantMembers.upsert({ tenantId: 'tenant_demo', actorId: 'actor_approver', role: 'APPROVER' });
    }
  } else {
    const token = process.env.ASE_PROD_BEARER_TOKEN;
    if (!token) {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        'ASE_PROD_BEARER_TOKEN is required for non-demo runtime modes. Set it in the deployment secret store.',
      );
    }
    ports.identity = new BearerTokenIdentityVerifier(token);
  }

  // Audit §3 — wire the outbox dispatcher. The default noop publisher
  // records would-have-been dispatches so an operator can confirm the
  // pipeline end-to-end; a real broker replaces it without touching
  // business code.
  const workerId = process.env.ASE_OUTBOX_WORKER_ID ?? `outbox-worker-${process.pid}`;
  const leaseMs = Number.parseInt(process.env.ASE_OUTBOX_LEASE_MS ?? '30000', 10);
  const tickIntervalMs = Number.parseInt(process.env.ASE_OUTBOX_TICK_INTERVAL_MS ?? '1000', 10);
  const maxAttempts = Number.parseInt(process.env.ASE_OUTBOX_MAX_ATTEMPTS ?? '5', 10);
  const outboxDispatcher = new OutboxDispatcher(
    ports.outbox,
    createNoopOutboxPublisher(),
    clock,
    {
      ...DefaultOutboxDispatchConfig,
      workerId,
      leaseMs,
      maxAttempts,
    },
  );
  let loopTimer: ReturnType<typeof setInterval> | undefined;
  let loopRunning = false;
  const runLoop = async () => {
    if (loopRunning) return;
    loopRunning = true;
    try {
      const outcomes: DispatchOutcome[] = await outboxDispatcher.tick();
      const summary = summarizeOutcomes(outcomes);
      if (summary.PUBLISHED > 0 || summary.DEAD_LETTERED > 0) {
        console.info('[outbox] tick summary', summary);
      }
    } catch (error) {
      console.error('[outbox] tick failed', error);
    } finally {
      loopRunning = false;
    }
  };
  const startOutboxDispatcherLoop = () => {
    if (loopTimer) return;
    loopTimer = setInterval(() => {
      void runLoop();
    }, tickIntervalMs);
    // Allow the process to exit even if the timer is alive.
    if (typeof loopTimer === 'object' && loopTimer !== null && 'unref' in loopTimer) {
      (loopTimer as { unref: () => void }).unref();
    }
  };
  const stopOutboxDispatcherLoop = () => {
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = undefined;
    }
  };

  const handlers = createDemoNodeHandlers();
  // The canonical agent runtime is shared by direct agent runs and by
  // `agent` workflow nodes (the WORKFLOW → AGENT bridge). Its tool
  // executor is the composite above, so an agent can call a workflow
  // tool, which starts an Orcflo run, which may contain agent nodes
  // again — bounded by the workflow-tool depth limit.
  const boundedAgentRuntime = new BoundedAgentRuntime(ports);
  const runEventBus = new RunEventBus();
  const orcfloEngine = new OrcfloEngine(orcfloPorts, handlers, modelGateway, clock, {
    agentRuntime: boundedAgentRuntime,
    runEventBus,
  });
  engineRef.current = orcfloEngine;

  // Durable execution — run worker + schedule worker loops (unref'd, so
  // the process can still exit; same pattern as the outbox dispatcher).
  const triggerService = new OrcfloTriggerService(orcfloPorts, orcfloEngine, clock);
  const runDispatcher = new RunDispatcher(orcfloEngine, orcfloPorts, clock, {
    workerId: process.env.ASE_RUN_WORKER_ID ?? `run-worker-${process.pid}`,
    leaseMs: Number.parseInt(process.env.ASE_RUN_LEASE_MS ?? '60000', 10),
  });
  const scheduleDispatcher = new ScheduleDispatcher(triggerService, clock);
  const makeLoop = (
    tick: () => Promise<unknown>,
    intervalMs: number,
    label: string,
  ): { start: () => void; stop: () => void } => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let running = false;
    const runOneTick = async () => {
      if (running) return;
      running = true;
      try {
        await tick();
      } catch (error) {
        console.error(`[${label}] tick failed`, error);
      } finally {
        running = false;
      }
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void runOneTick(); }, intervalMs);
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref: () => void }).unref();
      }
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    return { start, stop };
  };
  const runWorkerLoop = makeLoop(
    () => runDispatcher.tick(),
    Number.parseInt(process.env.ASE_RUN_TICK_INTERVAL_MS ?? '1000', 10),
    'run-dispatcher',
  );
  const scheduleLoop = makeLoop(
    () => scheduleDispatcher.tick(),
    Number.parseInt(process.env.ASE_SCHEDULE_TICK_INTERVAL_MS ?? '60000', 10),
    'schedule-dispatcher',
  );
  // Auto-start so async runs and schedules actually execute in a running
  // server; loops are unref'd and idempotent to re-tick.
  runWorkerLoop.start();
  scheduleLoop.start();
  const application: PlatformApplication = {
    ports,
    commands: new AgentCommandService(ports),
    agents: boundedAgentRuntime,
    workflows: new WorkflowRunner(ports, handlers),
    transactions: new TransactionService(ports),
    orcflo: orcfloEngine,
    triggers: triggerService,
    blueprints: new OrcfloBlueprintService(orcfloPorts),
    publicInterfaces: new OrcfloPublicInterfaceService(orcfloPorts, orcfloEngine, clock),
    runDispatcher,
    scheduleDispatcher,
    runEventBus,
    startRunDispatcherLoop: runWorkerLoop.start,
    stopRunDispatcherLoop: runWorkerLoop.stop,
    startScheduleDispatcherLoop: scheduleLoop.start,
    stopScheduleDispatcherLoop: scheduleLoop.stop,
    workflowTools: new WorkflowAsToolService(orcfloPorts),
    persistence,
    mcpServers: new EmptyMcpServerRegistry(),
    avatar: new NoopAvatarSessionAdapter(),
    outboxDispatcher,
    startOutboxDispatcherLoop,
    stopOutboxDispatcherLoop,
  };
  // Memory mode is process-local and ephemeral, but it must still survive across
  // requests handled by the same process (for example, save then execute).
  // PostgreSQL mode also benefits from reusing the adapter and connection pool.
  globalPlatform.asePlatform = application;
  return application;
}

function createDemoNodeHandlers(): ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler> {
  const deterministic: WorkflowNodeHandler = (node, input, signal) => {
    if (signal.aborted) throw new PlatformError('TIMEOUT', `${node.label} was aborted.`, { retryable: true });
    if (node.configuration.executionMode !== 'demo') {
      throw new PlatformError(
        'CONFIGURATION_ERROR',
        `${node.label} has no verified external adapter. Set executionMode to demo only for deterministic simulation.`,
      );
    }
    return {
      output: { nodeId: node.id, mode: 'demo', inputKeys: Object.keys(input) },
      evidence: [{
        type: 'internal_trace',
        summary: `${node.label} completed in the explicitly ephemeral demo runtime.`,
        data: { nodeId: node.id, simulated: true },
      }],
      costMinor: 0,
    };
  };

  // Capability 06 — MCP node handler.
  // Fail-closed: only invokes MCP when the node has been registered as
  // `trusted: true` in the tenant's allowlist; the policy gate in
  // `evaluateWorkflowNodePolicy` already denies untrusted MCP nodes at
  // the runner level. This handler therefore sees only nodes that have
  // already passed the gate, but it re-checks the gate before acting.
  const mcp: WorkflowNodeHandler = (node, _input, _signal) => {
    if (node.configuration.trusted !== true) {
      throw new PlatformError(
        'AUTHORIZATION_DENIED',
        `MCP node ${node.id} is not trusted. Register the server in the tenant allowlist and set configuration.trusted=true.`,
      );
    }
    return {
      output: {
        nodeId: node.id,
        mode: 'mcp-stub',
        reason: 'No MCP transport is configured in this increment. The contract is wired; wire an adapter to execute.',
      },
      evidence: [{
        type: 'internal_trace',
        summary: `MCP node ${node.id} recorded as a stub. No external call was made.`,
        data: { nodeId: node.id, simulated: true, capability: 'mcp' },
      }],
      costMinor: 0,
    };
  };

  // Capability 12 — Handoff node handler.
  // Records the handoff as a deterministic state change. Does not
  // auto-resume downstream nodes; the next workflow run is responsible
  // for picking up the recorded target.
  const handoff: WorkflowNodeHandler = (node, input) => {
    const fromAgentId = typeof input.agentId === 'string' ? input.agentId : undefined;
    const toAgentId = typeof node.configuration.toAgentId === 'string' ? node.configuration.toAgentId : undefined;
    return {
      output: { nodeId: node.id, fromAgentId, toAgentId, recorded: true },
      evidence: [{
        type: 'internal_trace',
        summary: `Handoff recorded at ${node.id}. No side effects were taken; the next execution will pick up ${toAgentId ?? 'unspecified target'}.`,
        data: { nodeId: node.id, fromAgentId, toAgentId, recorded: true },
      }],
      costMinor: 0,
    };
  };

  return new Map<WorkflowNode['type'], WorkflowNodeHandler>([
    ['trigger', deterministic],
    ['action', deterministic],
    ['condition', deterministic],
    ['voice_command', deterministic],
    ['schedule', deterministic],
    ['tool', deterministic],
    ['webhook', deterministic],
    ['mcp', mcp],
    ['handoff', handoff],
  ]);
}
