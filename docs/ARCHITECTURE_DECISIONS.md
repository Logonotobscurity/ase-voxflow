# VOXFLOW — Architecture Decisions

**Status:** canonical ADR register. Read this file before writing code.
**Relation to other docs:** `docs/ARCHITECTURE.md` §5 holds the detailed, dated decision log and remains the source of truth for full context; this file is the concise, stable ADR register that future coding agents must check first so previously made decisions are not accidentally undone or re-litigated.
**Governance rule (same as ARCHITECTURE.md):** later decision-log entries override earlier prose. New ADRs are appended, never edited in place except for status updates.

---

## ADR-001 — Modular monolith before microservices

**Status:** Accepted (2026-08-16)
**Context:** The platform spans workflows, agents, tools, events, and persistence. Premature service extraction would fragment transactions, tenant isolation, and the event/outbox boundary.
**Decision:**

> VOXFLOW will evolve as a modular monolith with asynchronous execution boundaries before introducing independently deployed microservices.
>
> PostgreSQL remains the source of truth for strongly consistent workflow and configuration state. Queues/events handle asynchronous execution and external-system boundaries. The architecture should evolve through bounded contexts rather than premature infrastructure fragmentation.

**Consequences:** One canonical Next.js application, one persistence port set, one unit-of-work boundary, one event/outbox envelope. Extraction requires a demonstrated operational or domain reason (§9 of the master prompt).

---

## ADR-002 — The workflow execution engine is the canonical execution substrate

**Status:** Accepted (2026-08-16)
**Context:** Agents, voice, vision, MCP, and future interfaces all need to execute work. Without a single substrate, each surface tends to grow its own parallel execution engine.
**Decision:**

> The Workflow Execution Engine is the canonical execution substrate.
>
> Agents, voice, vision, MCP and future interfaces must ultimately invoke the same underlying execution primitives rather than creating parallel execution engines.

**Consequences:** The Orcflo engine (`lib/application/orcflo-engine.ts`) is the run-time half of VOXFLOW; `agent` nodes run through the canonical `BoundedAgentRuntime` (never a second agent implementation), and workflows are callable as tools by agents (workflow-as-tool, depth-limited). New surfaces must route through these primitives (§21, §38 of the master prompt).

---

## ADR-003 — Existing code paths have priority over greenfield implementations

**Status:** Accepted (2026-08-16)
**Context:** The repository already contains substantial, tested architecture. Rewriting it "cleanly" is the highest-risk activity on the platform.
**Decision:**

> Existing code paths have priority over greenfield implementations.
>
> New capabilities must first attempt to reuse or extend existing flows. New abstractions require architectural justification.

**Consequences:** The default development loop is RECONNAISSANCE → REUSE/EXTEND → CONSOLIDATE → REFACTOR → only then CREATE, with the reason recorded. §07–§08, §59 of the master prompt encode this behaviorally.

---

## Consolidated decision register (prior decisions, kept stable)

The full dated log with evidence is `docs/ARCHITECTURE.md` §5. The stable decisions below are carried forward here so agents do not re-litigate them:

| ADR | Decision | Status |
|---|---|---|
| ADR-004 | **Brand:** customer-facing brand is **Ase**; platform is **VOXFLOW**; `LOG_ON AI` is a redirect alias only. | Accepted 2026-08-14 |
| ADR-005 | **Persistence:** PostgreSQL 16 + Prisma is the sole durable source of truth; MongoDB is rejected. Memory mode is explicitly ephemeral (demo/test only). | Accepted 2026-08-14 |
| ADR-006 | **Web stack:** Next.js App Router is the canonical application; a separate Vite product shell is rejected. | Accepted 2026-08-14 |
| ADR-007 | **Realtime boundaries:** Liveblocks/CRDT, WebRTC/media, NATS/events, Socket.io/mobile sync — one transport per concern, no overlapping duplicate systems. None are integrated yet; integration requires current-SDK verification. | Accepted 2026-08-14 |
| ADR-008 | **Transactional outbox:** one unique `PENDING` outbox message per domain event, written atomically in the same unit of work; claim/lease dispatcher (Audit §3) ships with the outbox. NATS delivery is future work. | Accepted 2026-08-14 |
| ADR-009 | **Identity:** spoofable demo headers are demo-mode only; non-demo identity fails closed (verifier + tenant-membership reconciliation). Production SSO remains an open action. | Accepted 2026-08-14 |
| ADR-010 | **Agent commands:** text and already-transcribed voice share one proposal-only `AgentCommandService`; `/api/v1/voice/commands` is a compatibility adapter. No second voice runtime. | Accepted 2026-08-14 |
| ADR-011 | **Orcflo engine:** Orcflo is the run-time half of VOXFLOW — runs, run stream, step cache, metering, fail-closed model gateways, triggers (manual/schedule/webhook/event/public), blueprints. Shares the canonical workflow contract, tool registry, event envelope, and unit of work. | Accepted 2026-08-16 |
| ADR-012 | **AGENT ⇄ WORKFLOW bridge:** workflows are callable as tools by agents (depth-limited, correlation + parent execution id preserved); `agent` workflow nodes run through the canonical `BoundedAgentRuntime`; direct model calls live behind the `ai_model` node. | Accepted 2026-08-16 |
| ADR-013 | **Deterministic control flow:** `condition` nodes/edges, `router` nodes, and bounded `for_each` loops (`loop`/`loopExit` edges, `maxItems`/`maxIterations`) are engine-native; graph validation accepts cycles only as bounded loops; critical conditions are deterministic code, never LLM reasoning. | Accepted 2026-08-16 |
| ADR-014 | **Parallel execution:** independent nodes execute concurrently up to `maxConcurrency` (default 4) with deterministic topological step/event ordering; control nodes stay sequential. | Accepted 2026-08-16 |
| ADR-015 | **Run idempotency:** `OrcfloRun.idempotencyKey` unique per tenant; duplicate webhook/event deliveries and API retries replay the existing run; webhook/event triggers derive keys from trigger + payload. | Accepted 2026-08-16 |
| ADR-016 | **Public interfaces:** a `public` trigger kind exposes a READY workflow anonymously with input-schema validation, per-interface rate/daily/cost limits, idempotency, and a synthetic execute-only `PUBLIC` role that is never a membership role and cannot bypass tenant policy gates. | Accepted 2026-08-16 |
| ADR-018 | **Persisted decision records:** every control-node decision (condition / router / for_each) during a run is appended as a first-class, tenant-scoped `OrcfloDecisionRecord` (kind, subject, result, iteration, occurredAt), exposed via `GET /runs/:runId/decisions`, so branch coverage and "why did the run go this way" are reconstructible. | Accepted 2026-08-16 |
| ADR-017 | **Durable execution:** runs can be created PENDING and executed by an in-process worker (`createRun`/`executeRun`, `RunDispatcher`) with the caller context + limits captured on the run; approval decisions are persisted on the run and `APPROVED` resumes execution from the approval node while `REJECTED` cancels; the run stream is live via an in-process `RunEventBus`; schedule triggers drain cross-tenant via a `ScheduleDispatcher`. Single-process semantics; multi-worker claim/lease and a NATS-backed bus are future work. | Accepted 2026-08-16 |

## Standing constraints (not open for renegotiation in ordinary work)

- No external provider (LLM, voice, video, MCP transport, bank/ERP rail, NATS broker) is considered integrated until a current official SDK review and verified execution evidence exist. External model providers are refused (`PROVIDER_ERROR`) until then.
- A generated client, migration artifact, UI label, or LLM response is never evidence that an external service operated.
- Migrations are additive and idempotent; destructive automatic down-migrations are prohibited.
- Security controls live at the execution boundary; prompt instructions are never security controls.

## How to add a decision

1. Append a new `ADR-NNN` row (or full ADR block) here.
2. Add the dated entry to `docs/ARCHITECTURE.md` §5 with reason and consequence.
3. Record verification evidence in `docs/verification/`.
