# VOXFLOW — Development Specification

**Status:** consolidated index + spec summary, derived from the repository's verified documentation (`README.md`, `docs/ARCHITECTURE.md`, `docs/WORKFLOW-ENGINE-DIRECTIVE.md`, `docs/verification/`). This file says **what VOXFLOW is and what we are building**; the companion files say **how the coding agent may build it** (`docs/CODE_AGENT_MASTER_PROMPT.md`) and **why past decisions were made** (`docs/ARCHITECTURE_DECISIONS.md`).

```text
/docs
  DEVELOPMENT_SPEC.md          -> WHAT we are building
  CODE_AGENT_MASTER_PROMPT.md  -> HOW the coding agent is allowed to build it
  ARCHITECTURE_DECISIONS.md    -> WHY particular technical decisions were made
  WORKFLOW-ENGINE-DIRECTIVE.md -> Workflow runtime target (56 sections)
  AGENT_RUNTIME_SPEC.md        -> Agent runtime target (autonomous decision-makers)
  TOOL_AND_MCP_SPEC.md         -> Tool/MCP capability layer target (the "hands")
  VOICE_VISION_SPEC.md         -> Voice/vision multimodal interface target
  EXECUTION_KERNEL_SPEC.md     -> PENDING — referenced by every spec's "Depends On";
                                  not yet provided; the existing Orcflo engine and
                                  docs/verification/ are the current kernel evidence
```

---

## 1. Product identity

- **Ase** is the customer-facing brand; **VOXFLOW** is the workflow platform. `LOG_ON AI` is a legacy redirect alias only (ADR-004).
- Mission: **turn goals into executable, observable, verifiable work** — `GOAL → PLAN → ACT → OBSERVE → VERIFY → ADAPT → OUTCOME`.
- The product is an **execution system**, not a collection of "AI features" (§57 of the master prompt: GOAL, AGENT, WORKFLOW, TOOL, RUN, OUTCOME…).

## 2. What exists today (verified surface)

### Runtime model

- **Two runtimes over shared primitives** (the workflow directive's golden architecture):
  - **Agent Runtime** — `BoundedAgentRuntime`: bounded autonomy (iterations, duration, tool calls, budget, evidence), lifecycle, policy, approval pauses, deterministic planners, structured proposals.
  - **Workflow Runtime (Orcflo)** — the run-time half of VOXFLOW: `OrcfloRun`, replayable run stream, content-hashed step cache, metering, fail-closed model gateway (`ai_model` nodes), five trigger kinds (manual, schedule, webhook, event, **public**), blueprints, deterministic control flow (`condition`/`router`/`for_each`), parallel execution, run idempotency, and public interfaces.
- **The bridge (ADR-012):** agents can call workflows as tools (depth-limited, correlation + parent execution id); workflow `agent` nodes run through the canonical agent runtime; workflows and agents interoperate without recursive uncontrolled execution.

### Shared primitives

- One canonical `Workflow` contract (TypeScript/Zod) shared by the React Flow canvas API and the engine — the backend is the source of truth, the canvas is an editor (§43 of the directive).
- One `ToolDefinition` registry + one `ToolExecutor` port (workflow tools route through it); one event/outbox envelope; one unit-of-work boundary (memory snapshot rollback / Prisma serializable transactions); one identity surface (verifier + tenant membership, fail-closed outside demo).
- PostgreSQL 16 + Prisma 7 as the durable source of truth; `ASE_PERSISTENCE_MODE=memory` is explicitly ephemeral demo behavior.

### Governance & boundaries

- External providers (LLMs, voice, video, MCP transport, bank/ERP rails, NATS) are **not integrated**; unsupported external execution fails closed. External model providers are configuration placeholders only, refused with `PROVIDER_ERROR` until a current SDK review exists (standing constraints in `docs/ARCHITECTURE_DECISIONS.md`).
- Demos are deterministic and labelled simulated; a UI label or LLM response is never evidence that an external service operated.

## 3. What we are building (target)

The engineering target is organized as one directive plus three runtime-domain specifications, all converging on the canonical Execution Kernel (the Orcflo engine today):

```text
                    VOXFLOW
                       │
          ┌────────────┼────────────┐
          │            │            │
       AGENTS      WORKFLOWS      TOOLS
       Reason      Orchestrate     Act
          │            │            │
          └────────────┼────────────┘
                       │
                EXECUTION KERNEL
                       │
          ┌────────────┼────────────┐
          │            │            │
       POLICY         EVENTS      STATE
          │            │            │
          └────────────┼────────────┘
                       │
                  EXTERNAL WORLD
```

- **Workflows** (`docs/WORKFLOW-ENGINE-DIRECTIVE.md`, 56 sections) — the workflow runtime target; compliance map in `docs/verification/workflow-runtime-bridge-2026-08-16.md`.
- **Agents** (`docs/AGENT_RUNTIME_SPEC.md`) — bounded autonomous decision-makers: goals vs instructions vs constraints vs success criteria, autonomy levels, planner/action proposals, tool selection through the registry, memory divided by purpose, structured handoffs, failure classification/recovery, and termination guarantees. Agents reason; the kernel governs.
- **Tools & MCP** (`docs/TOOL_AND_MCP_SPEC.md`) — the canonical capability layer: one tool abstraction across agents/workflows/voice/vision, validated inputs/outputs, risk + permissions, provider adapters, SmartProxy-style HTTP infrastructure (protected fetch, batch, pooling, rate limits, circuit breaking, error normalization) as infrastructure rather than a second architecture, MCP through the tool registry with trust classification, dynamic tool creation through the same governance, and transactions as a stronger-than-tools abstraction.
- **Voice & Vision** (`docs/VOICE_VISION_SPEC.md`) — multimodal interfaces into the same kernel: Pipecat as the canonical voice framework (local Whisper STT adapter, deterministic voice command processor, participant-scoped transcription, barge-in, background audio), provider-agnostic TTS with the provider explicitly unresolved (Coqui XTTS prohibited), vision as structured perception (camera/screen/OCR/document), LiveKit as transport only where adopted, and privacy/retention/licensing controls.

The current-state compliance snapshot per section lives in the verification docs; the reference implementation of the kernel is the Orcflo engine (ADR-002).

- ✅ Implemented: canonical workflow model + graph validation; node executor registry; runs/history/stream; deterministic conditions, routers, bounded loops; parallel execution; run idempotency; blueprints; workflow-as-tool and agent-as-node; the four original triggers plus public interfaces; tool approval (risk levels); versioned runs pinned to definitions; analytics derived from metering/events.
- 🟡 Partial: standardized expression syntax across all node configs (§6), full run-state aliases (`PAUSED`/`TIMED_OUT`), real-time long-poll subscription behind a worker, durable scheduling with `next_run`/`failure_policy`, soft-delete lifecycle, canvas UI actions for the Orcflo surface, natural-language workflow generation.
- ⬜ Future: router/decision persisted records as a first-class entity, public-interface production rate limiting (IP/tenant-keyed shared limiter), MCP transport execution, HTTP/web-search/email/file nodes, data export, folders, collaboration ownership beyond tenant roles, E2E browser automation.

## 4. How to work here

1. Read `docs/CODE_AGENT_MASTER_PROMPT.md` — it governs how the coding agent operates (inspect first, reuse before create, never fabricate, verify before claiming).
2. Read `docs/ARCHITECTURE_DECISIONS.md` — the canonical ADR register; do not undo accepted decisions.
3. Read `docs/ARCHITECTURE.md` §5 (decision log) before relying on older prose.
4. Implement the smallest coherent change, test it, run the full validation gate (`npm run validate` + `next build`), document, and report per the master prompt's change-report format.

## 5. Sources

- `README.md` — run instructions, route map, architecture decisions in brief.
- `docs/ARCHITECTURE.md` — detailed architecture, decision log (§5), boundaries, verification records.
- `docs/WORKFLOW-ENGINE-DIRECTIVE.md` — the 56-section engineering directive (development-spec addition).
- `docs/AGENT_RUNTIME_SPEC.md` — agent runtime specification v1.0 (bounded autonomous decision-makers).
- `docs/TOOL_AND_MCP_SPEC.md` — tool & MCP specification v1.0 (canonical capability layer).
- `docs/VOICE_VISION_SPEC.md` — voice & vision specification v1.0 (multimodal interfaces).
- `docs/ARCHITECTURE_DECISIONS.md` — canonical ADR register.
- `docs/CODE_AGENT_MASTER_PROMPT.md` — engineering control prompt for the coding agent.
- `docs/verification/` — dated verification evidence (PostgreSQL, capability, Orcflo engine, workflow-runtime bridge).
- `EXECUTION_KERNEL_SPEC.md` — pending (referenced by every spec's `Depends On`; not yet provided).
