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
