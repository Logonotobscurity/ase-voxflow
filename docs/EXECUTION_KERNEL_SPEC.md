# VOXFLOW — EXECUTION KERNEL SPECIFICATION

Version: 1.0
Status: Foundational
Depends On:
- DEVELOPMENT_SPEC.md
- CODE_AGENT_MASTER_PROMPT.md
- ARCHITECTURE_DECISIONS.md
- WORKFLOW-ENGINE-DIRECTIVE.md

Purpose:
Define the canonical execution substrate through which agents, workflows, tools, voice, vision and every future interface execute governed work — and the contract every execution must satisfy.

Reference implementation:
The Orcflo engine (`lib/application/orcflo-engine.ts` and `lib/domain/orcflo.ts`) is the current kernel reference implementation (ADR-002). This specification is the contract; the engine is its first verified realization. Where this spec describes a boundary that the reference implementation does not yet cover (durable asynchronous execution, resumable approval), that gap is stated explicitly and must not be silently claimed as implemented.

---

# 01. PURPOSE

The Execution Kernel is the governed execution substrate of VOXFLOW.

It is not an agent.

It is not a workflow.

It is not a tool.

It is the layer that determines:

```text
WHETHER an action may happen
```

and:

```text
HOW it may happen
```

while agents, workflows, voice, vision and tools supply:

```text
WHAT should happen
```

Core relationship:

```text
AGENTS
→ reason and decide
```

```text
WORKFLOWS
→ orchestrate
```

```text
TOOLS
→ act
```

```text
EXECUTION KERNEL
→ governs, bounds, persists and observes
```

The kernel is the final execution authority.

# 02. CANONICAL KERNEL PRINCIPLE

There is exactly one execution kernel.

Agents, workflows, voice commands, vision-triggered actions, scheduled jobs, webhooks, public forms and future interfaces must all converge on the same execution primitives.

```text
AGENT / WORKFLOW / VOICE / VISION / API
                 │
                 ▼
          EXECUTION KERNEL
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
  POLICY      EVENTS       STATE
     │           │           │
     └───────────┼───────────┘
                 ▼
          EXTERNAL WORLD
```

No second execution engine may be created for any surface (ADR-002).

# 03. KERNEL CONTRACT

The kernel guarantees, for every execution:

```text
[ ] governed — policy and authority are checked before any step runs
[ ] bounded — duration, cost and node-execution caps are enforced
[ ] deterministic — identical inputs and graphs produce identical observable behavior
[ ] persisted — every run and step result is durably recorded
[ ] observable — a replayable event stream and metering records explain what happened
[ ] validated — inputs, graphs and tool results pass schema validation
[ ] idempotent — duplicate triggers never create duplicate runs
[ ] fail-closed — unsupported or unverified execution is refused, never simulated as real
```

# 04. EXECUTION PRIMITIVES

The kernel operates on a small set of canonical primitives:

```text
Run          — one execution of one workflow version
Step         — one node execution within a run
Run Event    — one append-only observation in the run stream
Cache Entry  — one content-hashed reusable step output
Meter Record — one measured unit of work
```

Every surface (agent, workflow, voice, vision, trigger) ultimately produces Runs and Steps through the same primitives.

# 05. KERNEL BOUNDARY

The kernel owns:

```text
graph validation
execution traversal
policy enforcement
bounds enforcement
step caching
metering
run stream
domain events
run persistence
idempotency
```

The kernel does not own:

```text
business identity (workflows, agents, tools are registry data it consumes)
model reasoning (planners/providers are callers or injected adapters)
vendor business logic (provider adapters live outside the kernel)
realtime media transport (voice/vision transport is an interface, not kernel logic)
```

# 06. RUN MODEL

A workflow definition, a workflow version and a run are separate entities.

```text
Workflow
 ├── Version 1
 ├── Version 2
 └── Version 3
        │
        ▼
      Run
        │
   ┌────┼─────┐
   ▼    ▼     ▼
 Step Step   Step
```

Rules:

```text
Historical runs are immutable — editing a workflow never mutates a past run.
Every run references the exact workflow version executed.
```

The run input is a JSON object; the run output is a structured JSON result.

# 07. RUN LIFECYCLE

Canonical run states:

```text
PENDING
RUNNING
WAITING_APPROVAL
COMPLETED
FAILED
CANCELLED
```

Reserved future states (the exact representation remains authoritative):

```text
PAUSED
WAITING
TIMED_OUT
```

Terminal states are immutable: a COMPLETED or FAILED run is never rewritten.

# 08. STEP MODEL

A step records one node execution:

```text
nodeId
status       — RUNNING / WAITING_APPROVAL / CACHED / COMPLETED / FAILED / SKIPPED
attempt
startedAt / completedAt
cacheKey?    — content hash when the node is cacheable
cacheHit
output
costMinor
evidenceCount
modelCalls
error?       — code / message / retryable
```

Untaken branches are recorded as SKIPPED so run history shows the full graph, not only the executed path.

# 09. NODE EXECUTOR CONTRACT

Executable nodes converge on one handler contract:

```ts
type WorkflowNodeHandler = (
  node: WorkflowNode,
  input: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<{ output; evidence; costMinor? }> | { output; evidence; costMinor? };
```

A registry maps node types to handlers. Adding a node type must not require rewriting the traversal — the registry is the extension point.

If a future surface needs a different executor shape, it must adapt to this contract; the kernel does not grow a second executor abstraction.

# 10. CONTROL NODES

Control nodes are kernel-native, deterministic and cheap. They never invoke an LLM.

```text
condition  — evaluate a dot-path comparison (path, op, value) in code
router     — select one declared route (pickPath, defaultRoute) and fire only the matching edge
for_each   — iterate a collection with maxItems / maxIterations safety limits
```

Critical business conditions are deterministic code, never unconstrained model reasoning (directive §12).

# 11. EXECUTION CONTEXT

Each step receives an explicit, deterministic context:

```text
run input
+ outputs of all prior completed steps
+ loop item fields (item / index / iteration) when inside a for_each body
```

Context is:

```text
deterministic
inspectable
validated
scoped
serializable
```

No hidden mutation: node outputs become downstream inputs by explicit merge under the completed node id.

# 12. GRAPH VALIDATION

Before any run starts, the graph is validated:

```text
unique node and edge ids
known edge endpoints
no self edges
no accidental cycles
bounded loops only — every `loop` edge targets a `for_each` head
every loop head has a `loopExit` edge
no nested loops
router edges carry a declared sourceHandle
```

The kernel distinguishes a valid bounded loop from an accidental infinite cycle (directive §45).

# 13. CONCURRENCY

Independent nodes execute concurrently up to a bounded limit.

```text
wave           — the deduped set of activations ready at the same moment
maxConcurrency — default 4, clamped [1, 32], per-run override
control nodes  — always sequential (they mutate loop/run state)
handler nodes  — concurrent through a bounded worker pool
```

Parallelism never changes the observable run:

```text
every node in a wave sees the same base context
step/event ordering is deterministic (topological within the wave)
the run stream stays replayable and monotonic
```

A merged node executes exactly once per wave.

# 14. DURATION AND COST BOUNDS

Every run is bounded:

```text
maxDurationMs       — wall-clock deadline (clamped)
maxCostMinor        — cumulative step-cost budget
maxNodeExecutions   — global node-execution cap (default 1000), including loop iterations
```

A run exceeding a bound transitions to FAILED with a machine-readable reason (§40 of the directive).

# 15. IDEMPOTENCY

A run may carry an idempotency key, unique per tenant.

```text
duplicate key  → replay the existing run as-is (historical runs are immutable)
key reuse      → the new input is deliberately ignored
wrong workflow → CONFLICT
```

Webhook, event and public triggers derive keys from (trigger, payload) so duplicate deliveries and double-submitted forms dedupe automatically. Callers may supply an explicit key.

# 16. STEP CACHE

Steps may be cached per node, opt-in:

```text
node.configuration.cacheable === true
key = SHA-256(workflowId, workflowVersion, nodeId, configuration, input)
```

Rules:

```text
identical inputs and graph produce an identical key
a cache hit records CACHED and does not re-execute the handler
different input always misses
non-cacheable nodes are never cached
cache hits and misses are metered
```

Nothing is ever replayed on a fuzzy or time-based match.

# 17. METERING

Every observable unit is metered:

```text
run.count
run.duration_ms
step.count
step.cache_hit / step.cache_miss / step.failed
model.call / model.tokens_in / model.tokens_out / model.failed
cost.minor
```

A summary endpoint aggregates records by tenant. Analytics are derived from these records, not from unrelated counters (directive §42).

# 18. RUN STREAM

Every run produces an append-only, per-run event stream:

```text
run.started
step.started
step.completed
step.cached
step.failed
run.completed
run.failed
```

Each event carries a monotonic per-run sequence. The stream is replayable in order and terminates with a run snapshot. Live subscription is implemented via an in-process `RunEventBus` (the engine publishes every event; SSE subscribers replay then tail without polling). A NATS-backed bus replaces it in multi-instance deployments without changing the engine.

# 19. DOMAIN EVENTS

Significant transitions are published as canonical domain events through the transactional outbox:

```text
orcflo.run.started
orcflo.run.completed
orcflo.run.failed
orcflo.run.approval_requested
```

Every event carries tenant, correlation and aggregate identifiers so execution history is reconstructable. One unique PENDING outbox envelope per event is written atomically in the same unit of work.

# 20. PERSISTENCE

The durable source of truth is PostgreSQL 16 with Prisma; an explicitly ephemeral in-memory adapter exists for demo and tests.

```text
PostgreSQL — source of truth for runs, steps, cache, metering, events
Memory    — process-local, ephemeral, labelled as such in every response
```

All writes for one execution transition share one unit-of-work boundary (snapshot rollback in memory; serializable transactions with bounded conflict retries in Prisma).

# 21. TOOL EXECUTION

Tools execute through one canonical tool executor port. The registry holds `ToolDefinition` records (id, name, input schema, permissions, risk, cost, availability, provenance) and the policy gate governs every invocation.

```text
AGENT / WORKFLOW
      │
      ▼
 TOOL REGISTRY
      │
      ▼
 POLICY GATE
      │
      ▼
 TOOL EXECUTOR
      │
      ▼
  RESULT
```

A workflow can be registered as a first-class tool (`workflow-as-tool`): the agent runtime invokes it through the same executor, and the kernel starts a nested run with preserved correlation, parent execution id and a recursion depth limit.

# 22. MODEL GATEWAY

Model access is fail-closed:

```text
noop     — refuses every call
demo     — deterministic echo, demo runtime only
external — configuration placeholder; refused until a verified SDK review exists
```

`ai_model` nodes call the gateway directly with a bounded prompt and token cap. A provider call is never fabricated: an external provider returns `PROVIDER_ERROR`, not a made-up response.

# 23. AGENT NODES

`agent` workflow nodes execute through the canonical agent runtime — never a second agent implementation.

```text
Workflow
   ↓
Agent Node
   ↓
BoundedAgentRuntime
   ↓
Structured Result
   ↓
Next Node
```

The canonical lifecycle governs the agent (READY → RUNNING → COMPLETED). An agent pause at WAITING_APPROVAL fails the run today with a clear reason because resumable approval is not yet wired — stated, not hidden.

# 24. TRIGGERS

All triggers converge on `startRun`:

```text
manual   — operator fires by id
schedule — deterministic cron (UTC / fixed offsets), once per minute bucket
webhook  — secret-key authenticated, payload-derived idempotency
event    — explicit event-type fire, payload-derived idempotency
public   — anonymous slug, input-validated, rate-limited public form
```

No trigger path bypasses graph validation, policy, bounds, metering or the run stream.

# 25. SCHEDULING

Scheduling is deterministic and independent of the workflow graph:

```text
timezone (UTC or fixed offset; DST zone names rejected)
cron (5-field, validated at creation)
enabled
lastFiredAt
once per minute bucket
```

A `ScheduleDispatcher` drains due schedules cross-tenant with at-most-once-per-bucket semantics. Multi-instance leases, `next_run` and failure policy remain future work; the deterministic authority is the pure cron matcher.

# 26. APPROVAL

Human approval is first-class:

```text
human_approval and transaction nodes → WAITING_APPROVAL (persisted)
policy-required approvals → WAITING_APPROVAL
approval is persisted system state, never a frontend-only boolean
```

Resumption is implemented: an APPROVED decision resumes execution from the approval node (completed work rebuilt from persisted steps, never re-executed) and a REJECTED decision cancels the run; a waiting run is durable and inspectable throughout.

# 27. BLUEPRINTS

Blueprints are reusable workflow templates that instantiate into first-class workflows:

```text
{{ key }} inline substitution
$key typed substitution (string / number / boolean / json)
declared parameters validated; undeclared placeholders rejected
instantiated workflows are ordinary Workflow rows, runnable by the kernel
```

Blueprint export must never leak secrets (directive §35).

# 28. PUBLIC INTERFACES

A READY workflow may be exposed anonymously:

```text
input schema validation (deterministic, strict)
per-interface rate limit and daily run cap
cost and duration bounds
idempotency (explicit or derived)
synthetic PUBLIC role — execute-only, never a membership role
```

Node, agent and tool policies still apply: a public interface cannot bypass a tenant's gates.

# 29. VERSIONING

Runs pin the exact workflow version:

```text
the run references the workflow definition and its version
the step cache keys on the version, so a new version never reuses stale outputs
editing a workflow never mutates historical runs
```

# 30. TENANT ISOLATION

Every kernel read and write is tenant-scoped server-side:

```text
runs
steps
cache
metering
triggers
blueprints
model providers
events
```

Cross-tenant access requires an explicitly authorized architecture; none exists by default.

# 31. POLICY GATE

Before each step the kernel consults the policy gate:

```text
deny              → the run fails with AUTHORIZATION_DENIED
require_approval  → the run pauses at WAITING_APPROVAL
allow             → execution continues
```

Role permissions are checked server-side; the synthetic PUBLIC role may execute workflows and nothing else.

# 32. INPUT VALIDATION

Run inputs and tool invocations are validated before execution:

```text
schema validation (Zod at the domain boundary)
type and shape normalization
policy validation
```

Arbitrary external payloads never propagate unchecked (master prompt §15).

# 33. OUTPUT AND EVIDENCE GATE

A run completes only with observable evidence:

```text
each executed step returns evidence (tool_result / internal_trace / approval / external_reference)
a run with zero evidence fails with WORKFLOW_ERROR
```

A UI animation, LLM text or label is never evidence that work occurred.

# 34. ERROR HANDLING

Failures are machine-readable:

```text
code      — e.g. WORKFLOW_ERROR, TIMEOUT, AUTHORIZATION_DENIED, CONFLICT,
             RATE_LIMITED, CONFIGURATION_ERROR, PROVIDER_ERROR, NOT_FOUND,
             VALIDATION_ERROR
message   — human-readable with operation context
retryable — classification for the caller
```

The failed run records the failing node and emits `step.failed` + `run.failed`.

# 35. RETRY

Node retries are bounded and classified:

```text
retryPolicy.maxRetries / backoffMs per node
only retryable failures are retried
timeouts abort the step and are retryable
deadlines and caps are enforced across attempts
```

Retries never bypass policy, cost or duration bounds.

# 36. ASYNCHRONOUS EXECUTION

The kernel contract separates long-running work from request lifecycles:

```text
Request
 ↓
Persist run
 ↓
Queue job
 ↓
Worker
 ↓
Execute
 ↓
Persist result
 ↓
Emit event
```

The reference implementation now supports both modes: `createRun` persists a PENDING run with the caller context + limits captured on it, `executeRun` executes or resumes it, and `RunDispatcher` workers drain PENDING runs with a claim/lease protocol (`claimedBy`/`claimedUntil`, `FOR UPDATE SKIP LOCKED`, expiry reclaim) so multiple workers never execute the same run. A NATS-backed queue and lease renewal/heartbeat remain the documented next step; the run stream and persistence make the boundary safe.

# 37. EXTERNAL ACTIONS

External systems must not block the kernel indefinitely:

```text
ExternalActionRequested
 ↓
Queue
 ↓
Worker
 ↓
External System
 ↓
ExternalActionCompleted
```

This is introduced incrementally, per external capability, and always through the tool executor port with timeouts, retries and idempotency.

# 38. OBSERVABILITY

The kernel must answer, for every run:

```text
WHAT happened?
WHEN?
WHY?
WHERE?
WHICH workflow?
WHICH node?
WHICH tool?
WHAT input?
WHAT output?
HOW LONG?
HOW MUCH?
WHAT failed?
WHAT was retried?
WHAT required approval?
```

The run stream, metering records and domain events are the answer sources. If the kernel cannot answer these questions, the implementation is incomplete (master prompt §30).

# 39. EVENTS

Structured events carry sufficient identifiers to reconstruct history:

```text
tenantId
runId
workflowId
correlationId
sequence / occurredAt
payload
```

Sensitive reasoning traces are never exposed merely because internal observability exists; structured decision metadata is preferred over chain-of-thought storage.

# 40. SECURITY

Security controls live at the kernel boundary:

```text
identity verification and membership reconciliation
tenant isolation
role-based authorization
tool permissions and risk gates
budgets and caps
approval requirements
fail-closed defaults
```

Prompt instructions are never security controls (master prompt §54).

# 41. COST CONTROL

Every run supports execution budgets:

```text
max_duration
max_cost
max_node_executions
max_iterations (loop)
max_tokens (model nodes)
```

Limits are enforced by the runtime, never by the prompt.

# 42. KERNEL TESTING

The kernel is tested independently of any UI:

```text
graph validation (cycles, bounded loops, router edges)
linear, branching, router, loop, parallel and merge executions
failure, retry, timeout, cap and evidence-gate paths
idempotent replay
cache hit/miss
metering and stream ordering
tenant isolation
```

Tests run against the in-memory adapter and the live PostgreSQL integration suite is opt-in.

# 43. SIMULATION MODE

The kernel should eventually distinguish:

```text
REAL MODE
→ executes external actions
```

```text
SIMULATION MODE
→ predicts / validates execution without side effects
```

The demo execution mode today is deterministic and labelled simulated; a full dry-run/approval flow before high-risk autonomous execution remains future work (master prompt §62–§63).

# 44. ACCEPTANCE CRITERIA

The Execution Kernel is successful when:

```text
[ ] agents, workflows, voice, vision and tools converge on one kernel

[ ] runs and steps are persisted and immutable after terminal state

[ ] every run references its exact workflow version

[ ] graphs are validated before execution (bounded loops only)

[ ] policy is enforced before every step

[ ] duration, cost and node-execution bounds are enforced

[ ] duplicate triggers never create duplicate runs

[ ] cache hits and misses are deterministic and metered

[ ] the run stream is replayable and monotonic

[ ] domain events flow through the transactional outbox

[ ] tool execution passes through one executor port with policy

[ ] model access is fail-closed

[ ] agent nodes use the canonical agent runtime

[ ] public interfaces cannot bypass tenant gates

[ ] observability answers WHAT / WHEN / WHY / HOW MUCH

[ ] failures are machine-readable and bounded retries are classified

[ ] all execution ultimately passes through this kernel
```

FINAL PRINCIPLE

The kernel is not more code.

It is the discipline that keeps VOXFLOW from fragmenting into competing execution engines.

```text
AGENTS
→ THINK

WORKFLOWS
→ ORCHESTRATE

TOOLS
→ ACT

KERNEL
→ CONTROLS

EVENTS
→ CONNECT

PERSISTENCE
→ REMEMBERS

OBSERVABILITY
→ EXPLAINS

VERIFICATION
→ PROVES

HUMANS
→ RETAIN AUTHORITY WHERE REQUIRED
```

Every capability built in this repository strengthens this contract — or it is not built at all.
