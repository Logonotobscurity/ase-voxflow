# Workflow-runtime bridge verification — 2026-08-16

**Scope:** the AGENT ⇄ WORKFLOW interoperability bridges called out as the most important addition to the platform — **Workflow-as-Tool** (an agent can call a published workflow as a canonical tool) and **Agent-as-Node** (a workflow `agent` node executes through the canonical `BoundedAgentRuntime`, never a second agent implementation). Also captured the full WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE as the development-spec addition and mapped the platform's current state against all 56 sections.

**Follow-up increment (same day): deterministic control flow.** The Orcflo engine now executes graphs rather than linear topo passes: `condition` nodes + `condition` edges (§12), `router` nodes (§13), and bounded `for_each` loops with `loop`/`loopExit` edges (§14), with loop-aware graph validation (§45). Detailed evidence in `docs/verification/orcflo-engine-2026-08-16.md` §11.

**Follow-up increment (same day): parallel execution (§47).** Independent handler nodes run concurrently up to a bounded `maxConcurrency` with deterministic step/event ordering; control nodes remain sequential. Detailed evidence in `docs/verification/orcflo-engine-2026-08-16.md` §12.

**Follow-up increment (same day): run idempotency (§48).** `OrcfloRun.idempotencyKey` unique per tenant; engine replays duplicate-key starts; webhook/event triggers derive keys from (trigger, payload) so duplicate deliveries dedupe; explicit key via header/body. Detailed evidence in `docs/verification/orcflo-engine-2026-08-16.md` §13.

**Follow-up increment (same day): public workflow interfaces (§34).** New `public` trigger kind exposes a READY workflow anonymously via `POST /api/v1/orcflo/interfaces/:slug/run` with input-schema validation, per-interface rate/daily-run/cost limits, idempotency, and a synthetic execute-only `PUBLIC` role; policy gates still apply. Detailed evidence in `docs/verification/orcflo-engine-2026-08-16.md` §14.

## 1. What this increment adds

| Piece | Location | Behavior verified |
|---|---|---|
| `ai_model` node type | `lib/domain/schemas.ts` (`WorkflowNodeTypeSchema`) | Direct, bounded calls through the fail-closed model gateway — the "AI_MODEL" category from §3/§15. Distinct from AGENT: no lifecycle, tools, or autonomy. |
| **Workflow-as-Tool** | `lib/application/workflow-as-tool.ts` | A READY workflow is registered as a first-class `ToolDefinition` (`wtool_<workflowId>`, `metadata.orcfloTool: true`) in the **canonical tool registry** (§18: one tool system). `WorkflowAwareToolExecutor` routes only workflow tools to the engine; everything else stays on the deterministic executor. |
| **Agent-as-Node** | `OrcfloEngine.createAgentNodeHandler` (`lib/application/orcflo-engine.ts`) | `agent` nodes resolve `configuration.agentId` and run through `BoundedAgentRuntime` (the canonical agent runtime, §17/§52), producing structured output, evidence, and cost. Without a wired runtime the node fails closed (`CONFIGURATION_ERROR`). |
| Depth limit | `WORKFLOW_TOOL_DEPTH_KEY` (`__orcfloDepth`) | Cross-boundary recursion bounded: `AGENT → WORKFLOW → AGENT → WORKFLOW …` fails with `WORKFLOW_ERROR` past `ASE_ORCFLO_TOOL_MAX_DEPTH` (default 3). §50 depth_limit. |
| Parent traceability | `WORKFLOW_TOOL_PARENT_KEY` (`__orcfloParentExecutionId`) | The parent agent execution id is carried into the nested run's input; correlation id is preserved end-to-end via the caller's `ActorContext`. §50 correlation_id / parent_execution_id. |
| Runtime wiring | `lib/server/platform.ts` | One `BoundedAgentRuntime` shared by direct agent runs and workflow agent nodes; its tool executor is the composite (workflow tools → engine, others → deterministic). |
| Tool endpoint | `POST/GET/DELETE /api/v1/orcflo/workflows/:workflowId/tool` | Register (persist), describe (no side effects), soft-unregister (`availability: UNAVAILABLE` → policy denies). |

The engine's previous direct-provider `agent` node behavior is now the `ai_model` node; `agent` nodes no longer touch the model gateway directly.

## 2. Bridge mechanics

**Agent → Workflow:** the agent runtime's `ToolInvocation` now carries `context` (the caller's `ActorContext`), so the workflow tool executor can start a nested run with full tenancy, role, and correlation. The nested run goes through `OrcfloEngine.startRun`, so every run guarantee applies (READY-only, policy, evidence gate, metering, stream). The tool's `costMinor` is the nested run's `spentMinor`; the tool result carries `runId` + status and produces `tool_result` evidence with a `run:<runId>` reference.

**Workflow → Agent:** the agent node handler calls `BoundedAgentRuntime.run` with:
- `executionId = <runId>::<nodeId>` (traceability),
- a bounded deterministic planner (invoke the configured `toolId` once, then complete),
- the node's `input` (the run's mapped context — only what the node needs),
- the node's `objective`/`promptTemplate`.

The agent's own policies (limits, budget, approval, environments) govern the execution; the run's step records `costMinor = spentMinor`, evidence, iterations, and tool calls.

**Lifecycle boundary (documented, fail-closed):** the canonical runtime transitions the agent `READY → RUNNING → COMPLETED` (or `FAILED`). Re-running the same agent node therefore requires a fresh `READY` agent — reuse is governed by the canonical lifecycle, identical to direct agent runs. If the agent stops at `WAITING_APPROVAL`, the run fails with a clear `WORKFLOW_ERROR` because resumable approval inside runs is not yet wired (§49 PARTIAL).

## 3. Automated verification

```text
$ npm run lint        -> no errors
$ npm run typecheck   -> no errors (strict)
$ npm test            -> 19 files passed, 160 tests passed, 5 opt-in PostgreSQL skipped
$ npx next build      -> optimized build; 38 routes (37 prior + workflow tool endpoint)
```

New/updated tests:

| File | Coverage |
|---|---|
| `tests/orcflo-bridge.test.ts` (12 tests) | Workflow-as-Tool: register persistence, READY gate, describe-without-persist + RBAC, soft-unregister → policy deny, full agent→tool→workflow run (nested run exists, depth/parent keys stamped), missing-context fail-closed, depth-limit refusal, composite routing. Agent-as-Node: canonical runtime execution (tool call, cost, lifecycle `COMPLETED`), missing `agentId`, engine-without-runtime fail-closed, `WAITING_APPROVAL` → run `FAILED`. |
| `tests/orcflo-engine.test.ts` | `agent` node model tests converted to `ai_model` (direct provider path still covered); fail-closed without provider. |
| `tests/orcflo-routes.test.ts` | `POST/GET/DELETE /api/v1/orcflo/workflows/:workflowId/tool` route behavior. |

## 4. Compliance map — WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE

Legend: ✅ implemented in this or the prior Orcflo increment · 🟡 partial (contract/bridge exists; X still future) · ⬜ future work.

| § | Requirement | Status | Evidence / boundary |
|---|---|---|---|
| 1 | Core model: INPUT → AI/LOGIC/TOOLS → OUTPUT, arbitrary DAG | ✅ | `OrcfloEngine` + `validateWorkflowGraph`; canonical `Workflow` (nodes/edges). |
| 2 | Workflow graph; backend is source of truth; no frontend-only model | ✅ | `WorkflowSchema` shared by canvas API and engine; canvas serializes to it. |
| 3 | Node model, stable ids, extensible types, runtime-owned execution | ✅ | `WorkflowNodeSchema`; types extensible via `WorkflowNodeTypeSchema`; execution in engine handlers, not the editor. |
| 4 | Node executor registry | ✅ | `ReadonlyMap<WorkflowNode['type'], WorkflowNodeHandler>` + per-run `agent`/`ai_model` wiring. |
| 5 | Edges explicit; graph determines execution | ✅ | `WorkflowEdgeSchema`; `topologicalOrder`. |
| 6 | Data mapping, standardized references | 🟡 | `{{ key }}` + `$key` in blueprints; run inputs thread node outputs downstream. `{{input.x}}`/`{{node.output}}` path syntax for arbitrary edges: future. |
| 7 | Workflow context (run_id, version, tenant, trigger, inputs, outputs, state) | ✅ | `OrcfloRun` carries all of these; step inputs are deterministic from context. |
| 8 | Definition vs run separation; version pinned per run; history immutable | ✅ | `OrcfloRun` references `workflowId` + cache key pins `workflowVersion`; runs never mutated by edits. |
| 9 | Run states PENDING…TIMED_OUT; node states | 🟡 | `OrcfloRunStatus` covers PENDING/RUNNING/WAITING_APPROVAL/COMPLETED/FAILED/CANCELLED; node states RUNNING/WAITING_APPROVAL/CACHED/COMPLETED/FAILED/SKIPPED (SKIPPED recorded for untaken branches). `PAUSED`, `WAITING`, `TIMED_OUT` aliases: future. |
| 10 | Run history (trigger, times, duration, status, cost, inputs, nodes, errors, output) | ✅ | `OrcfloRun` + `OrcfloStepResult` + metering + run events; immutable writes. |
| 11 | Real-time run monitoring, event-driven, no aggressive polling | 🟡 | Replayable run stream over SSE; live long-poll subscription behind a worker + NATS: future. |
| 12 | Decision/condition nodes, deterministic for critical business | ✅ | `condition` nodes evaluate dot-path comparisons (`path`/`op`/`value`) in code; edges with `condition: true/false` fire only on matching source output; untaken branches recorded as `SKIPPED`. Added 2026-08-16 control-flow increment. |
| 13 | Router nodes, structured decisions | ✅ | `router` nodes select from `configuration.routes` via `pickPath` with optional `defaultRoute`, output `{ route }`, fire only the `sourceHandle`-matching edge; no match → `FAILED` with machine-readable reason. Added 2026-08-16 control-flow increment. |
| 14 | FOR_EACH loops with safety limits | ✅ | `for_each` nodes iterate `collection` with `maxItems`/`maxIterations`; body consumes `input.item/index/iteration`; `loop` back edges re-enter the head, `loopExit` edges fire when done; violations fail with clear reasons; global `maxNodeExecutions` cap. Added 2026-08-16 control-flow increment. |
| 15 | AI_MODEL node: provider/model/prompt/output schema/limits | ✅ | `ai_model` node: `modelProviderId`, `promptTemplate`, `maxTokens`, gateway limits, metered tokens. |
| 16 | Multi-model workflows | ✅ | Each `ai_model` node names its provider; any mix per workflow. |
| 17 | Agent node through canonical agent runtime | ✅ | This increment. |
| 18 | Tools first-class; canonical tool registry | 🟡 | `ToolDefinition` + `ToolRepository` + one `ToolExecutor` port (workflow tools route through it). Per-node `tool` handler exists; web search/HTTP/email adapters: future. |
| 19 | Tool approval, explicit risk | ✅ | `ToolRisk` LOW/MEDIUM/HIGH/CRITICAL; `evaluateToolPolicy` → `require_approval`. |
| 20 | MCP node, same governance | ✅/🟡 | `mcp` node + allowlist gate + fail-closed handler; real transport: future. |
| 21 | Input nodes/schemas, validated | 🟡 | Run `input` schema is open; blueprint params typed; per-workflow `metadata.inputSchema` honored by workflow-as-tool; dedicated INPUT node + strict validation: future. |
| 22 | Output nodes, structured outputs exposed | 🟡 | Runs expose final `output` (spentMinor/evidence/stepCount) + per-step outputs; dedicated OUTPUT node: future. |
| 23 | TRANSFORM node, deterministic code | 🟡 | `condition`/`action` handlers are deterministic; `transform` node category: future. |
| 24 | INFORMATION node | ⬜ | Future. |
| 25 | Data sources with auth/permissions/tenant ownership | 🟡 | Tenant-scoped repos + policy; external sources: future. |
| 26 | File handling with size/type limits | ⬜ | Future. |
| 27 | HTTP node on canonical infra, SSRF protection | ⬜ | Future. |
| 28 | Web search vs crawl distinct, restricted access | ⬜ | Future. |
| 29 | Email as provider adapter | ⬜ | Future. |
| 30 | Triggers → canonical `WorkflowTrigger` | ✅ | `OrcfloTrigger` (manual/schedule/webhook/event). API + agent invocation map to runs. |
| 31 | Webhook: auth → signature → validation → idempotency | 🟡 | Webhook fire is key-authenticated (`NOT_FOUND` on bad key), input-validated; signature verification + idempotency: future. |
| 32 | Schedule: cron, timezone, enabled, last/next run, failure policy | ✅ | Deterministic cron + timezone + enabled + lastFiredAt + once-per-bucket drain, now driven by a cross-tenant `ScheduleDispatcher` worker loop; `next_run`/`failure_policy` + multi-instance leases remain future. |
| 33 | App events → workflow, reuse event architecture | 🟡 | `event` trigger fires explicitly; automatic event-bus wiring (NATS) + no duplicate bus: future. |
| 34 | Public interfaces with rate/cost limits | ✅ | New `public` trigger kind: anonymous `POST /api/v1/orcflo/interfaces/:slug/run` with deterministic input-schema validation, per-interface rate limiting + daily run caps, cost/duration bounds, idempotency, and a synthetic execute-only `PUBLIC` role (never a membership role) — node/agent/tool policies still apply. Added 2026-08-16 public-interfaces increment. |
| 35 | Blueprints, no secret leakage | ✅ | `OrcfloBlueprint`; instantiation only substitutes declared params; secrets never templated. |
| 36 | Versioning: draft/published/archived, runs pin versions | 🟡 | `WorkflowStatus` DRAFT/READY/PAUSED/ARCHIVED; version increments on save; cache pins version. Explicit version history table: future. |
| 37 | Collaboration: OWNER/EDITOR/RUNNER/VIEWER server-side | 🟡 | Tenant roles (ADMIN/BUILDER/OPERATOR/APPROVER/VIEWER) + server-side RBAC; per-workflow ownership: future. |
| 38 | Folders as metadata only | ⬜ | Future. |
| 39 | Soft deletion + retention-aware history | 🟡 | Workflow-as-tool unregister is soft (`UNAVAILABLE`); workflow soft-delete lifecycle: future. |
| 40 | Run cost limits, FAILED with machine-readable reason | ✅ | `maxDurationMs`, `maxCostMinor`, step cost checks; `run.failed` event + `output.code/message`. |
| 41 | Data export, never secrets | ⬜ | Future. |
| 42 | Analytics derived from events/history | 🟡 | `MeteringSummary` derived from metering records; per-node latency/usage breakdown: future. |
| 43 | Canvas is editor, not engine | ✅ | Canonical API + server engine; browser never executes authoritative logic. |
| 44 | Canvas actions | 🟡 | Save/publish/run/view-run exist server-side; canvas UI actions for the Orcflo surface: future. |
| 45 | Graph validation incl. cycles vs bounded loops | ✅ | `validateWorkflowGraph` accepts cycles ONLY as bounded loops: `loop` edges must target `for_each` heads, heads need a `loopExit` edge, nested loops rejected, router edges validated against declared routes; accidental infinite cycles still rejected. Added 2026-08-16 control-flow increment. |
| 46 | Engine pipeline LOAD→VALIDATE→CREATE RUN→…→FINAL OUTPUT | ✅ | `OrcfloEngine.startRun` implements this sequence. |
| 47 | Concurrency for independent nodes with limits | ✅ | Wave-based parallel execution: handler nodes ready at the same moment run concurrently up to `maxConcurrency` (default 4, clamp [1, 32], per-run); control nodes sequential; dedupe so merged nodes run once; deterministic topological step/event ordering; node-execution/cost/deadline caps enforced. Added 2026-08-16 parallel increment. |
| 48 | Idempotency (webhooks, payments, email, schedules) | ✅ | `OrcfloRun.idempotencyKey` unique per tenant (partial-safe unique index); engine replays prior runs for duplicate keys (immutable history; cross-workflow reuse = `CONFLICT`; race-safe re-fetch); webhook/event triggers derive keys from (trigger, payload) so duplicate deliveries dedupe; explicit key via header `Idempotency-Key`/body; schedule drain already once-per-minute-bucket. Added 2026-08-16 idempotency increment. |
| 49 | Human-in-the-loop node, persistable + resumable | ✅ | `human_approval` node → `WAITING_APPROVAL` persisted; `POST /runs/:runId/approval` persists the decision — APPROVED resumes from the approval node (completed work never re-executed), REJECTED cancels. Agent-node `WAITING_APPROVAL` still fails the run (agent approval resumption is future). |
| 50 | Agent ⇄ Workflow interop with correlation/parent/depth/timeout/budget | ✅ | This increment: correlation preserved, parent execution id, depth limit, timeout (tool timeoutMs), budget (run + agent budgets). |
| 51 | Workflow-as-Tool, schema becomes tool schema | ✅ | This increment; input schema derived from `metadata.inputSchema` or generic object. |
| 52 | Agent-as-Node via canonical runtime | ✅ | This increment. |
| 53 | Workflow events with correlation | ✅ | `orcflo.run.started/completed/failed/approval_requested` domain events + run stream events, all with correlation. Workflow CRUD events: future. |
| 54 | Testing: graph, execution, integration, E2E | 🟡 | Graph tests (validation incl. bounded-loop/cycle distinction, router edges) and execution tests (linear, branching, router, loops, failure, retry, timeout) covered; parallel execution tests await §47; browser E2E: future. |
| 55 | Definition of Done (canvas+persistence+validation+execution+events+history+errors+security+tests+observability) | 🟡 | Backend half complete per feature; canvas UI and some observability remain. |
| 56 | Golden architecture: two runtimes over shared primitives | 🟡 | Tool registry + policy shared; event bus (NATS) and approval resume are the main remaining shared primitives. |

## 5. Boundaries (fail-closed by design)

- Agent node with no wired runtime or no `agentId` → `CONFIGURATION_ERROR` (run fails).
- Agent node whose agent stops at `WAITING_APPROVAL` → run `FAILED` with a clear `WORKFLOW_ERROR`; resumable approval is future work.
- Workflow-tool recursion past the depth limit → `WORKFLOW_ERROR`; no run is started for the refused call.
- Workflow tool calls without the caller `ActorContext` → `CONFIGURATION_ERROR`.
- Unregistered workflow tool → `availability: UNAVAILABLE` → policy + executor refuse.
- External model providers remain refused; `ai_model`/`agent` nodes therefore only ever use the deterministic demo gateway in demo mode.

## 6. Pre-existing fixes included

- `tests/agent-command-routes.test.ts` failed at HEAD (4 tests) — memberships now provisioned per claimed role.
- Demo+memory default actors (`tenant_demo` / `actor_ada` / BUILDER) could not authenticate with a wired membership authority — the composition root now seeds those documented defaults in demo+memory mode only.

## 7. Decision-log record

See `docs/ARCHITECTURE.md` §5 for the governing decision-log entry (2026-08-16): Orcflo is the run-time half of VOXFLOW; the workflow runtime and agent runtime share the canonical tool registry, policy, event envelope, and unit of work; no second agent implementation exists inside the workflow engine.

## 8. Limitations

- No live PostgreSQL server verification in this sandbox (Prisma engine CDN unreachable); migration SQL verified on PostgreSQL 16 via PGlite in the prior increment; the Prisma path remains ready-but-`UNVERIFIED` on a server cluster.
- Concurrency (§47), router (§13), loops (§14), idempotency (§48), public interfaces (§34), and NATS/event-bus wiring (§33) remain future work, as mapped above.
