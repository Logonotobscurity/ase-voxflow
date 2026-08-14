# Agent and voice-flow capability audit — 2026-08-14

**Scope:** repository evidence and the smallest coherent command-flow improvement.  
**Evidence rule:** `IMPLEMENTED` means inspected code plus an executed test or production HTTP path; `PARTIAL` means a bounded local abstraction or labelled preview exists; `UNAVAILABLE` means no implementation was found; `UNVERIFIED` means an inaccessible external behavior was not executed.

This audit does not claim live speech, realtime media, an LLM planner, MCP, telephony, avatars, vision, or restaurant fulfillment. No external dependency was added.

## 1. Discovery before modification

### Existing bounded agent runtime

| Question | Evidence-bounded answer |
|---|---|
| Where implemented? | `lib/application/agent-runtime.ts`, composed by `lib/server/platform.ts` as `getPlatform().agents`. Canonical contracts are in `lib/domain/schemas.ts`; deterministic policy is in `lib/domain/policy.ts`. |
| Exposed interface? | `BoundedAgentRuntime.run(...)` accepts agent ID, execution ID, objective, optional structured input, actor context, and an injected planner. It returns a persisted `AgentExecution`. |
| Who calls it? | Before and after this increment, only the composition root exposes it. No canonical HTTP route or workflow-node handler invokes it. |
| Tests? | `tests/agent-runtime.test.ts` covers evidence-gated completion, rejection of evidence-free completion, no-progress termination, critical-tool approval, tenant isolation/identifier takeover, and planner timeout. |
| Persistence? | Tenant-scoped `PlatformPorts`: in-memory snapshot/rollback adapter or Prisma/PostgreSQL adapter. Tool evidence, events, and outbox intents use those ports. |
| Events? | `agent.execution.completed`, `agent.execution.approval_requested`, `agent.execution.failed`, and `tool.execution.completed`. |
| Failure modes? | Missing/wrong-tenant agent or tool, invalid planner output, illegal lifecycle state, deterministic policy denial, approval gate, tool-call/iteration/no-progress/budget/deadline exhaustion, invalid tool cost, missing evidence, persistence failure, and work that ignores cooperative cancellation. |

### Existing voice/starter flow

| Question | Evidence-bounded answer |
|---|---|
| Where implemented? | The proposal route was `app/api/v1/voice/commands/route.ts`; deterministic transcript classification is `lib/domain/voice-intent.ts`; `components/CanvasStudio.tsx` was its operational UI caller. `components/VoiceStudio.tsx` is a separate scripted visual session simulator. |
| Exposed interface? | `POST /api/v1/voice/commands` accepted `{ transcript, workflowId? }` and returned a proposal. It never accepted media. Legacy `/api/voice/transcribe` and `/api/voice/synthesize` validate input then fail closed with `501`. |
| Who calls it? | `CanvasStudio` submitted scripted transcript chips. `VoiceStudio` did not call a media or command runtime. |
| Tests? | Deterministic classification had domain tests; the route shape was covered by production HTTP smoke. There was no service-level authorization/atomicity test for command proposals. |
| Persistence? | The old route returned an in-memory proposal directly and wrote no event. Browser-applied reversible edits were local until workflow save; browser confirmation was not durable. |
| Events? | The old command proposal emitted none. A later workflow execution emitted workflow events under the execution request’s correlation context. |
| Failure modes? | Malformed input, demo identity configuration failure, broad route-level authorization, unknown intent, client/network error, browser-only confirmation, loss of correlation between proposal and execution, unavailable live media, and no durable proposal audit. |

## 2. Coherent improvement completed

The flow now has one canonical proposal service rather than a second runtime:

1. `POST /api/v1/agent/commands` accepts `{ text, modality: "TEXT" | "VOICE_TRANSCRIPT", workflowId? }`.
2. `/api/v1/voice/commands` is a compatibility adapter from `transcript` to the same service.
3. `AgentCommandService.propose(...)` validates the canonical command, deterministically classifies intent, selects intent-specific RBAC permission, and publishes exactly one correlated event/outbox intent through the existing `UnitOfWork`.
4. Raw command text and entity values are not copied into event/outbox payloads. Audit metadata contains modality, intent, confidence, risk, confirmation requirement, workflow target, input length, entity keys, and `rawTextPersisted: false`.
5. Consequential `run_workflow` proposals are `HIGH` risk and require explicit review. A proposal cannot invoke a tool or workflow and says that no action has occurred.
6. The canvas now exposes text-first command entry. Already-transcribed scripted voice input uses the same route/service.
7. `window.confirm` is removed. An accessible review dialog supports keyboard focus, Escape, backdrop/cancel, explicit approval, and a clear no-action-yet statement.
8. Approved canvas execution reuses the proposal correlation ID for canonical workflow save and run requests and includes the command ID in structured execution input.

The service and route tests cover successful text/voice proposals, correlation, unknown-intent rejection, viewer denial, malformed JSON, and event/outbox rollback. Production HTTP smoke covers the canonical and compatibility endpoints. Browser interaction remains `UNVERIFIED` because no supported browser runner is available.

## 3. Capability map

| Stage | Capability | Status | Repository evidence / boundary |
|---|---|---:|---|
| Perception | Text command input | **IMPLEMENTED** | Canonical route, service, and canvas composer; validated to 4,000 characters. |
| Perception | Already-transcribed voice command | **IMPLEMENTED** as command input | Compatibility route maps a transcript to the canonical service. This is not speech recognition. |
| Perception | Low-latency starter voice agent | **PARTIAL UI / UNAVAILABLE media** | Scripted voice surfaces exist; no microphone capture, streaming provider, session transport, or measured latency. |
| Perception | Multi-user push-to-talk | **UNAVAILABLE / UNVERIFIED** | WebRTC is an architectural target only; no rooms, signaling, TURN, or PTT arbitration. |
| Perception | Background audio | **UNAVAILABLE / UNVERIFIED** | No service worker/native background media path, consent lifecycle, or browser evidence. |
| Perception | Multi-user transcription | **UNAVAILABLE / UNVERIFIED** | No speaker diarization, streaming STT, room transcript, or retention path. |
| Perception | Video / Gemini Live Vision | **PARTIAL mock UI / UNAVAILABLE integration** | Visual previews are not camera capture or Gemini evidence; no SDK was reviewed or added in this increment. |
| Reasoning | Deterministic command intent | **IMPLEMENTED** | `classifyVoiceIntent` plus command-service risk/permission mapping. |
| Reasoning | Bounded planning loop | **IMPLEMENTED abstraction / UNVERIFIED external planner** | Runtime limits iteration, duration, tool calls, budget, and no-progress; no LLM provider is connected. |
| Reasoning | Memory | **PARTIAL** | Tenant-scoped repositories persist platform records; no conversational/vector/episodic memory subsystem exists. |
| Reasoning | Policy | **IMPLEMENTED** | Role, tool, workflow, risk, environment, and approval policies execute before consequential actions. |
| Action | Static registered tools | **PARTIAL** | Typed tool definitions and in-process handlers exist; external adapters are absent. |
| Action | Dynamic runtime tools | **UNAVAILABLE** | No runtime tool generation or untrusted schema registration. A trusted registry/allowlist design is required first. |
| Action | MCP | **PARTIAL schema / UNAVAILABLE execution** | Workflow node vocabulary can represent MCP, but no client, allowlist, identity, transport, or execution exists. |
| Action | APIs | **IMPLEMENTED internal / UNVERIFIED external** | Versioned internal APIs and canonical adapters exist; no restaurant, telephony, bank, ERP, or provider operation is claimed. |
| Action | Outbound calling | **UNAVAILABLE / UNVERIFIED** | No telephony provider, consent, number provisioning, recording policy, or call evidence. |
| Action | Restaurant ordering | **UNAVAILABLE / UNVERIFIED** | No menu/availability/payment/fulfillment adapter or merchant sandbox evidence. |
| Result | Structured output for TTS tone | **UNAVAILABLE** | Planner output is structured for runtime control, but no expressive TTS tone contract/provider exists. |
| Result | Text-only fallback | **IMPLEMENTED** | Text is now the canonical command modality and does not depend on voice/media. |
| Result | Video avatar | **PARTIAL visual concepts / UNAVAILABLE runtime** | No avatar provider, lip-sync, stream, accessibility fallback, or latency evidence. |
| Verification | Explicit human review | **IMPLEMENTED for canvas run proposal** | Consequential command opens an explicit dialog; workflow/transaction approval states remain deterministic server controls. |
| Verification | Autonomous evidence gate | **IMPLEMENTED in bounded runtime/workflow runner** | Completion requires adapter-produced evidence; LLM text alone cannot prove success. |
| Verification | Live external behavior | **UNVERIFIED** | No external provider was executed during this increment. |

## 4. Priority grounded in repository evidence

| Priority | Next coherent scope | Why |
|---|---|---|
| P0 — completed here | Unify text/transcribed-voice proposal path, preserve old endpoint, enforce intent RBAC, add atomic privacy-safe audit, explicit review, correlation, and tests. | Fixes a real caller and failure modes without creating another agent runtime. |
| P1 | Move command review into a durable command/approval state if it must survive refresh or multi-user handoff; connect approved proposals to a dedicated orchestration service rather than UI sequencing. | Current explicit dialog is safer but client-local; correlation is preserved, not durable resumption. |
| P2 | Connect `agent` workflow nodes to the bounded runtime after selecting and evaluating one planner adapter; complete workflow transition atomicity and deterministic branches. | Reuses implemented bounds/policy/evidence instead of adding a speculative runtime. |
| P3 | Implement outbox claim/lease delivery and observability before NATS; then add WebRTC/Liveblocks/Socket.io only under their assigned responsibility boundaries. | Delivery, identity, privacy, and operations evidence must precede realtime feature claims. |
| P4 | Evaluate telephony, avatar, Gemini Live Vision, expressive TTS, and restaurant APIs one at a time using current official documentation, licensing, data residency, cost, consent, and sandbox evidence. | These are external, fast-changing, consequential, and currently have no repository foundation proving support. |

## 5. Remaining failure boundaries

- Proposal publication proves an atomic local event and pending outbox intent, not broker delivery.
- The explicit canvas review is not a durable approval record and cannot resume after refresh.
- Workflow save and workflow execution are separate HTTP transactions; shared correlation improves traceability but does not make them one atomic operation.
- Reversible canvas edits are still client-local until save.
- Event payload privacy excludes raw command text and values, but the command response necessarily returns text to the requesting client; transport/logging policy must still prevent accidental request-body capture.
- Memory persistence is process-local. The new command publication path has not been rerun against PostgreSQL after the disposable verification cluster was removed and remains **UNVERIFIED on live PostgreSQL**.
- Browser focus, responsive behavior, and assistive-technology interaction remain **UNVERIFIED** without a browser runner.
