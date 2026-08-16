# Accepted security risks — 2026-08-16

**Scope:** risks the platform has consciously chosen to accept
without immediate remediation, with the rationale, mitigated
attack surface, monitoring, and review date for each.

**Owner of this document:** Platform Security Owner (see
`docs/ARCHITECTURE.md` §3). Updates require a decision-log entry
in §5.

**Review cadence:** quarterly. The next review is **2026-11-16**.

## Accepted risks

### AR-001 — Three high npm audit findings in production dependencies

- **Source:** `npm audit --omit=dev` on `package.json` as of 2026-08-14,
  recorded in `docs/ARCHITECTURE.md` §10.
- **Affected packages (high-level):** Next.js 15, PostCSS,
  Sharp — the chain is through the build pipeline, not through
  application code. npm proposes a breaking Next.js 16.3.1 upgrade.
- **Decision:** **ACCEPT** in writing. The upgrade is tracked in
  §3 under the **Release Engineering Owner**, with the constraint
  that the upgrade must include a full build, API, browser, and
  security regression before promotion. No forced upgrade in this
  cycle.
- **Mitigated attack surface:**
  - The audit findings are in transitive build dependencies, not
    request handlers. Direct user input does not reach the
    vulnerable paths in the current production build.
  - The platform's HTTP boundary uses strict Zod parsing at the
    handler, the JSON parser is `request.json()` (Next.js), and
    raw request bodies are not passed through the affected
    serializers.
  - The capability-extension commit did not add any new dependency.
- **Monitoring:**
  - `npm audit` runs in CI on every PR.
  - Netlify deploys are preview-only; the affected paths are not
    exercised by the production demo unless an attacker controls
    the build artifact.
- **Review:** 2026-11-16. Trigger: if a CVE is published against
  any of the three packages with a CVSS >= 7.0, escalate and
  reconsider this acceptance.
- **Compensating controls to add in the next 90 days:**
  - Pin the affected paths out of the production build if a CVE
    with CVSS >= 7.0 is published.
  - Add a Netlify build hook that refuses deploys on a `npm audit`
    high finding.

### AR-002 — Demo identity path is still active in `demo` mode

- **Source:** `lib/server/request-context.ts`. The demo verifier
  reads spoofable headers; it is the only verifier active in
  `ASE_RUNTIME_MODE=demo`.
- **Decision:** **ACCEPT** in writing, scoped to `demo` mode only.
  Production deploys must set `ASE_RUNTIME_MODE` to
  `production`/`staging`/`development` and provide
  `ASE_PROD_BEARER_TOKEN`. The platform refuses to boot without it.
- **Mitigated attack surface:**
  - The demo verifier is fail-closed against non-demo runtime
    modes: it throws `CONFIGURATION_ERROR` if it is asked to
    verify outside demo mode.
  - The bearer verifier compares against a constant-time check on
    a secret of at least 16 characters, set in the deployment
    secret store.
  - Every verified identity is reconciled against
    `TenantMembershipRepository`. A missing membership is
    `AUTHENTICATION_REQUIRED`; a role mismatch is
    `AUTHORIZATION_DENIED`.
- **Monitoring:**
  - Netlify deploys that do not set `ASE_PROD_BEARER_TOKEN` fail
    to boot and surface in the deploy log.
  - Demo mode responses carry `persistence: 'ephemeral-memory'`
    in the response envelope; production mode must not return
    this label.
- **Review:** when the Platform Security Owner delivers trusted
  SSO/identity (the §3 P0 item), this acceptance moves to
  "DEPRECATED" and is removed once the SSO verifier ships.

### AR-003 — Outbox dispatcher default is `NoopOutboxPublisher`

- **Source:** `lib/application/outbox-dispatcher.ts`. The default
  publisher records the would-have-been dispatch and returns
  success; no broker is connected in this increment.
- **Decision:** **ACCEPT** for the demo / unit-test path.
  Production deploys that select `ASE_PERSISTENCE_MODE=postgres`
  will continue to use the noop publisher until a real NATS
  publisher is wired in `getPlatform()`.
- **Mitigated attack surface:**
  - The outbox table is still written; `PENDING` rows are still
    created with deterministic UUIDs. An operator can observe
    them in the outbox view and dispatch them manually if needed.
  - The dispatcher never drops events: claim/lease and
    dead-letter are deterministic.
  - The noop publisher is a *function*, not a global; a future
    change in `getPlatform()` swaps it without touching business
    code.
- **Monitoring:**
  - The summary emitted by `summarizeOutcomes` is ready to feed
    an OpenTelemetry exporter; until one is wired, the
    `OutboxDispatcher.tick` returns are logged at the application
    layer.
- **Review:** when the NATS publisher is wired, this acceptance
  moves to "RESOLVED".

### AR-004 — Prisma generated client is not committed

- **Source:** `.gitignore` includes `app/generated/prisma/`. The
  `postinstall: "prisma generate"` step has been removed; a
  `prebuild: "prisma generate"` step runs on `next build`.
- **Decision:** **ACCEPT** in writing. The trade-off documented
  in the audit was: commit the generated client (reviewable in
  PRs, no install-time network) vs. generate on every build
  (always current, requires network). The audit's recommendation
  was to commit. This decision defers the recommendation because:
  - Netlify's CI builds the project, and `prisma generate` is the
    deploy hook; a developer without Prisma binary access can
    still run `npm run lint` and `npm test`.
  - The team's current local CI cannot reach `binaries.prisma.sh`
    in the sandbox; committing would require an out-of-band step
    on a developer machine.
- **Mitigated attack surface:**
  - The generated client is regenerated by `prisma generate` in
    the same step that reads `prisma/schema.prisma`; a drift
    between schema and client fails the build with a type error.
  - The `prebuild` step runs before `next build`, so a missing
    client fails fast with a clear error.
- **Review:** 2026-11-16. Trigger: when the team's CI gains
  reliable Prisma binary access, re-evaluate and either commit
  the generated client or move to a separate "schema-only"
  deploy hook that publishes the generated client to a private
  registry.

## Risks NOT in this document

- Production identity verification (SSO/OIDC) is the §3 P0 item;
  it is **not** an accepted risk, it is **open**.
- Live media (WebRTC/Liveblocks/Socket.io) is **parked**, not
  accepted; the platform does not claim those capabilities.
- LLM planner provider is **open**; the bounded runtime is
  provider-agnostic.
- Outbound calling, video avatars, Gemini Live Vision are
  **parked** per the capability audit and §3.
