# Orcflo engine verification — 2026-08-16

**Scope:** the Orcflo workflow run engine — metering, fail-closed model provider, content-hashed step cache, replayable run stream, the four trigger kinds (manual / schedule / webhook / event), and reusable blueprints. **No external provider, broker, or database dependency was added.** No second workflow model, event envelope, unit of work, or identity surface was created.

This document records the contracts, the verification run, the live HTTP smoke evidence, the PostgreSQL status, and the explicit boundary list.

## 1. Feature map

| Feature | Contract | Behavior verified |
|---|---|---|
| **Runs** | `OrcfloRun` — a workflow executed as a run with step results, correlation, trigger/blueprint provenance | READY-only, policy-gated, topologically ordered, evidence-gated completion, cost/deadline bounds, step outputs threaded into downstream step inputs |
| **Run stream** | `OrcfloRunEvent` — append-only per-run event log (`run.started`, `step.started`, `step.completed`, `step.cached`, `step.failed`, `run.completed`, `run.failed`) with monotonic per-run sequence | SSE route `GET /api/v1/orcflo/runs/:runId/stream` replays events in order then emits `run.snapshot`; sequence verified `1..6` for a two-step run |
| **Step cache** | `OrcfloStepCacheEntry` — content-hashed step output keyed by `(workflowId, workflowVersion, nodeId, configuration, input)` | Opt-in per node (`configuration.cacheable === true`); first run misses, identical re-run hits without re-executing the handler, different input misses; cache hits are metered; non-cacheable nodes are never cached |
| **Metering** | `OrcfloMeteringRecord` — observable units (`run.count`, `run.duration_ms`, `step.count`, `step.cache_hit/miss`, `step.failed`, `model.call`, `model.tokens_in/out`, `model.failed`, `cost.minor`) | Records written per run/step/model call; `GET /api/v1/orcflo/metering` returns a `MeteringSummary`; live smoke: 2 runs → `runs=2, steps=3, cacheHits=1, cacheMisses=1` |
| **Model provider** | `ModelProviderGateway` (noop / demo / external) + `OrcfloModelProvider` registry | Demo gateway returns a deterministic echo with bounded token estimates and meters tokens; noop/external/disabled providers refuse with `PROVIDER_ERROR`; external providers require an endpoint at save time; `agent` workflow nodes resolve `configuration.modelProviderId` and fail closed (`CONFIGURATION_ERROR`) without one |
| **Triggers** | `OrcfloTrigger` discriminated by kind | manual → fire by id; schedule → deterministic 5-field cron (UTC + fixed offsets only) with once-per-minute-bucket semantics via `lastFiredAt`; webhook → tenant-unique secret key, wrong key is `NOT_FOUND`; event → fires on matching `eventType`. Every fire path funnels through `OrcfloEngine.startRun`, so all run guarantees apply |
| **Blueprints** | `OrcfloBlueprint` — parameterized workflow templates | `{{ key }}` inline substitution + `$key` typed substitution; required/default parameter resolution with type coercion (string/number/boolean/json); derivation from an existing workflow; instantiation saves a first-class `Workflow` that Orcflo can execute immediately |
| **Cron matcher** | `lib/domain/cron.ts` — pure, deterministic 5-field matcher | Parse validation, step/range/list fields, vixie dom/dow OR semantics, fixed-offset timezones, bounded `nextCronFires`, once-per-bucket `isDueCron` |

## 2. Contracts, ports, adapters, routes

**New canonical contracts (additive):** `lib/domain/orcflo.ts` (runs, run events, step cache, metering, model providers, triggers, blueprints), `lib/domain/cron.ts` (deterministic scheduling authority), `lib/domain/stable-json.ts` (content-hash foundation).

**Ports:** `OrcfloPersistencePorts` (`runs`, `runEvents`, `stepCache`, `metering`, `modelProviders`, `triggers`, `blueprints`) and `ModelProviderGateway` added to `lib/application/ports.ts`. The engine consumes `OrcfloRuntimePorts = PlatformPorts & OrcfloPersistencePorts`, reusing the existing workflow repository, event/outbox publication, policy, and unit-of-work boundary.

**Application services:** `OrcfloEngine` (`lib/application/orcflo-engine.ts`), `OrcfloTriggerService` (`lib/application/orcflo-triggers.ts`), `OrcfloBlueprintService` (`lib/application/orcflo-blueprints.ts`), `NoopModelProviderGateway` / `DemoModelProviderGateway` (`lib/application/model-providers.ts`).

**Adapters:** in-memory repositories in `lib/infrastructure/memory-adapters.ts` (inside the same `InMemoryPlatformStore`, so the existing snapshot-rollback unit of work covers Orcflo writes atomically); Prisma repositories in `lib/infrastructure/prisma-adapters.ts` (transaction-scoped via `DatabaseClient`); seven new tables + relations in `prisma/schema.prisma`; migration `20260816220000_orcflo_engine`.

**Routes (14, all under `/api/v1/orcflo`):** `POST/GET runs`, `GET runs/:runId`, `GET runs/:runId/stream` (SSE), `GET metering`, `POST/GET models`, `POST models/:providerId/call`, `POST/GET triggers`, `POST triggers/:triggerId/fire`, `POST triggers/webhook/:key/fire`, `POST triggers/schedule/drain`, `POST triggers/event/fire`, `POST/GET blueprints`, `POST blueprints/from-workflow`, `POST blueprints/:blueprintId/instantiate`.

**Composition root:** `lib/server/platform.ts` wires the engine, trigger service, blueprint service, and the runtime-gated model gateway (demo → deterministic demo gateway; any other mode → no-op fail-closed gateway).

## 3. Automated verification run

Node.js `22.22.3`, Next.js 15.5.23, Prisma 7.9.1, vitest 4.1.10.

```text
$ npm run lint          -> no errors
$ npm run typecheck     -> no errors (strict)
$ npm test              -> 18 files passed, 147 tests passed, 5 opt-in PostgreSQL tests skipped (no server)
$ npx next build        -> optimized build; 37 routes (23 baseline + 14 Orcflo)
```

New test files:

| File | Coverage |
|---|---|
| `tests/orcflo-domain.test.ts` | cron parse/match/next/due incl. timezone and OR semantics; stable JSON hashing (18 tests) |
| `tests/orcflo-engine.test.ts` | runs, output threading, READY gate, RBAC, evidence gate, failure/stream/approval paths, cost limit, tenant isolation, metering summary, step-cache hit/miss/non-cacheable, model provider success/fail-closed paths, `agent` node wiring (18 tests) |
| `tests/orcflo-triggers.test.ts` | creation validation for all four kinds, webhook key generation/uniqueness, manual/webhook fire, once-per-bucket schedule drain, event matching, disabled trigger, DRAFT workflow refusal, tenant isolation (13 tests) |
| `tests/orcflo-blueprints.test.ts` | from-graph/from-workflow creation, placeholder declaration check, typed substitution (string/number/boolean/json), defaults, missing/unknown parameter rejection, tenant scoping, instantiate-then-run (8 tests) |
| `tests/orcflo-routes.test.ts` | all route groups over real handlers incl. SSE replay, metering, model calls, webhook/schedule/event firing, blueprint instantiation, VIEWER denial (9 tests) |

## 4. Live HTTP smoke evidence (demo + ephemeral-memory)

Production build served with `next start`; every call authenticated through the demo identity + membership path (`tenant_demo` / `actor_ada` / `BUILDER`):

1. `POST /api/v1/workflows` — READY workflow saved (`workflow_…`).
2. `POST /api/v1/orcflo/runs` — run `COMPLETED`, steps `a:COMPLETED,b:COMPLETED`.
3. `GET /api/v1/orcflo/runs/:id/stream` — `event: run.started`, `step.started`, `step.completed`, `step.started`, `step.completed`, `run.completed`, `run.snapshot`.
4. Identical second run — step `b` recorded `CACHED, cacheHit:true` (handler not re-executed).
5. `GET /api/v1/orcflo/metering` — `runs=2, steps=3, cacheHits=1, cacheMisses=1, durationMs=8`.
6. `POST /api/v1/orcflo/models` + `POST …/call` — demo provider `COMPLETED`, `tokens 3/17`.
7. Webhook trigger created (auto key `whk_…`), `POST /api/v1/orcflo/triggers/webhook/:key/fire` → run `COMPLETED`, `triggerKind=webhook`.
8. Schedule trigger (`*/5 * * * *`, UTC) + `POST …/triggers/schedule/drain` with `now=2026-08-14T10:05:00Z` → 1 run `COMPLETED`.
9. Event trigger (`vendor.verified`) + `POST …/triggers/event/fire` → 1 run `COMPLETED`.
10. Blueprint created, instantiated with `{ recipient: "Lagos" }` → workflow saved, run `COMPLETED`.

## 5. PostgreSQL status

**Migration-level verification: PASSED on PostgreSQL 16 (PGlite WASM engine).** The full migration history (4 baseline + `20260816220000_orcflo_engine`) applied cleanly; 7/7 Orcflo tables present; 24 Orcflo indexes; 10 foreign keys; JSON round-trip on `OrcfloRun`; `UNIQUE("tenantId","key")` enforced on the step cache; FK to `Workflow` enforced; `BigInt` metering round-trip. PGlite embeds PostgreSQL 16 but is not a full server cluster.

**Server-level adapter verification: UNVERIFIED.** `prisma generate`/`validate` could not run in this sandbox because `binaries.prisma.sh` (the Prisma engine CDN) is unreachable from the sandbox network, so the real generated client was unavailable and the Prisma adapters could not be exercised against a live server. A types-compatible local stub was used for local typecheck/tests/build only; it is gitignored and never part of the repository. CI regenerates the real client (`npm run db:generate`). The Prisma adapter layer and the migration are ready for the next disposable-cluster run, mirroring the existing `RUN_POSTGRES_INTEGRATION=1` opt-in suite (`tests/postgres-integration.test.ts`).

## 6. Boundaries (fail-closed by design)

- **Model provider:** no external LLM SDK is wired. `noop` refuses every call; `external` providers are configuration placeholders only and are refused with `PROVIDER_ERROR`; only the explicitly ephemeral demo gateway answers, with a deterministic echo.
- **Step cache:** opt-in per node. A node is cached only when `configuration.cacheable === true`; nothing is ever replayed on a fuzzy match (SHA-256 over workflow/version/node/configuration/input).
- **Schedule triggers:** the drain endpoint is the deterministic authority (`lastFiredAt` guarantees once per minute bucket). A durable background scheduler/worker with leases is future work.
- **Event triggers:** fired explicitly by event type through the API; automatic event-bus wiring behind a worker is future work (no runaway recursion exists because nothing auto-listens).
- **Run stream:** runs execute synchronously inside `startRun`; the SSE route replays the durable event log then emits a snapshot. Live long-poll subscription behind a background worker is future work.
- **Blueprint substitution:** only declared parameters are substituted; undeclared placeholders and unknown value keys are rejected at validation time.

## 7. Pre-existing fixes included

- `tests/agent-command-routes.test.ts` failed at HEAD (4 tests) because the identity-layer membership authority is wired in memory mode but the route tests never provisioned memberships; the tests now provision `BUILDER`/`VIEWER` memberships per claimed role.
- The documented demo defaults (`tenant_demo` / `actor_ada` / BUILDER) could not authenticate in demo+memory mode because the wired membership authority had no rows and no provisioning path existed; the composition root now seeds those documented defaults in demo+memory mode only (non-demo modes never seed).

## 8. Decision-log record

See `docs/ARCHITECTURE.md` §5 for the governing decision-log entry (2026-08-16): Orcflo is the run-time half of VOXFLOW, additive to the canonical workflow contract; no second event/outbox/unit-of-work model; all external behavior fails closed until verified.

## 9. Limitations

- No live PostgreSQL server verification (sandbox network blocks the Prisma engine CDN and package mirrors); the Prisma path is ready but `UNVERIFIED` on a server cluster.
- No durable background scheduler, worker lease, resumable approval, or live stream subscription.
- Browser automation remains `UNVERIFIED` (no browser executable in the sandbox), as in prior increments.

## 10. Follow-up increment — AGENT ⇄ WORKFLOW bridge

This PR was extended with the two interop bridges the workflow directive calls the most important addition: **Workflow-as-Tool** (an agent can call a published workflow as a canonical tool, with correlation, parent execution id, and a recursion depth limit) and **Agent-as-Node** (workflow `agent` nodes execute through the canonical `BoundedAgentRuntime`, never a second agent implementation; the direct-provider path moved to a new `ai_model` node type). The full WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE is captured at `docs/WORKFLOW-ENGINE-DIRECTIVE.md`; the 56-section compliance map and bridge verification are in `docs/verification/workflow-runtime-bridge-2026-08-16.md`.

## 11. Follow-up increment — deterministic control flow (§12–§14, §45)

The Orcflo engine now executes graphs, not linear topo passes:

- **Conditional edges (§12)** — `condition` nodes evaluate deterministic dot-path comparisons (`configuration.path` + `op` in eq/neq/gt/gte/lt/lte/exists/truthy + `value`) in code, never via an LLM. Edges carry `condition: true/false` and fire only when the source output (or its `result` field) matches. Untaken branches are recorded as `SKIPPED` steps in run history.
- **Router nodes (§13)** — `router` nodes with `configuration.routes` select a route from `configuration.pickPath` (default `route`) with an optional `defaultRoute`, output `{ route }`, and fire only the edge whose `sourceHandle` matches. No match → run `FAILED` with a machine-readable reason.
- **Bounded loops (§14)** — `for_each` nodes iterate `configuration.collection` with `maxItems`/`maxIterations` safety limits; the body consumes `input.item` / `input.index` / `input.iteration`; a `loop: true` back edge returns to the head and `loopExit: true` edges fire when done. Limit violations fail the run with clear reasons; a global per-run node-execution cap (`maxNodeExecutions`, default 1000) is the final safety net.
- **Loop-aware validation (§45)** — cycles are accepted only as bounded loops: every `loop` edge must target a `for_each` head, every such head needs a `loopExit` edge, nested loops are rejected, and router edges must carry a matching `sourceHandle`. The legacy linear `WorkflowRunner` refuses loop workflows with `CONFLICT` (use the Orcflo engine).

Verified: lint + strict typecheck + 185 tests (25 new control-flow tests incl. branch/skip/route/loop/validation/merge invariants) + optimized 38-route build + live HTTP smoke (3-item loop iterates 3× then exits; router fires only the chosen branch; metering counts executed steps).

## 12. Follow-up increment — parallel execution (§47)

Independent handler nodes now execute **concurrently up to a bounded `maxConcurrency`** (default 4, clamped [1, 32], configurable per run via `maxConcurrency` on `POST /api/v1/orcflo/runs`). Execution is wave-based: each wave is the set of activations ready at the same moment (deduped, so a merged node still executes exactly once); control nodes (`for_each`/`condition`/`router`) run sequentially since they mutate loop/run state; handler nodes run concurrently through a bounded worker pool. Every node in a wave sees the same base context (run input + all prior waves' outputs), and step/event ordering is deterministic (topological order within the wave: `step.started` batch, then concurrent execution, then `step.completed` batch), so parallel execution never changes the observable run — the run stream stays replayable and monotonic. Failures are captured per node and re-thrown in topological order (`step.failed` + `run.failed` with the failing node). Limits (§40) still apply: `maxNodeExecutions`, cost, and deadline are enforced in the sequential apply phase.

Verified: lint + strict typecheck + 192 tests (7 new parallel tests: real concurrency overlap capped at `maxConcurrency`, sequential mode at 1, deterministic started/completed event ordering, parallel-branch failure, merge-once invariant, cache hit/miss under parallelism, oversized-concurrency clamp) + optimized 38-route build + live HTTP smoke (3-way fan-out executes concurrently then merges exactly once with deterministic step order).

## 13. Follow-up increment — run idempotency (§48)

Duplicate triggers and retries no longer create duplicate runs:

- **Canonical key** — `OrcfloRun.idempotencyKey` (optional, 8–200 chars), unique per `(tenantId, idempotencyKey)` enforced by a partial-safe unique index (PostgreSQL NULLs are distinct, so keyless runs stay exempt; verified on PostgreSQL 16 via PGlite: duplicate key rejected, multiple NULL keys allowed, same key across tenants allowed).
- **Engine** — `startRun` accepts `idempotencyKey`; a previous run with the same tenant+key is **replayed as-is** (historical runs are immutable; new input ignored), a key reused for a different workflow is `CONFLICT`, short keys are `VALIDATION_ERROR`, and a concurrent race is resolved by re-fetching the winner after the save conflict (the DB unique index is the ultimate guard; the Prisma adapter surfaces `P2002` as `CONFLICT`).
- **Webhook triggers** — explicit key (header `Idempotency-Key` or body `idempotencyKey`) wins; otherwise a key is **derived from (trigger, payload)** so a duplicate delivery with an identical body replays the same run while a genuinely different payload still creates a new one.
- **Event triggers** — explicit key wins; otherwise derived from (trigger, eventType, payload).
- **Manual fires and the runs API** — optional explicit `idempotencyKey` passthrough.
- **Schedule drain** — already once-per-minute-bucket via `lastFiredAt`; unchanged.

Verified: lint + strict typecheck + 205 tests (10 engine + 4 route idempotency tests: replay-immutability, separate keys, cross-workflow conflict, short-key validation, webhook body-derived dedupe + different-payload new run, explicit-key override, event dedupe, manual retry, route replay, header override) + optimized 38-route build + migration verified on PostgreSQL 16 (PGlite).

## 14. Follow-up increment — public workflow interfaces (§34)

A workflow can now be exposed as an **anonymous public interface** (the "public form" flow: PUBLIC FORM → INPUT VALIDATION → WORKFLOW RUN → OUTPUT):

- **New trigger kind `public`** — the canonical `OrcfloTrigger` carries `config.slug` (`pub_…`, globally unique, generated or explicit), `config.inputSchema` (declared field types: string/number/boolean/json with required/default), `rateLimitPerMinute` (default 10), `maxRunsPerDay` (default 100), `maxCostMinor` (default 100k), `maxDurationMs` (default 30s), and `environment` (default demo). Management API: `GET/POST /api/v1/orcflo/interfaces` (authenticated, `workflow:read`/`workflow:write`).
- **Anonymous invocation** — `POST /api/v1/orcflo/interfaces/:slug/run` deliberately does NOT authenticate (there is no caller identity); abuse controls apply before any run starts. Unknown or disabled slug → `NOT_FOUND` (no existence leak).
- **Input validation** — deterministic Zod built from `config.inputSchema`; unknown fields rejected (strict); checked **before** a rate-limit token is consumed so malformed submissions return 422 rather than being masked by a near-cap limiter.
- **Abuse prevention** — per-interface rate limiting and a daily run cap (in-process, ephemeral; a shared limiter replaces it in multi-process production), plus cost/duration bounds passed into the run engine. Exceeding → `RATE_LIMITED` (429).
- **Idempotency (§48)** — explicit key or derived from (interface, payload), so a double-submitted form replays instead of double-running.
- **Synthetic `PUBLIC` role** — execute-only (`workflow:execute`), never a membership role (`MembershipRole` excludes it); node/agent/tool policies still apply, so a public interface cannot bypass tenant gates (an approval node still pauses the run). Cross-tenant slug lookup via `OrcfloTriggerRepository.findPublicBySlug` (memory scan; Prisma JSON path filter).

Verified: lint + strict typecheck + 221 tests (15 service + 1 route test: creation/slug uniqueness/RBAC, anonymous run + lastFiredAt, schema validation incl. strict unknown-field rejection, defaults, NOT_FOUND for unknown/disabled, per-minute + daily limits with window reset, derived + explicit idempotency, cost limits, policy non-bypass via approval pause, route-level 202/422/429/404 + authenticated listing) + optimized 40-route build + live HTTP smoke (create → anonymous submit with default applied → duplicate replay → 422 → 429 → authenticated list).

## 15. Follow-up increment — engineering-governance documents

Added the three-file governance structure under `docs/` (no code changes; documentation only):

- **`docs/CODE_AGENT_MASTER_PROMPT.md`** — the engineering control prompt (v1.0, verbatim): inspect-first, reuse-before-create, no duplicate core systems, LLM output is untrusted input, deterministic logic over LLM for critical decisions, execution safety/approvals as persisted state, structured events/observability, build verification before claiming success, never fabricate, the §62 change report and §63 quality gate, and the VOXFLOW engineering contract (GOAL → PLAN → ACT → OBSERVE → VERIFY → ADAPT → OUTCOME).
- **`docs/ARCHITECTURE_DECISIONS.md`** — canonical ADR register: ADR-001 (modular monolith with asynchronous boundaries before microservices), ADR-002 (the workflow execution engine is the canonical execution substrate — agents/voice/vision/MCP must invoke the same primitives), ADR-003 (existing code paths have priority over greenfield), plus a consolidated register (ADR-004…ADR-016) carrying forward every decision already recorded in `docs/ARCHITECTURE.md` §5 so future agents do not rediscover and undo them.
- **`docs/DEVELOPMENT_SPEC.md`** — the "what VOXFLOW is and what we are building" index, derived strictly from the repository's verified docs (README, ARCHITECTURE.md, WORKFLOW-ENGINE-DIRECTIVE.md, verification records).

`docs/ARCHITECTURE.md` §5 and `docs/WORKFLOW-ENGINE-DIRECTIVE.md` now link the register, the master prompt, and the spec index. Verified: fence balance and section integrity of the master prompt (68 sections 00–67); markdown only, no lint/typecheck/test/build impact.

## 16. Follow-up increment — runtime-domain specifications (Agent, Tool & MCP, Voice & Vision)

Added the three foundational runtime specifications, transcribed verbatim (documentation only):

- **`docs/AGENT_RUNTIME_SPEC.md`** — Agent Runtime Specification v1.0 (75 sections): the agent as a *bounded autonomous decision-maker* — agent contract and lifecycle, the PERCEIVE→…→COMPLETE loop, goals vs instructions vs constraints vs success criteria, autonomy levels 0–4, action proposals/plans, tool selection through the registry, prompt-injection/context hierarchy, memory divided by purpose, handoffs (human and agent-to-agent), failure classification + recovery, termination guarantees, agent events/observability/economics, agent API, transaction interface, and the final agent contract ("AGENT → THINKS, KERNEL → CONTROLS, TOOLS → ACT…").
- **`docs/TOOL_AND_MCP_SPEC.md`** — Tool & MCP Specification v1.0 (70 sections): one canonical tool system across agents/workflows/voice/vision, the ToolDefinition/ToolExecutor contract, metadata/identity/versioning/risk/permissions, input+output validation, provider adapters, SmartProxy responsibilities as infrastructure (protectedFetch, batch, pooling, rate limits, circuit breaking, error normalization), MCP through the tool registry with trust classification and lifecycle/health, dynamic tool creation through the same governance, transactions as a stronger-than-tools abstraction, endpoint interface, observability/events, and acceptance criteria.
- **`docs/VOICE_VISION_SPEC.md`** — Voice & Vision Specification v1.0 (65 sections): voice/vision as interfaces into the canonical execution model — Pipecat as the canonical voice framework (local Whisper STT adapter, deterministic VoiceCommandProcessor, participant-scoped transcription, push-to-talk, barge-in, background audio), TTS provider-agnostic with the provider explicitly unresolved and Coqui XTTS prohibited, vision as structured perception (camera/screen/OCR/document, sampling, privacy), LiveKit as transport only where adopted, realtime session/network handling, privacy/retention/licensing controls, and acceptance criteria.

All three specs list `EXECUTION_KERNEL_SPEC.md` in their `Depends On`; that file is not yet provided — the Orcflo engine remains the current kernel reference implementation (ADR-002). `docs/DEVELOPMENT_SPEC.md` now indexes the full spec set (including the pending kernel spec) with the AGENTS/WORKFLOWS/TOOLS → EXECUTION KERNEL → POLICY/EVENTS/STATE → EXTERNAL WORLD diagram; `docs/ARCHITECTURE.md` §5 links the four runtime specs. Verified: fence balance and section integrity (75/70/65 sections); markdown only.

## 17. Follow-up increment — EXECUTION_KERNEL_SPEC.md

Added **`docs/EXECUTION_KERNEL_SPEC.md`** — the canonical execution-substrate specification that every foundational spec's `Depends On` referenced (v1.0, 44 sections). Authored from the repository's actual kernel (no fabricated capabilities): the kernel contract (governed/bounded/deterministic/persisted/observable/validated/idempotent/fail-closed), the canonical primitives (Run/Step/Run Event/Cache Entry/Meter Record), run and step lifecycle, the node-executor handler contract, kernel-native control nodes (condition/router/for_each), deterministic execution context, loop-aware graph validation, wave-based concurrency, duration/cost/node-execution bounds, idempotency keys, content-hashed step cache, metering, replayable run stream, transactional-outbox domain events, PostgreSQL/Prisma + ephemeral-memory persistence with the unit-of-work boundary, the single tool-executor port + workflow-as-tool, the fail-closed model gateway, agent nodes through the canonical `BoundedAgentRuntime`, the five trigger kinds converging on `startRun`, deterministic scheduling, approval as persisted state, blueprints, public interfaces, version-pinned runs, tenant isolation, the policy gate, input validation, the evidence gate, machine-readable errors and classified retries, observability/events/security/cost control, kernel testing, and acceptance criteria. Open contract items are stated honestly rather than claimed: synchronous execution today with the async Request→Persist→Queue→Worker→Execute→Persist→Emit boundary and resumable `WAITING_APPROVAL` listed as future work.

`docs/DEVELOPMENT_SPEC.md` and `docs/ARCHITECTURE.md` §5 now present the kernel spec as provided (the /docs index and the spec-pointer paragraph no longer mark it pending). Verified: fence balance and section integrity (44 sections); markdown only, no code impact.

## 18. Follow-up increment — durable execution (§25/§32/§36/§49)

The Execution Kernel's async boundary is now implemented:

- **Async runs (§25/§36)** — `OrcfloEngine.createRun` persists a **PENDING** run with the caller context (`actorId`/`role`/`environment`) and clamped execution `limits` captured at creation; `OrcfloEngine.executeRun` executes (or resumes) it; `startRun` composes both so internal callers and tests keep synchronous semantics. `POST /api/v1/orcflo/runs` accepts `async: true` → 202 with a PENDING run. The in-process **RunDispatcher** (unref'd loop, `ASE_RUN_TICK_INTERVAL_MS` default 1s, `tick()` for deterministic tests) drains PENDING runs; `executeRun` is idempotent on terminal runs, so re-ticks never duplicate work. Cross-tenant worker lookup via `findByIdGlobal` (platform-level, mirroring the outbox).
- **Live run stream (§11/§36)** — a new in-process **RunEventBus**: the engine publishes every appended run event; the SSE route replays the durable log then subscribes live (no polling), ending with `run.snapshot`. Verified live: an async run's stream showed `run.started → steps → run.resumed → tail steps → run.completed → run.snapshot`. Single-process semantics; a NATS-backed bus replaces it in multi-instance deployments.
- **Resumable approval (§49)** — `POST /api/v1/orcflo/runs/:runId/approval` (`approval:decide`, APPROVER+): `APPROVED` persists the decision on the run and resumes execution from the approval node (completed work is never re-executed — outputs/keys/cost/evidence are rebuilt from persisted steps and a ready-set of unexecuted nodes whose incoming edges are satisfied); `REJECTED` cancels the run with `run.cancelled`. Resuming inside an active `for_each` loop fails with a clear `WORKFLOW_ERROR` (loop checkpoints are future work). Steps now persist `iteration` so resume keys and history stay faithful.
- **Schedule worker (§32)** — `ScheduleDispatcher` (unref'd loop, `ASE_SCHEDULE_TICK_INTERVAL_MS` default 60s) drains due schedules **cross-tenant** (`OrcfloTriggerRepository.listAll` + `OrcfloTriggerService.drainSchedulesGlobal`) with a system worker context, preserving once-per-bucket semantics. Verified: two tenants' due schedules both fired, re-tick produced nothing.

Migration `20260816233000_orcflo_durable_execution` adds `actorId`/`role`/`environment`/`limits`/`approval` to `OrcfloRun` — verified on PostgreSQL 16 (PGlite): durable-field JSON round-trip + PENDING query.

Verified: lint + strict typecheck + 231 tests (8 durable + 2 route tests: async PENDING→worker→COMPLETED, bus event delivery, executeRun idempotency, approve→resume→complete incl. parallel-branch merge-once, reject→cancel, approval RBAC, active-loop resume rejection, cross-tenant schedule drain) + optimized 39-route build + live HTTP smoke (async queued run auto-completed; approval flow with `run.resumed` visible in the live stream; reject → CANCELLED).

## 19. Follow-up increment — persisted decision records (branch coverage / audit)

Control-node decisions are now first-class, tenant-scoped, queryable records:

- **Contract** — `OrcfloDecisionRecord` (`lib/domain/orcflo.ts`): `id/tenantId/runId/workflowId/nodeId/kind` (`condition` | `router` | `for_each`), `subject` (the evaluated path/pickPath/collection), `result` (the decision value), `iteration` (matching the step it accompanied), `occurredAt`.
- **Recording** — the engine appends one record whenever a control node decides: `condition` (result boolean), `router` (selected route), `for_each` (item emit or done-check). Recorded across synchronous, async-worker, and resumed executions; the resume path does not duplicate earlier records.
- **Port + adapters** — `OrcfloDecisionRepository.append/listForRun` in `OrcfloPersistencePorts`, with in-memory and Prisma implementations; migration `20260817000000_orcflo_decision_records` adds the table + indexes, verified on PostgreSQL 16 (PGlite: JSON result round-trip).
- **API** — `GET /api/v1/orcflo/runs/:runId/decisions` (tenant-scoped, `workflow:read`) returns the decisions in occurrence order.

Verified: lint + strict typecheck + 235 tests (3 engine + 1 route decision tests: condition/router/for_each kinds with results and ordering, tenant isolation, async+resume recording) + optimized 40-route build + migration verified on PostgreSQL 16 (PGlite).

With this, the "deterministic branch evaluation" open action is fully resolved: deterministic conditions/routers/loops (control-flow increment), parallel execution, agent-node wiring, and now persisted decision records + branch coverage evidence.

## 20. Follow-up increment — multi-worker run claim/lease

The run worker is now multi-worker safe, mirroring the outbox claim/lease protocol (Audit §3):

- **Contract** — `OrcfloRun` carries `claimedBy`/`claimedUntil`; `OrcfloRunRepository` gains `claimBatch(workerId, leaseMs, limit)` and `releaseClaim(id, workerId)` (conditional on ownership). `listPending` remains for monitoring.
- **Adapters** — memory: serialized claim lock simulating `FOR UPDATE SKIP LOCKED`; Prisma: atomic `FOR UPDATE SKIP LOCKED` selection + conditional UPDATE inside one transaction, reclaiming rows whose lease expired. Migration `20260817001000_orcflo_run_claim_lease` (columns + `(status, claimedBy, claimedUntil)` index), verified on PostgreSQL 16 (PGlite).
- **Dispatcher** — `RunDispatcher` claims a batch with its worker id + lease (`ASE_RUN_WORKER_ID`, `ASE_RUN_LEASE_MS` default 60s), executes each claimed run via `executeRun(runId, { workerId })`, and releases the claim once the run is parked (WAITING_APPROVAL) or terminal. `executeRun` guards against executing a run claimed by another worker with a live lease. Lease renewal/heartbeat remains future work (a crashed worker's expired lease is reclaimable, as with the outbox).

Verified: lint + strict typecheck + 243 tests (8 new claim/lease tests: batch claim exclusivity while lease live, expiry reclaim, ownership-conditional release, dispatcher claim→execute→release on completion and on approval-pause, cross-worker guard, concurrent disjoint draining) + optimized 40-route build + migration verified on PostgreSQL 16 (PGlite).

## 21. Fix pass — 2026-08-17 (security + hardening)

- **npm audit → 0 vulnerabilities.** The three high production findings (PostCSS XSS/path-traversal, Sharp/libvips CVEs — both transitive through Next.js) are mitigated without the breaking Next.js 16 upgrade by pinning patched `postcss@8.5.26` and `sharp@0.35.3` via `package.json` `overrides` (no `next/image` usage in the app, so the sharp bump is inert at runtime). Verified: `npm audit --omit=dev` = 0; typecheck, 246 tests, and the production build all pass. The controlled Next.js 16 upgrade remains deferred per the release open action.
- **Public-interface rate limiting hardened (§34).** The limiter now enforces three scopes: per-interface (existing), per-caller-IP (`rateLimitPerIpPerMinute`, default 5, independent of the interface cap so one IP cannot exhaust a shared budget), and per-tenant aggregate across all interfaces (`ASE_PUBLIC_TENANT_RATE_PER_MINUTE` default 100, `ASE_PUBLIC_TENANT_MAX_RUNS_PER_DAY` default 1000). The anonymous run route derives a best-effort IP from `x-forwarded-for`/`x-real-ip`.
- **Env documentation completed.** `.env.example` now documents `ASE_RUN_TICK_INTERVAL_MS`, `ASE_SCHEDULE_TICK_INTERVAL_MS`, and the public-interface tenant caps (the worker tick vars were previously code-only).

Verified: lint + strict typecheck + 246 tests (2 new hardening tests: per-IP limiting independent of the interface cap, aggregate tenant cap across interfaces) + optimized 40-route build; `npm audit --omit=dev` = 0 vulnerabilities.

## 22. Follow-up increment — route architecture specification + Route Completion Contract

Added the frontend route-by-route implementation map (documentation only):

- **`docs/ROUTE_ARCHITECTURE_SPEC.md`** — VOXFLOW Route Architecture v1.0 (43 sections + the Route Completion Contract): the full Next.js App Router target map (`/`, `/product/*`, `/solutions/*`, `/blueprints`, `/developers/*`, `/docs/*`, `/app/*` incl. dashboard/workflows/agents/tools/mcp/runs/approvals/blueprints/schedules/connections/knowledge/settings/team/usage/audit, `/run/[executionId]`, `/share/[workflowId]`, `/api/v1`), with per-route purposes and next-action checklists, the Route → Domain Ownership map (Workflow Domain / Agent Runtime / Tool Layer / Execution Kernel / Governance / Scheduler / Event Infrastructure), the 7-wave page build order, and the "frontend never owns domain state" rule. A status header records the current-state route surface honestly (marketing + `/app/canvas`, `/app/voice`, `/app/vendors`) so the map is a target, not a claim.
- **`docs/CODE_AGENT_MASTER_PROMPT.md` §68** — the Route Completion Contract: a route is complete only when route ownership, domain ownership, source of truth, data contract, loading/empty/error/permission/success states, mutation behavior, backend integration, mobile, accessibility, tests, and runtime verification all exist; the frontend must never fabricate backend state (mock data only in explicit demo/mock mode).

`docs/DEVELOPMENT_SPEC.md` and `docs/ARCHITECTURE.md` §5 now index/link the route spec. Verified: fence balance; section integrity (master prompt now 00–68); markdown only, no code impact.

## 23. Follow-up increment — Route Architecture Wave 1 (core product surfaces)

Implemented the first build wave of `docs/ROUTE_ARCHITECTURE_SPEC.md` §41 as real surfaces over the existing domain APIs, per the Route Completion Contract (master prompt §68):

- **`GET /api/v1/workflows/:workflowId`** — the Workflow Domain read API the detail page consumes (tenant-scoped, `workflow:read`); new route-level tests.
- **`/app/dashboard`** — Mission Control (spec §17): real counts from the domain APIs (workflows, runs, metering summary), pending approvals derived from runs in WAITING_APPROVAL, recent-run table, failures list, quick-create. Loading / error+retry / empty states.
- **`/app/workflows`** — workflow library (spec §18): canonical workflow list with status filters (READY/DRAFT/PAUSED/ARCHIVED), search, row → detail.
- **`/app/workflows/new`** — creation surface (spec §19): FROM SCRATCH (creates a real DRAFT workflow), FROM BLUEPRINT (instantiates a real blueprint, with parameter form), DESCRIBE GOAL (honest target state — natural-language generation is not wired; the panel says so and offers the working paths; no fabricated generation).
- **`/app/workflows/[workflowId]`** — workflow detail: canonical definition (GET by id), node inventory, version/status, run history from the Execution Kernel, Run + Publish mutations through the domain APIs, Studio link.
- **`/app/runs`** — execution history (spec §26): runs list with status filters → observatory.
- **`/app/runs/[executionId]`** — Execution Observatory (spec §27): run aggregate, ordered steps timeline (status/cost/iteration/cache), inputs + outcome, replayable event stream, persisted decision records, failure output, and a resumable-approval panel that surfaces the permission state honestly (demo BUILDER identity → "requires APPROVER" notice) instead of faking a decision.

Shared infra: `components/AppShell` (top bar over scrolling main), `components/client-api` (stable error envelope), `components/app-format` (pure, unit-tested formatting helpers), and a Wave-1 CSS block in `app/globals.css` (KPI grid, tables, states, creation modes, observatory layout, mobile breakpoint).

Verified: lint + strict typecheck + 254 tests (8 new: 3 workflow-detail route tests incl. tenant isolation + 5 formatting-helper tests) + optimized build with all 6 new routes + live HTTP smoke (every page 200; seeded workflow → async run COMPLETED → detail + observatory render, decision record `router → {route:"a"}` served). Client pages render the shell + loading state server-side and hydrate real data client-side, per the Route Completion Contract.

## 24. Follow-up increment — Route Architecture Wave 2 (agent system)

Implemented build wave 2 of `docs/ROUTE_ARCHITECTURE_SPEC.md` §41 as real surfaces over a new Agent domain API, per the Route Completion Contract:

- **`GET/POST /api/v1/agents` + `GET /api/v1/agents/:agentId`** — the Agent Runtime domain API (Route → Domain Ownership: /api/v1/agents → Agent Runtime). Create validates against the canonical `AgentCreateSchema` (goals, instructions, tools, permissions, policies), persists a REGISTERED agent, and enforces `agent:write`/`agent:read`. 4 route tests: create+list, detail + tenant isolation, role permissions (VIEWER reads, cannot write), validation.
- **`/app/agents`** — agent registry (spec §21): real agents with status/role/tools/budget, search, empty + error + loading states.
- **`/app/agents/new`** — agent builder (spec §22): schema-backed form (identity, objective, instructions, tools, permissions, capabilities, environments, limits: iterations/duration/budget) that creates a real agent; comma-list tool/permission entry in this wave (a registry-backed selector is Wave 3).
- **`/app/agents/[agentId]`** — agent command center (spec §23): structured identity, objective, instructions, authority (tools/permissions/capabilities/environments/data), limits & budget, and an explicit "how this agent executes" panel — no raw chain-of-thought is stored or exposed.
- **AppShell** — Agents added to the primary nav.

Verified: lint + strict typecheck + 258 tests (4 new agent-route tests) + optimized build (3 new routes) + live HTTP smoke (registry + builder 200; API create → REGISTERED v1; detail page 200; list returns the agent).

## 25. Follow-up increment — Route Architecture Wave 3 (tool system)

Implemented build wave 3 of `docs/ROUTE_ARCHITECTURE_SPEC.md` §41 as real surfaces over the Tool/MCP layer:

- **`GET /api/v1/tools`** — the Tool domain API (Route → Domain Ownership: /api/v1/tools → Tool Layer): lists the tenant's canonical ToolDefinition records (the same ones agents/workflows resolve through the single tool executor), enforcing `tool:read`.
- **`GET /api/v1/mcp/servers`** — the MCP control-plane read API: returns the tenant's registered servers from the platform's McpServerRegistry — today the fail-closed empty registry (no MCP transport exists), so this honestly returns `[]`.
- **`/app/tools`** — tool registry (spec §24): real tools with risk level, availability, cost, timeout, permissions, workflow-as-tool provenance, search + risk filters, loading/empty/error states.
- **`/app/mcp`** — MCP control plane (spec §25): the trust model (TRUSTED/VERIFIED/UNVERIFIED/BLOCKED) and an honest empty state — "no MCP servers configured; no transport implemented" — with the explicit rule that the UI is never the MCP execution layer.
- **`/app/connections`** — external connections (spec §32): honest target state. No connections domain exists, so the page shows the connector categories (Salesforce/SAP/Google/Slack/MCP/Custom APIs) as "Not configured" with the platform guarantee that secrets are never exposed — no fabricated "Connected" status.
- **AppShell** — Tools + MCP added to the primary nav.

Verified: lint + strict typecheck + 261 tests (3 new tool/MCP route tests: empty registry → workflow-as-tool registration appears; tool:read enforcement; fail-closed empty MCP list) + optimized build (5 new routes) + live HTTP smoke (all 3 pages 200; registered workflow tool listed with risk MEDIUM; MCP servers 0).

## 26. Follow-up increment — Route Architecture Wave 4 (governance)

Implemented build wave 4 of `docs/ROUTE_ARCHITECTURE_SPEC.md` §41 as real surfaces over authoritative domain data:

- **`GET /api/v1/events`** — audit trail API (Route → Domain Ownership: /events → Event Infrastructure): the tenant's domain events in reverse-chronological order from the event log (the transactional-outbox envelope), enforcing `workflow:read`. New `EventLog.listByTenant` port + memory/prisma implementations.
- **`GET /api/v1/team/members`** — team API: the tenant-membership authority (Audit §1 — the same records request reconciliation checks); new `TenantMembershipRepository.listForTenant`.
- **`GET /api/v1/orcflo/metering/records`** — raw metering records for the usage breakdown (analytics derived from records, never unrelated counters); new `OrcfloEngine.listMeteringRecords`.
- **`/app/approvals`** — human intervention inbox (spec §29): waiting runs (WAITING_APPROVAL) with Approve/Reject through the governance API, decided runs with decision/decider/time, honest permission notice for the demo BUILDER identity.
- **`/app/usage`** — usage & cost (spec §34): real metering summary KPIs (runs, steps, model calls, tokens, cost, cache) + the raw records table; budgets/projection/alerts flagged as target state.
- **`/app/audit`** — enterprise audit trail (spec §36): real domain events with event-type filters, actor/aggregate/correlation — from the authoritative backend log, never a UI copy.
- **`/app/team`** — team & RBAC (spec §35): real memberships with roles from the membership authority; groups/invitations flagged as target state.
- **AppShell** — Approvals / Usage / Audit / Team added to the (now scrollable) primary nav.

Verified: lint + strict typecheck + 264 tests (3 new governance-route tests: events list, team members incl. roles, metering records) + optimized build (7 new routes) + live HTTP smoke (all 4 pages 200; seeded approval-paused run appears in the data; team lists actor_ada BUILDER + actor_approver APPROVER; audit serves orcflo.run.started + orcflo.run.approval_requested).
