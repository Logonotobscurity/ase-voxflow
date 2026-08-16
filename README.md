# Ase · VOXFLOW operational intelligence platform

A production-style Next.js App Router experience and P0 agent/workflow foundation focused on African operations. The repository intentionally distinguishes verified deterministic demo behavior from target infrastructure.

## Run the explicit demo

```bash
npm install
ASE_RUNTIME_MODE=demo ASE_PERSISTENCE_MODE=memory npm run dev
```

Open `http://localhost:3000`. Memory mode is process-local and ephemeral. API responses report it as `ephemeral-memory`.

## Routes

- `/` — responsive marketing experience with clearly labelled product previews
- `/platform` — implementation/target platform map
- `/app/canvas` — React Flow canvas backed by the canonical workflow API
- `/app/voice` — interface-only voice visualizer and scripted session simulator
- `/app/vendors` — searchable vendor-operations demo using sample records
- `/marketplace` — searchable/filterable catalogue of demo concepts and targets
- `/solutions` — illustrative industry entry points into the current canvas
- `/resources` — architecture references, demo paths and capability boundaries
- `/company` — purpose, principles and regional operating context
- `/privacy`, `/terms`, `/security` — trust and legal routes
- `/api/v1/workflows` — canonical workflow save/list API
- `/api/v1/workflows/:workflowId/executions` — bounded workflow run/list API
- `/api/v1/transactions` — idempotent transaction approval request API
- `/api/v1/approvals/:approvalId/decision` — separation-of-duties approval API
- `/api/v1/agent/commands` — canonical text/already-transcribed-voice proposal API with intent RBAC and atomic privacy-safe audit intent
- `/api/v1/voice/commands` — compatibility adapter for already-transcribed voice input; it does not accept media
- `/api/v1/orcflo/runs`, `/api/v1/orcflo/runs/:runId`, `/api/v1/orcflo/runs/:runId/stream` — Orcflo run engine: start/list runs and replay the run event stream (SSE)
- `/api/v1/orcflo/metering` — metering summary (runs, steps, cache hits/misses, model calls, tokens, duration, cost)
- `/api/v1/orcflo/models`, `/api/v1/orcflo/models/:providerId/call` — fail-closed model provider registry and deterministic demo calls
- `/api/v1/orcflo/triggers`, `/api/v1/orcflo/triggers/:triggerId/fire`, `/api/v1/orcflo/triggers/webhook/:key/fire`, `/api/v1/orcflo/triggers/schedule/drain`, `/api/v1/orcflo/triggers/event/fire` — the four trigger kinds (manual, schedule, webhook, event)
- `/api/v1/orcflo/blueprints`, `/api/v1/orcflo/blueprints/from-workflow`, `/api/v1/orcflo/blueprints/:blueprintId/instantiate` — reusable workflow templates that instantiate into first-class workflows
- `/api/vendors` — legacy read-only sample contract; writes fail closed
- `/api/voice/transcribe`, `/api/voice/synthesize` — deprecated provider stubs that return `501` and never fabricate media results

Legacy aliases: `/log_on` redirects to `/`; `/voxflow` redirects to `/platform`. Unknown routes use the current framework not-found response.

## Architecture decisions

- **Ase** is the customer-facing brand; **VOXFLOW** is the workflow platform.
- Next.js App Router is the canonical web stack.
- TypeScript/Zod domain contracts are shared by route handlers, application services, adapters and the canvas serializer.
- PostgreSQL 16 + Prisma is the selected durable source of truth; MongoDB is deprecated and absent.
- `ASE_PERSISTENCE_MODE=memory` is explicitly ephemeral. `postgres` selects the Prisma adapter. The existing schema, migrations, adapters, transactions, and pre-command HTTP paths passed disposable PostgreSQL 16.15 verification; the later command-publication path remains **UNVERIFIED on live PostgreSQL** after cluster teardown.
- Liveblocks owns the future canvas CRDT boundary, WebRTC media, NATS voice/domain events, and Socket.io mobile push/synchronisation. None is currently integrated.
- LLM planning providers, external tools, payment/ERP side effects, live media, telephony, avatars, vision, restaurant APIs, and production identity verification are not implemented. Unsupported external execution fails closed.
- Transaction, approval, event-log, and pending outbox-intent writes share one unit-of-work boundary. The Prisma implementation uses a serializable interactive transaction with bounded conflict retries and passed live PostgreSQL rollback/concurrency verification.
- Transaction approval changes an internal record to `AUTHORIZED`; it does not send funds, issue an external purchase order, or claim that a pending outbox message was delivered.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for code flows, policy boundaries, verified evidence and limitations. The implementation-aligned UX and claim audit is in [`docs/UX-AUDIT.md`](docs/UX-AUDIT.md); the agent/voice discovery and capability map is in [`docs/verification/agent-capability-audit-2026-08-14.md`](docs/verification/agent-capability-audit-2026-08-14.md).

## Persistence setup

Prisma 7 generates its client into `app/generated/prisma` (ignored and regenerated during install).

```bash
npm run db:validate
npm run db:generate
```

To select PostgreSQL:

```bash
DATABASE_URL='postgresql://...' \
ASE_RUNTIME_MODE=demo \
ASE_PERSISTENCE_MODE=postgres \
npm run dev
```

Do not use the spoofable demo identity mode in production. Migration deployment and rollback guidance is documented in `docs/ARCHITECTURE.md`.

## Quality checks

```bash
npm run validate
```

This runs ESLint, strict TypeScript, Vitest and the optimized Next.js build. As of 14 August 2026, the post-command suite passes 8 files / 35 standard tests with 5 opt-in PostgreSQL tests skipped after disposable-cluster teardown. Prisma generate/validate, lint, typecheck, Python smoke syntax, diff whitespace, and all 24 routes pass. The rebuilt production demo/memory server passes 22 canonical HTTP checks and 6 legacy fail-closed checks. With an optimized demo/memory server listening on port 3000, rerun the HTTP suite with `python3 scripts/http-smoke.py`. Prior PostgreSQL 16.15 evidence is in `docs/verification/postgresql-16-2026-08-14.md`; the new command path on live PostgreSQL and browser automation remain unverified.

## Netlify deployment

**Production demo:** [https://ase-voxflow.netlify.app](https://ase-voxflow.netlify.app)

The repository includes `netlify.toml` for Netlify’s Next.js/OpenNext runtime. The production site currently runs the explicitly ephemeral demo/memory configuration; it is not a durable production backend. Before enabling real production operations, provide trusted identity verification, provision PostgreSQL from the verified migrations, rerun the command path against PostgreSQL, configure secret management, and implement a monitored outbox dispatcher.
