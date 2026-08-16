# Solution-architect audit — 2026-08-16

**Scope:** the state of the platform on commit `32e956d` (after the
identity, outbox-dispatcher, and dispatcher-wiring commits) against
the architecture document, the capability audit, and the audit
findings recorded in this session.

**Audit stance:** the bounded runtime, the canonical contracts, and
the agent/command/workflow separation are sound. The platform's
biggest risks are at the trust boundary (identity), the durability
boundary (outbox), the marketing/reality boundary (labelling), and
the tooling boundary (npm audit, generated client).

This file is the **report** — the **remediation commits** are the
ones referenced in §1.

## 1. Findings and remediations

| # | Finding | Severity | Remediation commit |
|---|---|---|---|
| 1 | Demo identity was the only auth path; production deploys would 500 | CRITICAL | `220fe49` — real `IdentityVerifier` + `TenantMembershipRepository` |
| 2 | Outbox dispatcher did not exist; PENDING rows sat forever | HIGH | `1ba7004` — claim/lease with bounded retry and dead-letter |
| 2b | Even after `1ba7004`, the dispatcher was not wired into `getPlatform()`; production deploys would still ignore the dispatcher | HIGH | `32e956d` — instantiated `OutboxDispatcher` in the composition root with opt-in loop control |
| 3 | `app/generated/prisma/` gitignored + `postinstall: prisma generate` made `npm ci` depend on `binaries.prisma.sh` | MEDIUM | (in this commit) — added `prebuild`, removed `postinstall`; deleted dormant `prisma-extension-adapters.ts` |
| 4 | The word "evidence" was used for in-process `state_change` records that are not external verification | MEDIUM | (in this commit) — renamed `state_change` to `internal_trace`; `external_reference` is now the only kind that earns the word "evidence" in any audit context |
| 4b | The `state_change` rename missed 4 test-file occurrences; the test runtime passed (vitest does not run tsc) but the typecheck rejected them | MEDIUM | `32e956d` — updated 4 occurrences across 2 test files |
| 5 | Three high npm audit findings had no documented plan | MEDIUM | `docs/security/accepted-risks.md` — accepted in writing with mitigation evidence and review date |
| 6 | Marketing copy and audit findings could disagree | LOW | the marketing site already used "Preview" and "Scripted"; verified, no further action |
| 7 | `.env.example` did not document the new env vars introduced in `220fe49` and `1ba7004` (production deploys would not know about `ASE_PROD_BEARER_TOKEN` or the outbox tunables) | MEDIUM | (in this commit) — `.env.example` rewritten with all current env vars, defaults, and the audit/§3 cross-reference |
| 8 | `BearerTokenIdentityVerifier` did not refuse to verify in demo mode; a misconfigured production deploy that still had `ASE_RUNTIME_MODE=demo` would silently fall back to the spoofable-header path | MEDIUM | (in this commit) — symmetric runtime-mode guard added; +1 test |

Items 1 and 2 are closed by their own commits and verified in their
test suites. Items 3, 4, 5, 6 are addressed in this commit and the
documents it adds.

## 2. Open items the audit did NOT close

These remain `PARKED` in `docs/ARCHITECTURE.md` §3 and are not in
scope for this audit:

- Trusted SSO/identity (Platform Security Owner)
- NATS broker connection and live outbox dispatch (Messaging Owner)
- Liveblocks, WebRTC, Socket.io (Realtime Collaboration / Voice
  Infrastructure / Mobile Platform Owners)
- LLM planner provider (Agent Runtime Owner)
- External bank/ERP/PO rails (Transaction Integrations Owner)
- Durable scheduling and approval resumption (Workflow Runtime Owner)
- Three high npm audit findings (Release Engineering Owner)

These are documented, owned, and not silently implemented.

## 3. What the audit changed in this repository

### 3.1 Closed by code

- **Identity boundary.** `lib/server/request-context.ts` is now async
  and routes every request through an `IdentityVerifier`. The demo
  verifier is active only in `ASE_RUNTIME_MODE=demo`. A new bearer
  verifier is the only path for staging/production, and the platform
  refuses to boot without `ASE_PROD_BEARER_TOKEN` in those modes.
  Every verified identity is reconciled against a
  `TenantMembershipRepository` before any business code runs.
  13 new tests in `tests/identity-layer.test.ts`.

- **Outbox dispatcher.** `lib/application/outbox-dispatcher.ts`
  implements atomic claim (`FOR UPDATE SKIP LOCKED` on Prisma,
  serial-claim on the in-memory adapter), lease TTL, exponential
  backoff, max-attempts dead-letter, and a publisher-timeout
  AbortController. The schema enum gains `CLAIMED` and
  `DEAD_LETTERED` (additive). Migration
  `20260816130000_outbox_claim_lease` is idempotent. 9 new tests in
  `tests/outbox-dispatcher.test.ts`.

### 3.2 Closed by renaming

- **Evidence vocabulary.** `ExecutionEvidence.type` gains a clearer
  discriminator: `tool_result` and `external_reference` are the only
  kinds that count as evidence in the audit sense; `state_change` is
  renamed to `internal_trace` so the in-process simulated flows can
  no longer be confused with verified external state.

### 3.3 Closed by tooling

- **`npm ci` no longer requires `binaries.prisma.sh`.** The
  `postinstall: "prisma generate"` step is removed; a new
  `prebuild: "prisma generate"` runs only on `next build` and is
  the deploy hook. CI that needs the generated client (Netlify, a
  developer's `npm run build`) generates it explicitly; CI that
  doesn't (lint-only jobs, ad-hoc review) does not pay the cost.

- **Dormant file removed.** `lib/infrastructure/prisma-extension-adapters.ts`
  was a forward-looking artifact that imported the generated client
  and would have blocked any host that ran `prisma generate` then
  `next build`. The contracts it depended on are still in
  `lib/application/ports.ts`; the Prisma implementations will be
  written once the Prisma binary host is reachable in the team's
  CI, not pre-emptively as a dormant import.

### 3.4 Closed by documentation

- `docs/security/accepted-risks.md` records the three high npm audit
  findings, the affected CVEs, the mitigated attack surface, and the
  quarterly review date.
- This file (`docs/audit/2026-08-16-solution-architect-audit.md`)
  records the audit itself.
- `docs/ARCHITECTURE.md` §3 open action register and §5 Decision Log
  are unchanged in this commit; the new decision-log entries for
  2026-08-16 will be added by the next commit if the user wants a
  single reviewable decision-log update.

## 4. Verification

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | clean |
| TypeScript | `npx tsc --noEmit` | clean (excl. pre-existing Prisma binary network error) |
| Vitest | `npm test` | 72 passed, 4 skipped, 3 file-load failures (all pre-existing Prisma client imports) |
| Identity layer | `tests/identity-layer.test.ts` | 13 passed |
| Outbox dispatcher | `tests/outbox-dispatcher.test.ts` | 9 passed |
| Capability extensions | `tests/capability-extensions.test.ts` | 16 passed |
| Capability node handlers | `tests/capability-node-handlers.test.ts` | 3 passed |
| Restaurant reference | `tests/restaurant-reference.test.ts` | 1 passed |

Baseline before this session: 30 passed, 4 skipped, 3 file-load
failures (identical Prisma errors).

## 5. The single highest-leverage change

This session's most important commit is the **identity boundary**
(`220fe49`). The outbox dispatcher (`1ba7004`) is the second-most
important. Both are designed to be **additive and minimal**:

- No new provider dependency was added.
- No parallel runtime, tool executor, or transport was created.
- The canonical contracts in `lib/domain/schemas.ts` were extended
  in place; existing consumers compile and pass.

This matches the directive the user pasted earlier:
"IMPROVE THE EXISTING CODE FLOW BEFORE CREATING A NEW FLOW."
