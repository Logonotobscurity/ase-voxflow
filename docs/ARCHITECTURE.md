# Ase / VOXFLOW architecture

**Document status:** implementation- and verification-aligned as of 14 August 2026  
**Governance rule:** future sessions must read §5 Decision Log before relying on any earlier section. Later decision-log entries override stale prose or assumptions.

This document separates code, verified runtime behavior, selected-but-deferred infrastructure, and unresolved decisions. A generated client, migration artifact, UI label, or LLM response is not evidence that an external service operated.

## 1. Identity & Brand

These tokens are resolved and are the only naming source of truth.

| Token | Resolved value | Required use | Legacy/rejected value |
|---|---|---|---|
| `BRAND` | **Ase** | Company, assistant, marketing, and customer-facing brand. Preserve African business context and terminology. | `LOG_ON AI` is a legacy alias only; it must not return as the primary brand. |
| `PLATFORM` | **VOXFLOW** | Autonomous-agent and workflow platform name. | Ase and VOXFLOW must not be collapsed into an ambiguous single token. |
| `LEGACY_ALIAS` | `LOG_ON AI` | Redirect compatibility only through `/log_on`; no independent product surface or component fork. | Treating it as an active brand is explicitly rejected. |
| `CANONICAL_PLATFORM_ROUTE` | `/app/canvas` | Primary authenticated-product preview and Visual Canvas destination. | A separate Vite product shell is rejected. |
| `VOICE_GUIDE_NAME` | `Ayo` | Scripted branded UI guide; it must remain labelled as scripted until a provider is verified. | Presenting Ayo as a connected LLM or voice agent is rejected. |

## 2. Core Stack

This table is the resolved source of truth. Any reversal must first be added to §5.

| Concern | Resolved decision | Evidence / boundary | Explicitly rejected |
|---|---|---|---|
| Web application | Next.js 15 App Router for marketing, `/app`, and route handlers. | `app/`, 24-route production build. | Vite as the primary app; Pages Router duplication; replacing the repository with a standalone sample. |
| Language | Strict TypeScript. | `tsconfig.json`, strict typecheck. | A parallel untyped JavaScript domain/runtime. |
| Runtime validation | Canonical Zod contracts at external and persistence boundaries. | `lib/domain/schemas.ts`. | Ad hoc casts, duplicate schemas, and trusting provider/LLM output. |
| Durable source of truth | PostgreSQL **16** with Prisma **7** and the PostgreSQL driver adapter. | Live PostgreSQL 16.15 migration and runtime verification; `prisma/schema.prisma`. | MongoDB; a second durable persistence layer; direct scattered database access. |
| Persistence architecture | One tenant-scoped port set plus one `UnitOfWork` abstraction; memory is an explicit demo/test adapter. | `lib/application/ports.ts`, memory and Prisma adapters. | Duplicate repositories, hidden persistence fallbacks, or describing memory as durable. |
| Transaction isolation | Prisma interactive transactions at `SERIALIZABLE`, three bounded retries for `P2034`/`P2002`. | Live duplicate-request and competing-decision tests passed. | Unbounded retries or consequential multi-write transitions outside an atomic boundary. |
| Workflow model | One Zod-validated DAG contract, `WorkflowSchema`, shared by React Flow, APIs, and runner. | `CanvasStudio`, `/api/v1/workflows`, `WorkflowRunner`. | Canvas-only workflow vocabularies or a second orchestration graph. |
| Agent command entry | Text and already-transcribed voice share one proposal-only `AgentCommandService`; consequential intent requires explicit review and never executes during proposal. | `/api/v1/agent/commands`; voice compatibility adapter; service/route tests; canvas composer/review dialog. | A parallel voice runtime, browser-only `window.confirm`, or treating a proposal as execution. |
| Events and delivery intent | One `DomainEventSchema`; every publish atomically creates one unique `PENDING` `OutboxMessageSchema`. | Live event/outbox one-to-one integrity passed. | Treating an event bus response or LLM text as execution evidence; publishing consequential events outside the unit of work. |
| HTTP contract | Versioned `/api/v1` route handlers with stable `{ data }` / `{ error }` envelopes. | Production HTTP smoke. | Expanding unversioned legacy write routes. |
| UI canvas | React Flow canvas integrated with the canonical API. | `components/CanvasStudio.tsx`. | A standalone Vite canvas fork or a client timer presented as server execution. |
| Authentication posture | Demo headers are allowed only in `ASE_RUNTIME_MODE=demo`; every other mode fails closed until trusted verification exists. | `lib/server/request-context.ts`; production-mode fail-closed test. | Calling spoofable headers authentication or silently accepting them in production. |
| External SDK policy | Inspect current official docs, maintenance, licensing, and architectural cost before adding a dependency. | Standing engineering policy. | Speculative dependency additions or compatibility claims without execution. |

## 3. Domain-specific stack

**Section status: ⚠️ UNRESOLVED.** Responsibility boundaries are resolved, but the open implementation/provider actions below prevent this section from being labelled resolved. Owner names are accountable role names because no individual assignees have been provided; reassignment must be logged in §5.

### Resolved responsibility assignments

| Domain responsibility | Resolved technology / rule | Current implementation state |
|---|---|---|
| Canvas CRDT collaboration | Liveblocks | Target selected; adapter absent. |
| Browser voice/video media | WebRTC | Target selected; signaling/TURN/media controls absent. |
| Voice and inter-service events | NATS, downstream of the transactional outbox | Outbox verified; broker/dispatcher absent. |
| Mobile push/synchronization | Socket.io | Target selected; adapter absent. |
| Consequential financial/PO effects | Explicit approval state, separation of duties, then an idempotent external rail | Approval authorization exists; no external rail exists. |
| LLM planning | Provider returns proposals only; strict validation and deterministic policy precede tools or side effects | Bounded runtime exists; provider absent. |
| MCP | Trusted allowlist and validated tool contracts only | `McpServer` allowlist table and `McpServerRegistry` port added 2026-08-16. The `mcp` workflow node handler is fail-closed and denies untrusted servers; no transport is implemented in this increment. |
| Observability format | OpenTelemetry-compatible traces/metrics/log correlation | Correlation IDs and one-shot SQL evidence exist; durable telemetry pipeline absent. |
| Assistant surface | One branded Ase panel and red launcher treatment; suppress any provider-default Botpress bubble | Branded scripted panel exists; no Botpress provider runtime is claimed. |
| Multi-user transcriber (already-transcribed) | Canonical `AgentCommandService` + new `Transcript` table | Service now records optional `participantId`/`sessionId`; `Transcript` table added in migration `20260816120000_capability_extension`. |
| Avatar provider | `AvatarSessionAdapter` port; no provider added | `NoopAvatarSessionAdapter` is the default; a future Tavus/Bithuman/LemonSlice adapter implements the port. |

### Open action register

| Open item | Required exit evidence | Action owner | Status |
|---|---|---|---|
| Select and implement trusted identity/SSO plus tenant-membership lookup. | Signed-token/session verification, membership authorization, key rotation, revocation, and production HTTP tests. | **Platform Security Owner** | ⚠️ UNRESOLVED |
| Implement a safe outbox claim/lease dispatcher and NATS topology. | Multi-worker claim safety, bounded retry/backoff, dead-letter policy, broker acknowledgement, and delivery telemetry. | **Messaging & Reliability Owner** | ⚠️ UNRESOLVED |
| Integrate Liveblocks without creating a second workflow model. | Current SDK review, tenant-scoped rooms, reconnect/convergence, permissions, and canonical graph serialization tests. | **Realtime Collaboration Owner** | ⚠️ UNRESOLVED |
| Design WebRTC signaling, TURN, consent, retention, and regional media processing. | Browser interoperability, degraded-network, consent, privacy, and teardown evidence. | **Voice Infrastructure Owner** | ⚠️ UNRESOLVED |
| Evaluate deferred provider capabilities: outbound calling, expressive TTS, video avatars, Gemini Live Vision, and restaurant ordering. | One-at-a-time current official SDK/licensing/data-residency review, explicit consent and policy model, sandbox execution evidence, accessibility fallback, cost/latency bounds, and teardown plan. Restaurant ordering pattern is captured as a `Workflow` data file (`data/restaurant-ordering.reference.json`) so the generic pattern is provable without a special subsystem. | **Platform Integrations Owner** | ⚠️ UNRESOLVED (outbound calling, expressive TTS, video avatar providers, Gemini Live Vision); PARTIALLY RESOLVED (2026-08-16) for restaurant ordering as a pattern, not a built subsystem. |
| Implement Socket.io mobile push/sync. | Authenticated tenant rooms, reconnect/idempotency, ordering, and backpressure tests. | **Mobile Platform Owner** | ⚠️ UNRESOLVED |
| Select an LLM/planner provider. | Current official SDK review, data residency/cost decision, strict proposal parsing, timeout/cancellation, and evaluation evidence. | **Agent Runtime Owner** | PARTIALLY RESOLVED (2026-08-16): Orcflo adds a fail-closed `ModelProviderGateway` (noop/demo/external), a tenant-scoped provider registry, metered calls, and `agent` node wiring; selecting an actual external provider remains UNRESOLVED (external kinds are refused until a reviewed SDK exists). |
| Define trusted MCP integration. | Allowlist, identity, schema validation, cancellation, audit, and adversarial tool tests. | **Agent Runtime Owner** | PARTIALLY RESOLVED (2026-08-16): `McpServer` allowlist table and policy gate exist; full execution adapter is still pending a reviewed transport and current SDK verification. |
| Select external bank/ERP/purchase-order rails. | Idempotency, reconciliation, authorization handoff, compensating controls, and sandbox evidence. | **Transaction Integrations Owner** | ⚠️ UNRESOLVED |
| Implement durable scheduling and approval resumption. | Restart-safe jobs, leases, bounded retries, resumable approval records, and recovery tests. | **Workflow Runtime Owner** | PARTIALLY RESOLVED (2026-08-16): Orcflo adds the four trigger kinds (manual, schedule, webhook, event) with a deterministic cron matcher and once-per-bucket schedule drain; a durable background scheduler with leases and restart-safe jobs is still UNRESOLVED. |
| Implement deterministic branch evaluation and connect `agent` workflow nodes. | Branch coverage, persisted decisions, bounded-runtime wiring, and observable evidence. | **Workflow Runtime Owner** | RESOLVED (2026-08-16): `agent` workflow nodes execute through the canonical `BoundedAgentRuntime`; deterministic conditions/routers/bounded loops, wave-based parallel execution, and persisted decision records (`OrcfloDecisionRecord` + `GET /runs/:runId/decisions`) are implemented in the Orcflo engine. |
| Add production rate limits, secret management, retention enforcement, and audit export. | Threat model, configured limits, rotation, deletion/export evidence, and operations runbooks. | **Platform Security Owner** | ⚠️ UNRESOLVED |
| Select telemetry backend and alert thresholds. | OpenTelemetry export, error-rate/pool/latency/queue/outbox dashboards, SLOs, and alert tests. | **SRE & Observability Owner** | ⚠️ UNRESOLVED |
| Resolve three high npm audit findings through a controlled framework upgrade. | Next.js 16 compatibility plan and full build/API/browser/security regression. | **Release Engineering Owner** | ⚠️ UNRESOLVED |
| Complete browser accessibility and responsive automation. | Supported browser runner, keyboard/focus/touch/viewport checks, and captured results. | **Frontend Quality Owner** | ⚠️ UNRESOLVED |

## 4. Active multi-tool component fork status

No unresolved side-by-side implementation fork may receive features. If a new variant appears, add it here and record an explicit A/B decision in §5 first.

| Component | Fork A | Fork B / competing variant | Explicit A/B decision | Feature gate |
|---|---|---|---|---|
| Marketing home | `components/HomePage.tsx` — Ase revamp | Legacy LOG_ON AI surface | **A selected**; `/log_on` remains redirect-only. | Features may land only in Ase surfaces. |
| Visual Canvas | `components/CanvasStudio.tsx` — canonical Next.js/API canvas | Standalone Automerge/Vite sample concept | **A selected**; the sample is visual reference only and is not a product fork. | Extend `CanvasStudio` and canonical contracts only. |
| Assistant/chat | `components/ChatWidget.tsx` — branded scripted Ase panel | Provider-default Botpress bubble | **A selected**; default bubble explicitly rejected. | Provider integration must preserve A’s panel and evidence labels. |
| Voice experience | `components/VoiceStudio.tsx` — proposal preview | Legacy `/api/voice/transcribe` and `/synthesize` provider simulation | **A selected**; legacy routes fail closed with `501`. | No media feature without a verified provider and §3 exit evidence. |
| Vendor experience | `components/VendorDashboard.tsx` — labelled preview | Legacy writable sample API | **A selected**; `/api/vendors` remains illustrative/read-only and rejects writes. | Durable vendor features must use canonical ports/routes, not revive the legacy API. |
| Platform vs home pages | `PlatformOverview` (`/platform`) | `HomePage` (`/`) | **Not forks**; distinct information architecture and user intent. | Shared primitives may be extracted; page purposes remain separate. |
| Styling | `app/globals.css` base | `app/revamp.css` revamp layer | **Not forks**; ordered layers loaded by the root layout. | Avoid a third global style system. |

## 5. Decision Log

**Mandatory reading order:** read this section before trusting §§1–4 or implementation summaries. Newer entries override older assumptions. Record every reversal, fork choice, and previously open resolution here.

**Canonical ADR register:** the stable, concise ADR summaries live in [`docs/ARCHITECTURE_DECISIONS.md`](ARCHITECTURE_DECISIONS.md) (ADR-001…ADR-016). This §5 log is the dated source of truth with reasons and consequences; the ADR register is the quick-reference agents must check first. The engineering-control prompt governing how agents evolve this system is [`docs/CODE_AGENT_MASTER_PROMPT.md`](CODE_AGENT_MASTER_PROMPT.md); the development-spec index is [`docs/DEVELOPMENT_SPEC.md`](DEVELOPMENT_SPEC.md). The runtime-domain targets are captured as specifications: [`docs/EXECUTION_KERNEL_SPEC.md`](EXECUTION_KERNEL_SPEC.md) (the canonical execution substrate; reference implementation is the Orcflo engine), [`docs/WORKFLOW-ENGINE-DIRECTIVE.md`](WORKFLOW-ENGINE-DIRECTIVE.md) (workflows), [`docs/AGENT_RUNTIME_SPEC.md`](AGENT_RUNTIME_SPEC.md) (agents), [`docs/TOOL_AND_MCP_SPEC.md`](TOOL_AND_MCP_SPEC.md) (tools/MCP), [`docs/VOICE_VISION_SPEC.md`](VOICE_VISION_SPEC.md) (voice/vision).

| Date | Decision / reversal | Reason and consequence |
|---|---|---|
| 2026-08-14 | Resolved `BRAND = Ase`, `PLATFORM = VOXFLOW`; demoted LOG_ON AI to redirect alias. | Prevents identity drift and duplicate marketing forks. |
| 2026-08-14 | Reversed MongoDB direction; selected PostgreSQL 16 + Prisma as the sole durable source of truth. | Tenant relations, ACID transitions, migration governance, and outbox integrity require one relational authority. |
| 2026-08-14 | Resolved Next.js App Router as primary; Vite is reference/fallback only. | Preserves working pages, route handlers, deployment path, and one product shell. |
| 2026-08-14 | Resolved realtime boundaries: Liveblocks/CRDT, WebRTC/media, NATS/events, Socket.io/mobile sync. | Prevents overlapping transports from becoming duplicate event or collaboration systems. Implementation remains open in §3. |
| 2026-08-14 | Selected the branded `ChatWidget`; rejected a provider-default Botpress bubble. | Keeps one accessible Ase surface and avoids duplicate launchers. |
| 2026-08-14 | Replaced canvas-local timer success with canonical API save/execute and observable workflow evidence. | UI animation is not execution proof. |
| 2026-08-14 | Resolved spoofable request headers as demo-only; non-demo identity fails closed. | Prevents demo context from being mistaken for production authentication. |
| 2026-08-14 | Added one transactional outbox envelope per domain event and a shared unit-of-work boundary. | Consequential aggregate, approval, event, and delivery-intent records must commit atomically. NATS delivery is still unresolved. |
| 2026-08-14 | Resolved transaction unit-of-work implementation as serializable Prisma transactions with three bounded conflict retries; memory uses serialized snapshot rollback. | Provides deterministic commit/rollback and single-winner decisions without unbounded retries. |
| 2026-08-14 | Added optional `SHADOW_DATABASE_URL` under Prisma’s datasource config. | CI can replay migration history and diff it against the schema without resetting the application database. |
| 2026-08-14 | **Resolved PostgreSQL live-verification gate.** PostgreSQL 16.15 migrations, app-role runtime, rollback, concurrency, tenant isolation, BigInt/JSON/event/outbox, and production HTTP paths passed against a disposable cluster. | PostgreSQL behavior is no longer `UNVERIFIED`; detailed evidence is in `docs/verification/postgresql-16-2026-08-14.md`. External transports/auth remain unverified. |
| 2026-08-14 | Strengthened runtime TLS from ambiguous `sslmode=require` to CA-backed `sslmode=verify-full`. | Prisma’s Node driver rejected the original untrusted leaf (`P1011`). A CA-signed SAN certificate passed TLS 1.3 identity verification; production URLs must use a trusted CA. |
| 2026-08-14 | Normalized top-level Prisma SQL `NULL` columns to omitted optional domain fields while retaining nested JSON `null`. | Live reads exposed a Zod boundary mismatch for transaction/outbox nullable columns; the fix preserves canonical contracts and JSON meaning. |
| 2026-08-14 | Required explicit A/B governance for any component produced in competing variants. | No side-by-side fork receives features until §4 and this log choose one. |
| 2026-08-14 | Unified text and already-transcribed voice commands under proposal-only `AgentCommandService`; retained `/api/v1/voice/commands` as a compatibility adapter and rejected a second voice/agent runtime. | Intent-specific RBAC, privacy-safe atomic command events, explicit review, and correlation now precede canvas-triggered execution. Live media and external providers remain unavailable or unverified. |
| 2026-08-16 | Resolved capability-extension strategy: extend the existing `BoundedAgentRuntime`, `AgentCommandService`, and `WorkflowRunner` with additive Zod contracts and ports (transcript, structured TTS cue, MCP allowlist, avatar provider, handoff node); no second agent runtime, no second tool executor, no second unit of work. The MCP `mcp` node and the `handoff` node were added to `createDemoNodeHandlers`; both reuse the existing policy gate. Restaurant ordering is parked as a built subsystem and shipped as a `Workflow` data file in `data/restaurant-ordering.reference.json` to prove the generic transactional pattern fits the existing model. | Avoids the "second voice runtime" failure mode the audit called out. Outbound calling, video avatar providers, Gemini Live Vision, real-time media, and dynamic runtime tool generation remain `PARKED` (P4) per the audit and §3; they are not silently implemented. The existing audit at `docs/verification/agent-capability-audit-2026-08-14.md` is the source-of-truth capability map; this entry records that the platform is now contractually ready to receive provider adapters without further architectural churn. |
| 2026-08-16 | **Resolved Orcflo engine strategy: Orcflo (orchestration flow) is the run-time half of VOXFLOW.** It executes the same canonical `Workflow` contract as `OrcfloRun`, and adds a replayable run stream (`OrcfloRunEvent`), an opt-in content-hashed step cache (`configuration.cacheable === true`), metering records/summary, a fail-closed `ModelProviderGateway` (noop/demo/external; `agent` nodes resolve `configuration.modelProviderId`), the four trigger kinds (manual, schedule, webhook, event) funneling through `OrcfloEngine.startRun`, and reusable blueprints that instantiate into first-class `Workflow` rows. No second workflow model, event envelope, outbox, unit of work, or identity surface was created; Orcflo writes share the existing in-memory snapshot rollback and Prisma transaction boundaries. | Gives the platform a deterministic run-time core with observable units (stream + metering) without a second orchestration graph. Scheduling authority is the pure `lib/domain/cron.ts` matcher (UTC/fixed offsets only; DST zones rejected); the schedule drain endpoint is deterministic and fires at most once per minute bucket via `lastFiredAt`. Durable background scheduling, worker leases, resumable approval, live stream subscription, and automatic event-bus wiring remain future work. External model providers remain refused (`PROVIDER_ERROR`) until a current official SDK review exists. Evidence: `docs/verification/orcflo-engine-2026-08-16.md`. |
| 2026-08-16 | **Resolved the AGENT ⇄ WORKFLOW bridge: workflows are callable by agents, and agents are callable by workflows, through shared primitives.** `WorkflowAsToolService` registers a READY workflow as a first-class `ToolDefinition` (`wtool_<workflowId>`, `metadata.orcfloTool`) in the canonical tool registry; `WorkflowAwareToolExecutor` routes only workflow tools to `OrcfloEngine.startRun` (nested run with preserved correlation, parent execution id, and a recursion depth limit defaulting to 3 via `ASE_ORCFLO_TOOL_MAX_DEPTH`). `agent` workflow nodes execute through the canonical `BoundedAgentRuntime` (same lifecycle, policy, tool registry, budget, evidence) — never a second agent implementation — and the former direct-provider node behavior moved to a new `ai_model` node type. `ToolInvocation` now carries the caller's `ActorContext`. | Implements the two most important interop directions (§51/§52 of the workflow directive). One `BoundedAgentRuntime` is shared by direct agent runs and workflow agent nodes; one `ToolExecutor` port serves both runtimes. The canonical agent lifecycle means an agent node run transitions the agent `READY → RUNNING → COMPLETED`; reuse requires a fresh `READY` agent, and agent `WAITING_APPROVAL` fails the run (resumable approval is future work). The full WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE is captured at `docs/WORKFLOW-ENGINE-DIRECTIVE.md` with a 56-section compliance map in `docs/verification/workflow-runtime-bridge-2026-08-16.md`. |
| 2026-08-16 | **Resolved deterministic control flow in the Orcflo engine (§12–§14, §45 of the workflow directive): the engine executes graphs, not linear topo passes.** `condition` nodes evaluate dot-path comparisons in code and edges with `condition: true/false` fire on matching source output; `router` nodes select from declared routes (with `defaultRoute`) and fire only the `sourceHandle`-matching edge; `for_each` nodes iterate a `collection` with `maxItems`/`maxIterations` safety limits, loop bodies consume `input.item/index/iteration`, `loop` back edges re-enter the head, and `loopExit` edges fire when done. Graph validation now accepts cycles ONLY as bounded loops (every `loop` edge targets a `for_each` head, heads need an exit, nested loops rejected, router edges validated) — the §45 "valid bounded loop vs accidental infinite cycle" distinction. Untaken branches are recorded as `SKIPPED` steps; a global per-run `maxNodeExecutions` cap (default 1000) bounds pathological graphs. The legacy linear `WorkflowRunner` refuses loop workflows with `CONFLICT`. | Completes the "deterministic branch evaluation" open action and gives the visual automation layer real branching/routing/looping semantics with deterministic, machine-readable failures (limit violations) instead of LLM reasoning for critical decisions. Router/loop/condition nodes are engine-internal control nodes (cheap, deterministic, no retry/cache); all other nodes keep the existing handler/cache/retry machinery. Parallel execution (§47), persisted decision records, and resumable approval remain future work. Evidence: `docs/verification/orcflo-engine-2026-08-16.md` §11. |
| 2026-08-16 | **Resolved parallel execution in the Orcflo engine (§47 of the workflow directive): independent handler nodes run concurrently up to a bounded `maxConcurrency`.** Execution is wave-based — each wave is the deduped set of activations ready at the same moment; control nodes (`for_each`/`condition`/`router`) run sequentially (they mutate loop/run state) while handler nodes run concurrently through a bounded worker pool (default 4, clamped [1, 32], per-run override). Every node in a wave sees the same base context (run input + all prior waves' outputs); step/event ordering is deterministic (topological within the wave: `step.started` batch → concurrent execution → `step.completed` batch), so the run stream stays replayable and monotonic; failures are re-thrown in topological order with the failing node recorded. `maxNodeExecutions`, cost, and deadline limits are enforced in the sequential apply phase. | Gives the workflow runtime genuine parallelism with observable determinism — the §47 requirement — without a second scheduler. Merged nodes still execute once (wave dedupe); parallel branches that fail fail the run deterministically; cache hit/miss metering is unaffected. Persisted decision records and resumable approval remain future work. Evidence: `docs/verification/orcflo-engine-2026-08-16.md` §12. |
| 2026-08-16 | **Resolved run idempotency (§48 of the workflow directive): duplicate triggers and retries never create duplicate runs.** `OrcfloRun.idempotencyKey` (optional, 8–200 chars) is unique per `(tenantId, idempotencyKey)` via a partial-safe unique index (PostgreSQL NULLs distinct → keyless runs exempt); the engine replays a prior run for a duplicate key (historical runs immutable, new input ignored), conflicts on a key reused for a different workflow, validates short keys, and resolves save races by re-fetching the winner (the Prisma adapter surfaces `P2002` as `CONFLICT`). Webhook and event triggers derive keys from (trigger, payload) so duplicate deliveries dedupe automatically, with explicit override via header `Idempotency-Key` or body `idempotencyKey`; manual fires and the runs API accept explicit keys. Schedule drain was already once-per-minute-bucket. | Satisfies the §48 requirement for the trigger surfaces that exist today without a second idempotency system — one canonical key on the run aggregate, enforced by the durable store. Payments/email/external-call idempotency will reuse the same key when those adapters exist. Evidence: `docs/verification/orcflo-engine-2026-08-16.md` §13; migration `20260816230000_orcflo_run_idempotency` verified on PostgreSQL 16 (PGlite). |
| 2026-08-16 | **Resolved durable execution (§25/§32/§36/§49 of the workflow directive and EXECUTION_KERNEL_SPEC §36/§26): runs can be created PENDING and executed by an in-process worker.** `OrcfloEngine.createRun` captures the caller context (`actorId`/`role`/`environment`) and clamped execution `limits` on the run; `OrcfloEngine.executeRun` executes or resumes it (idempotent on terminal runs); `startRun` composes both for synchronous callers. `POST /api/v1/orcflo/runs?async=true` returns a PENDING run executed by the `RunDispatcher` loop. Approval is resumable: `POST /api/v1/orcflo/runs/:runId/approval` persists the decision on the run; `APPROVED` resumes from the approval node (completed work rebuilt from persisted steps, never re-executed; `run.resumed` in the stream), `REJECTED` cancels. The run stream is live via an in-process `RunEventBus` (replay + subscribe, no polling). Schedule triggers drain cross-tenant via the `ScheduleDispatcher`. | Delivers the async boundary the kernel spec called its open contract item. Single-process semantics are explicit: the worker and event bus are in-process; multi-worker claim/lease (mirroring the outbox) and a NATS-backed bus are the documented next step. Resuming inside an active `for_each` loop fails with a clear error until loop checkpoints exist. Evidence: `docs/verification/orcflo-engine-2026-08-16.md` §18; migration `20260816233000_orcflo_durable_execution` verified on PostgreSQL 16 (PGlite). |
| 2026-08-16 | **Resolved public workflow interfaces (§34 of the workflow directive): a READY workflow can be exposed to anonymous callers as a public form.** A new `public` trigger kind carries `config.slug` (`pub_…`, globally unique), `config.inputSchema` (typed fields with required/default), `rateLimitPerMinute`, `maxRunsPerDay`, `maxCostMinor`, `maxDurationMs`, and `environment`. `POST /api/v1/orcflo/interfaces/:slug/run` deliberately skips caller authentication (there is no identity to verify) and applies abuse controls before any run: deterministic Zod input validation (strict, before a rate-limit token is consumed), per-interface rate + daily caps (in-process, ephemeral — a shared limiter replaces it in multi-process production), cost/duration bounds, and idempotency (explicit or derived). Callers get a synthetic `PUBLIC` actor role that is execute-only and never a membership role; node/agent/tool policies still apply, so a public interface cannot bypass tenant gates. Slug lookup is cross-tenant (`OrcfloTriggerRepository.findPublicBySlug`; Prisma JSON path filter). | Delivers the §34 "public interface/form" flow without weakening the fail-closed identity model: the anonymous path is a deliberate, bounded exception with its own abuse controls, and the synthetic role cannot read/write tenant data or bypass approvals. Unknown/disabled slugs return `NOT_FOUND` (no existence leak). Rate limiting is explicitly ephemeral in-memory; production hardening (shared limiter keyed by IP/tenant) is future work. Evidence: `docs/verification/orcflo-engine-2026-08-16.md` §14. |

## 6. Current system boundary and implemented capabilities

VOXFLOW is a Next.js application with a canonical TypeScript/Zod domain, application services, repository ports, an explicitly ephemeral memory adapter, and a live-verified PostgreSQL/Prisma adapter. The React Flow canvas serializes to the workflow contract consumed by the server runner.

```text
React Flow canvas / text + transcript proposal / vendor UI
                          |
                    /api/v1 routes
                          |
       request context -> Zod -> intent-specific RBAC
                          |
           application services and policies
      /              /             |              \
command proposal  bounded agent  workflow runner  transaction service
   runtime               |              |
         \               |              /
 repository + unit-of-work + event/outbox + tool ports
              /                     \
 ephemeral in-memory             Prisma adapter
 snapshot rollback          serializable transactions
  demo/test adapter               PostgreSQL 16
```

There is one canonical workflow representation, event envelope, outbox envelope, persistence port set, unit-of-work boundary, and request authorization context. Adapters do not define parallel domain models.

| Area | Implemented evidence | Verification state |
|---|---|---|
| Canonical contracts | Agents, policies, tools, workflows, executions, events, transactions, approvals, outbox, and unified text/transcribed-voice commands in `lib/domain/schemas.ts`. Capability extensions (transcript, structured TTS cue, MCP server config, avatar session ref, AgentProposal union) added additively in 2026-08-16. | Unit-tested; database-backed command publication remains unverified after database teardown. The capability-extension contracts are unit-tested (`tests/capability-extensions.test.ts`) and the live PostgreSQL path is pending the regenerated Prisma client. |
| Agent command proposal | Text-first and transcript modalities use deterministic classification, intent-specific RBAC, risk/confirmation state, and privacy-safe event/outbox publication. | Service and route tests passed; memory HTTP smoke passed; proposal cannot execute. |
| Canvas command review | Text composer and accessible explicit dialog replace `window.confirm`; approved run requests preserve proposal correlation. | Static/type/build and HTTP flow verified; browser interaction remains `UNVERIFIED`. |
| PostgreSQL schema | Two migrations model tenants/RBAC, agents, tools, workflows, executions, events, transactions, approvals, and outbox. | PostgreSQL 16.15 migrations applied; history/schema diff empty. |
| Atomic transaction boundary | Transaction request/decision uses `UnitOfWork`; memory snapshot rollback; serializable Prisma transaction. | Memory and live PostgreSQL commit/rollback/concurrency tests passed. |
| Transactional outbox | Event publication persists one tenant-scoped unique pending delivery intent. | Live one-to-one event/outbox integrity passed; transport delivery not implemented. |
| Lifecycle/policy | Lifecycle table, role/tool/node/tenant/environment policies, and deterministic approval decisions. | Unit-tested. |
| Bounded autonomy | Iteration, duration, tool-call, budget, no-progress, timeout, and evidence limits. | Unit-tested; no external planner/tool provider. |
| Workflow execution | DAG validation, topological execution, bounded retry/time/cost, explicit failure/approval states, persisted results. | Unit- and production-HTTP-tested. |
| Orcflo run engine | Runs with a replayable event stream, opt-in content-hashed step cache, metering, fail-closed model gateways (`ai_model` nodes), five trigger kinds (manual, schedule, webhook, event, public), blueprint instantiation, deterministic control flow (`condition` nodes/edges, `router` nodes, bounded `for_each` loops with `loop`/`loopExit` edges and loop-aware validation; untaken branches recorded as `SKIPPED`), wave-based parallel execution (`maxConcurrency` default 4 with deterministic topological step/event ordering), run idempotency (`idempotencyKey` unique per tenant; webhook/event triggers derive keys from trigger+payload so duplicate deliveries dedupe), and public workflow interfaces (anonymous, rate-limited, input-validated public-form execution with a synthetic execute-only `PUBLIC` role). `agent` nodes execute through the canonical `BoundedAgentRuntime`, and READY workflows are registerable as first-class tools callable by agents (workflow-as-tool with recursion depth limit). Shares the canonical workflow contract, tool registry, event/outbox envelope, and unit-of-work boundary. | Unit-, route-, and live-HTTP-tested in demo/memory mode (221 tests; loop/route/branch/fan-out-merge/idempotency/public-form smoke over real HTTP); migration SQL verified on PostgreSQL 16 (PGlite WASM); Prisma adapter server path ready but `UNVERIFIED` until the next disposable-cluster run. |
| Consequential actions | Request creates approval; self-approval denied; independent approval authorizes but does not externally execute. | Unit-, concurrency-, and HTTP-tested. |
| Tenant isolation | Repository queries scope by tenant and reject identifier takeover. | Live repository and HTTP cross-tenant tests passed. |
| Demo identity | Demo headers/defaults only; non-demo fails closed. | Verified, but not production authentication. |

### Explicitly ephemeral behavior

`ASE_PERSISTENCE_MODE=memory` is process-local. The composition root reuses one instance within that process, but restart, redeploy, cold start, or serverless instance change can lose data. Responses label it `ephemeral-memory`.

Canvas node handlers execute only with `configuration.executionMode = "demo"`; evidence is marked simulated. No Whisper, email, ERP, vendor, banking, webhook, or other provider call is implied. Demo defaults are tenant `tenant_demo`, actor `actor_ada`, role `BUILDER`, environment `demo`.

## 7. Execution semantics and contracts

### Agent command proposal

1. Validate text/transcript modality and optional workflow target at the HTTP boundary.
2. Deterministically classify intent and map it to the existing permission vocabulary.
3. Reject unauthorized intent before any event write; represent an unmatched intent as a persisted rejected proposal.
4. Assign deterministic risk and confirmation requirements. `run_workflow` is consequential and `HIGH` risk.
5. Atomically publish `agent.command.proposed` or `agent.command.rejected` plus one pending outbox intent through the existing unit of work.
6. Exclude raw text and extracted entity values from event/outbox payloads.
7. Return a proposal only. No tool, agent runtime, or workflow can execute inside `propose(...)`.

Canvas approval is explicit but client-local, not a durable approval record. If approved, the UI carries the proposal correlation ID through workflow save/run and includes the command ID as structured input. Workflow policy remains authoritative and can still stop at `WAITING_APPROVAL`.

### Agent runtime

1. Load the tenant-scoped agent.
2. Enforce lifecycle, role, environment, tool assignment, permissions, availability, risk, and approval policy.
3. Enforce iteration, wall-clock, tool-call, budget, and no-progress limits; race planner/tool calls against deadlines and signal cancellation.
4. Execute only a registered tool handler and validate non-negative safe-integer cost.
5. Accumulate tool-produced evidence.
6. Accept completion only after observable evidence exists.
7. Persist state and publish correlated completion/failure events.

Critical or configured approval-gated tools return `WAITING_APPROVAL`; they are not executed.

### Workflow runner

1. Require `READY` status and execution permission.
2. Validate node/edge identities, references, self-edges, and acyclicity.
3. Persist `RUNNING` and publish the correlated start event.
4. Execute topologically with bounded retry/time/cost and cooperative abort.
5. Stop at transaction/human-approval nodes with `WAITING_APPROVAL`.
6. Require evidence before `COMPLETED`.
7. Persist explicit node results and terminal output.

### Transactions

`TransactionService.request` is idempotent by `(tenantId, idempotencyKey)`. It writes `CREATED`, `REQUESTED`, the event, and pending outbox intent in one unit of work. `decide` requires approver role and separation of duties; serializable concurrency allows one winner. Approval changes the transaction to `AUTHORIZED`; it does not send funds or create an external PO.

### HTTP and event contracts

Canonical handlers:

- `GET|POST /api/v1/workflows`
- `GET|POST /api/v1/workflows/:workflowId/executions`
- `POST /api/v1/transactions`
- `POST /api/v1/approvals/:approvalId/decision`
- `POST /api/v1/agent/commands`
- `POST /api/v1/voice/commands` — compatibility adapter for already-transcribed input

`/api/vendors` is illustrative/read-only and rejects writes. Legacy voice provider routes validate input and return `501`; they do not fabricate media evidence. External requests use strict Zod schemas and stable response envelopes without stack traces.

Domain events include schema version, tenant, actor, correlation/causation, aggregate, payload, metadata, and ISO time. Command proposals emit `agent.command.proposed` or `agent.command.rejected`; their payloads deliberately omit raw input and entity values. Outbox status remains `PENDING` until a future dispatcher records verified publication.

## 8. PostgreSQL/Prisma operations

- Schema: `prisma/schema.prisma`
- Config: `prisma.config.ts`
- Generated client: `app/generated/prisma`
- Baseline migration: `prisma/migrations/20260814121500_agent_platform_foundation/migration.sql`
- Outbox migration: `prisma/migrations/20260814170000_transactional_outbox/migration.sql`
- Runtime adapter/UoW: `lib/infrastructure/prisma-adapters.ts`
- Opt-in live tests: `tests/postgres-integration.test.ts`

Set `DATABASE_URL` and `ASE_PERSISTENCE_MODE=postgres` only after migration success and trusted tenant provisioning. Production transport must validate server identity with a trusted CA (for example `sslmode=verify-full`); do not copy disposable certificate paths or credentials from verification evidence.

The application role can use the runtime tables but cannot create schema objects, read `_prisma_migrations`, or provision tenants. The migration role owns application schema objects and provisions trusted tenants in a separate operation. Production should further separate tenant provisioning if its operating model requires an independently audited identity.

## 9. Migration deployment and rollback

### Deployment sequence

1. Provision PostgreSQL 16 with encrypted transport, least-privilege application/migration roles, backups, and PITR.
2. Put reviewed URLs in the deployment secret store; never commit credentials.
3. Back up and record a restore point.
4. Run `npm run db:validate`; use a disposable `SHADOW_DATABASE_URL` to inspect `prisma migrate diff --from-migrations ... --to-schema ...`.
5. Apply `npm run db:migrate:deploy` as the migration role.
6. Provision tenants separately.
7. Grant only required runtime DML; deny migration-table/schema-create/tenant-provision privileges.
8. Set `ASE_PERSISTENCE_MODE=postgres` only after success.
9. Exercise create/read/update, rollback, isolation, concurrency, event/outbox correlation, and production HTTP paths.
10. Monitor error rate, pool saturation, migration state, latency/failures, approval queues, and outbox age/retries.

### Rollback strategy

The baseline creates new objects, so destructive automatic down migrations are prohibited. If deployment fails before writes, roll back application code and restore the recorded backup only after operator review. If writes occurred, retain additive schema/data, roll back the application, and use a forward corrective migration. Use PITR for corruption or irreconcilable migration failure.

Migration artifacts alone are not proof. Record target, version, command output, migration-table state, smoke evidence, and teardown. The latest record is `docs/verification/postgresql-16-2026-08-14.md`.

## 10. Verification record

Validation on 14 August 2026, Node.js `20.20.2`:

| Check | Result |
|---|---|
| Disposable database | PostgreSQL 16.15 on isolated loopback port `55432`; checksums, SCRAM, TLS-only host access, WAL archiving, physical base backup, and pre-migration restore point verified. |
| Migration validation | Prisma 7.9.1 schema valid; generated DDL had 10 application tables/7 enums and no destructive statements; migration-history-to-schema diff was empty. |
| Migration deployment | Both migrations applied as `ase_migrator`; `_prisma_migrations` checksums match files; status up to date; deployed-database-to-schema diff empty. |
| Runtime least privilege | `ase_app` cannot create in `public`, insert tenants, read migration history, or connect without TLS. TLS 1.3 `TLS_AES_256_GCM_SHA384` with `verify-full` passed. |
| Live adapter integration | 4/4 passed: workflow create/read/update + isolation; max-safe-integer/JSON/event/outbox round trip; injected atomic rollback; concurrent idempotency + single-winner decision. |
| Production PostgreSQL HTTP | 19 canonical checks passed, including cross-tenant list isolation; 6 legacy fail-closed checks passed. This run preceded the command-service change. |
| Post-command memory HTTP | 22 canonical checks passed, including proposal-to-execution correlation, voice compatibility, malformed JSON, authorization denial, workflow evidence, and approval; 6 legacy fail-closed checks passed. |
| Post-command automated suite | 35 standard tests passed across 8 files; 5 opt-in PostgreSQL tests skipped after cluster teardown. The added command-publication case is ready but remains unverified live. ESLint, strict TypeScript, Prisma generate/validate, Python smoke syntax, diff whitespace, and optimized 24-route build passed. |
| Event/outbox snapshot | 11 events, 11 outbox rows, 0 missing envelopes, 0 duplicate event mappings; all pending with 0 attempts because no dispatcher exists. |
| Pool/DB snapshot | 1/100 database connections at capture; 0 deadlocks, 0 conflicts, 0 temp files. This is one-shot evidence, not a telemetry backend. |
| Execution snapshot | One completed and one waiting-approval execution; completed duration 87 ms; no failed execution state. |
| Pre-command build/static checks | ESLint, strict TypeScript, Python smoke syntax, diff whitespace, and optimized 23-route build passed after live PostgreSQL fixes. |
| Browser automation | **UNVERIFIED**: no supported browser/Playwright executable is available. HTTP rendering is not interaction/a11y proof. |
| NATS, Liveblocks, WebRTC, Socket.io, LLM, MCP, transaction rails | **UNVERIFIED / not integrated**. |

The live run found and fixed two issues before passing: an untrusted self-signed leaf was rejected by the Node driver, so verification moved to CA-backed `verify-full`; PostgreSQL `NULL` values did not match optional Zod fields, so top-level nullable columns are normalized while nested JSON nulls are preserved.

The reproducible HTTP harness is `scripts/http-smoke.py`; its base URL and expected persistence label are environment-configurable. The live integration suite is opt-in with `RUN_POSTGRES_INTEGRATION=1` and a reviewed test `DATABASE_URL`.

`npm audit --omit=dev` still reports three high production findings through Next.js/PostCSS/Sharp; npm proposes a breaking Next.js 16.3.1 upgrade. No forced upgrade was applied. The earlier `@prisma/streams-local` Node 20 engine warning did not prevent the live adapter tests, but it remains dependency metadata to revisit during the controlled framework/runtime upgrade.

## 11. Known architectural limitations

- Agent lifecycle and workflow execution state/event transitions are not yet fully migrated to the shared unit of work.
- Command proposal events use the shared unit of work, but the new path has not been rerun against live PostgreSQL after disposable-cluster teardown and remains `UNVERIFIED` there.
- Canvas command review is explicit but client-local; it is not a durable approval/resumption record. Workflow save and run are correlated separate HTTP transactions, not one atomic action.
- The outbox proves delivery intent only. No claim/lease protocol, dispatcher, broker, retry worker, dead-letter policy, or delivery telemetry exists.
- Memory mode is process-local and unsuitable for production durability.
- Orcflo runs execute synchronously inside `startRun`; durable background scheduling, worker leases, live stream subscription, automatic event-bus trigger wiring, and resumable approval records are future work.
- The Orcflo Prisma adapter layer is ready but has not been exercised against a live PostgreSQL server since the sandbox could not reach the Prisma engine CDN; migration SQL itself was verified on PostgreSQL 16 via PGlite.
- Runtime approval resumption is absent; workflow approval stops do not yet create restart-safe resumable records.
- Branch conditions are represented, but the P0 runner executes topologically without deterministic conditional-edge selection.
- The bounded agent runtime is not wired to `agent` workflow nodes and has no planner/provider.
- Tool/node handlers are in-process demo registries; external adapters are absent.
- Caller deadlines cannot forcibly terminate JavaScript work that ignores `AbortSignal`; side-effect adapters must honor cancellation and idempotency.
- Trusted authentication/membership, rate limits, distributed locking, production secrets, audit export, and retention enforcement are absent.
- Database health evidence is a verification snapshot; application error-rate, pool, latency, approval, and outbox SLO dashboards/alerts are absent.
- Demo headers remain spoofable by design and are refused outside demo mode.
- Marketing, marketplace, vendor, chat, voice, video, and avatar previews are not operational provider evidence.
- Media rooms/PTT, background audio, multi-user transcription, dynamic runtime tools, MCP execution, expressive TTS, telephony, real avatars, Gemini Live Vision, and restaurant ordering are unavailable or `UNVERIFIED`; see `docs/verification/agent-capability-audit-2026-08-14.md`.
- Three high npm audit findings remain pending a controlled framework compatibility/security upgrade.

## 12. Next improvements

1. Promote command review to a durable approval/resumption state before multi-user handoff, then extend the unit-of-work boundary to agent lifecycle and workflow execution transitions.
2. Implement and test a claim/lease outbox dispatcher before connecting NATS.
3. Implement trusted identity and tenant-membership verification; keep production fail-closed until complete.
4. Add durable approval records/resumption and deterministic conditional-edge selection.
5. Implement the remaining WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE items per the §56 compliance map: durable scheduling and approval resumption (§32/§49), router/loop persisted decision records, production shared rate limiting for public interfaces (IP/tenant-keyed), and canvas UI actions for the Orcflo surface. Deterministic branching, routing, bounded loops, parallel execution, run idempotency, and public workflow interfaces now exist in the Orcflo engine; selecting a validated external planner provider remains an Agent Runtime action.
6. Add OpenTelemetry-compatible metrics/traces, dashboards, SLOs, and alerts for the §9 monitoring set.
7. Perform the controlled Next.js 16/security upgrade and rerun database, HTTP, browser, and audit checks.
8. Add durable scheduling, rate limits, secret management, retention, and idempotent external adapters incrementally.
9. Integrate NATS, Liveblocks, WebRTC, and Socket.io only after current official SDK/configuration verification and the owned §3 exit evidence.
