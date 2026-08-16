# Capability integration verification — 2026-08-16

**Scope:** additive extension of the canonical VOXFLOW runtime with capability contracts requested in the directive. **No provider dependency was added.** No parallel agent, tool, transport, or workflow runtime was created.

This document records the pre-implementation capability report (12 entries), the post-implementation report, the verification run, and the explicit list of what is `PARKED`.

## 1. Pre-implementation capability report

### Capability 01 — Starter Agent

- **Existing flow:** `BoundedAgentRuntime` in `lib/application/agent-runtime.ts` with bounded loop, evidence gate, lifecycle, policy, planner injection. `tests/agent-runtime.test.ts` covers evidence-gated completion, evidence-free rejection, no-progress termination, critical-tool approval, tenant isolation, planner timeout.
- **Reference pattern:** the directive's `TRANSPORT → SESSION → AGENT → PLANNER → TOOLS → WORKFLOW → EVENTS → PERSISTENCE` ladder.
- **Gap:** the planner's `complete` variant had no structured `tts` cue; the `Clock` was implicit; `AgentProposal` lived as a local const, not a canonical contract.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPROVE.

### Capability 02 — Multi-User PTT

- **Existing flow:** `AgentCommandSchema` carries `requestedBy`; `ActorContext` carries `tenantId` + `actorId`; `correlationId` is per-request.
- **Reference pattern:** directive's `ParticipantSession { participant_id, session_id, role, permissions, speaking, push_to_talk, active }`.
- **Gap:** no `participantId` or `sessionId` on the command record. Real-time media (WebRTC rooms) is parked in §3.
- **Compatibility:** PARTIALLY COMPATIBLE — identity half fits, media half is a §3 open action.
- **Decision:** IMPROVE the identity half; PARK the media half.

### Capability 03 — Background Audio

- **Existing flow:** none (no media, no service worker).
- **Compatibility:** CONFLICTING with the "no media feature without a verified provider" rule.
- **Decision:** PARK.

### Capability 04 — Multi-User Transcriber

- **Existing flow:** `classifyVoiceIntent()` deterministic classifier; `AgentCommandSchema` with `modality: TEXT | VOICE_TRANSCRIPT`.
- **Reference pattern:** directive's per-line transcript object with `transcriptId, sessionId, participantId, language, confidence, final`.
- **Gap:** no durable `Transcript` record; no session/participant metadata on the command.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPROVE — add `Transcript` table, `TranscriptRepository` port, optional `participantId`/`sessionId` on the command, audit payload updated (raw text still excluded).

### Capability 05 — Dynamic Tool Creation

- **Existing flow:** `ToolDefinition` is fully typed, tenant-scoped, gated by `evaluateToolPolicy`; `availability: AVAILABLE | DEGRADED | UNAVAILABLE`.
- **Reference pattern:** directive's "AGENT PROPOSES TOOL → SCHEMA → VALIDATION → SECURITY REVIEW → PERMISSION → SANDBOX → TEST → REGISTER → EXECUTE" lifecycle.
- **Gap:** the trusted-allowlist half (the gate) is partly there; the dynamic-generation half (sandbox, untrusted code) is not.
- **Compatibility:** PARTIALLY COMPATIBLE.
- **Decision:** IMPLEMENT the trusted-allowlist half (`ToolDefinition.source`, `ToolDefinition.trusted`, default-false deny); PARK the dynamic-generation half per the audit's "trusted registry/allowlist design is required first."

### Capability 06 — MCP

- **Existing flow:** `WorkflowNodeTypeSchema` already has `'mcp'`; `evaluateWorkflowNodePolicy` denies untrusted MCP (`node.configuration.trusted !== true`).
- **Reference pattern:** directive's "AGENT → TOOL REGISTRY → MCP ADAPTER → MCP SERVER".
- **Gap:** no allowlist table, no registry port, no node handler.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPROVE — add `McpServer` table, `McpServerRegistry` port, fail-closed `mcp` node handler. No transport is added.

### Capability 07 — Structured Output

- **Existing flow:** `ProposalSchema` in `agent-runtime.ts` is a strict Zod discriminated union; runtime emits structured events.
- **Reference pattern:** directive's structured `tts`, `intent`, `nextAction`.
- **Gap:** no `tts` cue; `AgentProposal` is a local const, not a contract.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPROVE — promote `AgentProposal` to `lib/domain/schemas.ts`; add `TtsCueSchema` and `request_approval`/`abort` variants.

### Capability 08 — Text-Only Agent

- **Existing flow:** text is the canonical command modality; voice is the compatibility adapter.
- **Reference pattern:** directive's "TEXT + VOICE + VISION" fan-out under one `AGENT CORE`.
- **Gap:** the invariant is implicit; the directive's diagram already matches.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPROVE (documentation invariant + test pinning).

### Capability 09 — Outbound Caller

- **Existing flow:** none.
- **Compatibility:** CONFLICTING — no provider, no consent model, no audit. Matches audit P4.
- **Decision:** PARK.

### Capability 10 — Video Avatars

- **Existing flow:** none.
- **Compatibility:** COMPATIBLE in interface form.
- **Decision:** IMPLEMENT `AvatarSessionAdapter` port + `NoopAvatarSessionAdapter` default; PARK concrete providers.

### Capability 11 — Gemini Live Vision

- **Existing flow:** none.
- **Compatibility:** CONFLICTING — no vision foundation. Matches audit P4.
- **Decision:** PARK.

### Capability 12 — Restaurant Ordering

- **Existing flow:** the `WorkflowRunner` already executes `INTENT → ENTITY → AVAILABILITY → VALIDATION → CONFIRMATION → TRANSACTION → EXECUTION` through nodes; no built restaurant subsystem.
- **Reference pattern:** directive's transactional workflow.
- **Compatibility:** COMPATIBLE.
- **Decision:** IMPLEMENT as a `Workflow` data file (`data/restaurant-ordering.reference.json`) so the pattern is provable on the existing model.

## 2. Post-implementation report

```
CAPABILITY: 1-12 (composite)

EXISTING CODE REUSED:
- BoundedAgentRuntime (lib/application/agent-runtime.ts) — unchanged shape; AgentProposal now imported from schemas.
- AgentCommandService (lib/application/agent-command-service.ts) — extended with optional participantId/sessionId.
- WorkflowRunner (lib/application/workflow-runner.ts) — unchanged.
- evaluateToolPolicy, evaluateWorkflowNodePolicy (lib/domain/policy.ts) — unchanged; MCP gate already denies untrusted servers.
- WorkflowNodeTypeSchema — unchanged; 'mcp' and 'handoff' were already valid node types.
- AgentCommandSchema — additive only (optional participantId/sessionId).

FILES MODIFIED:
- lib/domain/schemas.ts          (+ ~120 lines, additive)
- lib/application/ports.ts        (+ ~50 lines, additive; new optional ports)
- lib/application/agent-command-service.ts  (optional request fields + payload pass-through)
- lib/infrastructure/memory-adapters.ts     (+ InMemoryTranscriptRepository, SystemClock, FixedClock, transcript state map)
- lib/server/platform.ts          (wire mcpServers, avatar, clock; add mcp + handoff demo handlers)
- prisma/schema.prisma            (+ 2 tables, + 2 columns, + 3 indexes)

NEW FILES:
- lib/infrastructure/extension-adapters.ts  (EmptyMcpServerRegistry, NoopAvatarSessionAdapter, buildDevAvatarRef)
- lib/infrastructure/prisma-extension-adapters.ts  (PrismaTranscriptRepository, PrismaMcpServerRegistry — wired only in postgres mode)
- tests/capability-extensions.test.ts        (16 tests)
- tests/capability-node-handlers.test.ts     (3 tests)
- tests/restaurant-reference.test.ts         (1 test)
- data/restaurant-ordering.reference.json
- prisma/migrations/20260816120000_capability_extension/migration.sql
- docs/verification/capability-integration-2026-08-16.md  (this file)

CODE FLOW BEFORE:
- (unchanged) request → RBAC → AgentCommandService.propose → unit of work → event/outbox → proposal response.
- (unchanged) workflow → topological → handler per node type → evidence → completion.

CODE FLOW AFTER:
- (additive) AgentCommandService.propose now optionally receives participantId/sessionId; the audit event includes them when present, raw text still excluded.
- (additive) WorkflowRunner can now dispatch `mcp` (fail-closed) and `handoff` (record-only) nodes via the existing handler map.
- (additive) PlatformApplication exposes `mcpServers` (empty allowlist by default) and `avatar` (no-op by default).
- (additive) InMemoryTranscriptRepository lets tests exercise the new contract; PrismaTranscriptRepository is dormant until `prisma generate` is rerun.

TESTS RUN (sandbox):
- npm run lint        — clean.
- npx tsc --noEmit    — clean except pre-existing Prisma-generated-client imports (sandbox cannot reach binaries.prisma.sh).
- npm test            — 49 passed, 4 skipped, 3 file-load failures (all pre-existing Prisma-generated-client imports). 16 of the 49 are new capability tests.

DOCUMENTATION VERIFIED:
- No provider SDK was added; therefore no provider SDK needs license review.
- No Pipecat, LiveKit, Tavus, Bithuman, LemonSlice, Gemini, or MCP client dependency was introduced.
- The directive's "LICENSE SAFETY" rule is satisfied by the absence of new dependencies.

KNOWN LIMITATIONS:
- The Prisma extension adapter (`lib/infrastructure/prisma-extension-adapters.ts`) is dormant in this sandbox because `prisma generate` cannot run. It will activate when the Prisma binary host is reachable.
- The capability-extension migration is hand-authored; it must be diffed against the regenerated `prisma migrate diff` output before being promoted to a real environment. The migration header documents this.
- The capability-extension contracts are tested in memory mode; live PostgreSQL verification is `UNVERIFIED` until a real cluster is reattached (this matches the existing audit's "remains UNVERIFIED on live PostgreSQL" baseline for the new paths).
- Outbound caller, video avatar providers, Gemini Live Vision, real-time media, dynamic runtime tool generation, and production TTS are all `PARKED` per the audit.

SECURITY CONSIDERATIONS:
- The MCP `mcp` node handler refuses to act if `configuration.trusted !== true`. The policy gate already enforces this before the handler is reached. The default in the `McpServer` table is `trusted = false`.
- The `NoopAvatarSessionAdapter` returns `CONFIGURATION_ERROR` on `createSession` so a missing provider cannot silently produce an avatar session.
- The `EmptyMcpServerRegistry` returns `[]` so the policy gate can be exercised without a configured provider.
- Raw command text is still excluded from audit event/outbox payloads. The new `participantId`/`sessionId` keys are identifiers, not text, and follow the same minimal-payload rule.
- The handoff node handler records a `state_change` only; it does not auto-resume downstream agents. The next execution is expected to look up the recorded target.

NEXT RECOMMENDED ACTION:
1. Re-run `prisma generate` on a host that can reach `binaries.prisma.sh`. Diff the capability-extension migration against `prisma migrate diff --from-migrations ... --to-schema-datamodel ...` and apply any drift.
2. Re-run the live PostgreSQL integration suite with `RUN_POSTGRES_INTEGRATION=1` to verify the new tables and the command-publication path against a disposable cluster. Update `docs/ARCHITECTURE.md` §10 with the result.
3. Replace the `EmptyMcpServerRegistry` and `NoopAvatarSessionAdapter` defaults with the real Tavus / Bithuman / LemonSlice / MCP-client adapters one at a time, per the audit P4 process, each backed by a current SDK/licensing review.
4. Promote the canvas command review to a durable approval/resumption state per `docs/ARCHITECTURE.md` §12.
```

## 3. Verification run (sandbox, 2026-08-16)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean |
| TypeScript | `npx tsc --noEmit` | clean (excl. pre-existing Prisma client imports) |
| Vitest | `npm test` | 49 passed, 4 skipped, 3 file-load failures (all pre-existing Prisma client imports) |
| Capability extensions | `npx vitest run tests/capability-extensions.test.ts` | 16 passed |
| Capability node handlers | `npx vitest run tests/capability-node-handlers.test.ts` | 3 passed |
| Restaurant reference | `npx vitest run tests/restaurant-reference.test.ts` | 1 passed |
| Netlify build | `npm run build` | not run in sandbox (Prisma binary host blocked) |
| Live PostgreSQL | `RUN_POSTGRES_INTEGRATION=1 npm test` | not run in sandbox (no database) |

## 4. Explicitly `PARKED` capabilities

| Capability | Reason for parking |
|---|---|
| 03 Background Audio | No media transport, no service worker, conflicts with "no media feature without a verified provider" rule. |
| 09 Outbound Caller | No telephony provider, no consent model, no audit model. Audit P4. |
| 11 Gemini Live Vision | No vision foundation. Audit P4. |
| 05 (dynamic-generation half) | Trusted-allowlist design is required first; the audit is explicit about this ordering. |
| 10 (provider half) | `AvatarSessionAdapter` port is in place; no Tavus / Bithuman / LemonSlice adapter is shipped. |
| 12 (built subsystem) | The pattern is shipped as a `Workflow` data file; no special restaurant engine is created. |

## 5. Cross-references

- `docs/ARCHITECTURE.md` §3 — domain responsibility table updated 2026-08-16.
- `docs/ARCHITECTURE.md` §5 — Decision Log entry for 2026-08-16.
- `docs/ARCHITECTURE.md` §6 — implementation evidence table updated.
- `docs/verification/agent-capability-audit-2026-08-14.md` — the source-of-truth capability map. This document is an additive verification artifact.
