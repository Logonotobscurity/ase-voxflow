# WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE

**Document status:** development-specification addition, captured verbatim on 2026-08-16.
**Governance rule:** this is the target the coding agent evolves toward. Sections marked
`IMPLEMENTED` / `PARTIAL` / `FUTURE` in
[`docs/verification/workflow-runtime-bridge-2026-08-16.md`](verification/workflow-runtime-bridge-2026-08-16.md)
override nothing here; the directive is the specification, the verification doc is the
current-state map. `docs/ARCHITECTURE.md` §5 and `docs/ARCHITECTURE_DECISIONS.md`
(the canonical ADR register) remain the decision authorities. Agents working on this
system must also read `docs/CODE_AGENT_MASTER_PROMPT.md` (engineering control prompt)
and `docs/DEVELOPMENT_SPEC.md` (development-spec index).

## PURPOSE

Workflows are a first-class execution primitive of the platform.

A workflow is a visual automation graph that connects:

- inputs
- AI models
- agents
- logic
- tools
- integrations
- transformations
- conditions
- loops
- outputs

to accomplish a defined task.

A workflow can be:

- run manually;
- triggered by an event;
- triggered by a webhook;
- scheduled;
- exposed through a public interface;
- invoked by an agent;
- invoked by another workflow.

---

# 1. CORE WORKFLOW MODEL

The canonical conceptual model is:

INPUT
  ↓
AI MODELS
  ↓
LOGIC + TOOLS
  ↓
OUTPUT

However, the actual execution engine must support arbitrary DAG-style
graphs rather than only linear pipelines.

Example:

INPUT
  ↓
AI MODEL
  ↓
DECISION
 ├── YES → TOOL → OUTPUT
 │
 └── NO  → TRANSFORM → OUTPUT

---

# 2. WORKFLOW GRAPH

A workflow consists of:

```text
Workflow
 ├── Nodes
 ├── Edges
 ├── Variables
 ├── Inputs
 ├── Outputs
 ├── Configuration
 ├── Triggers
 ├── Versions
 └── Execution Policies
```

The backend MUST be the source of truth for workflow state.

The visual canvas is a representation/editor of the canonical workflow
graph.

Do not create a separate frontend-only workflow model.

---

# 3. NODE MODEL

Every node should have a stable identity.

Conceptually:

```ts
WorkflowNode {
    id
    workflowId
    type
    name
    position
    configuration
    inputSchema
    outputSchema
    metadata
}
```

Node types should be extensible.

Initial conceptual node categories:

```text
INPUT
AI_MODEL
AGENT
DECISION
ROUTER
TRANSFORM
FOR_EACH
INFORMATION
OUTPUT
TOOL
HTTP
MCP
WEB_SEARCH
WEB_CRAWL
CONTENT_EXTRACT
EMAIL
WEBHOOK
HUMAN_APPROVAL
TRIGGER
```

Do not hard-code node behavior into the visual editor.

Node execution belongs to the workflow runtime.

---

# 4. NODE EXECUTOR ARCHITECTURE

Use an executor abstraction.

Conceptually:

```python
class NodeExecutor(Protocol):

    async def execute(
        self,
        node,
        context
    ) -> NodeExecutionResult:
        ...
```

Each node type should have a corresponding execution strategy.

Example:

```text
Workflow Engine
      │
      ▼
Node Executor Registry
      │
 ┌────┼────────┬─────────┐
 ▼    ▼        ▼         ▼
AI   Agent    Tool     Router
```

The registry should make new node types possible without modifying the
entire workflow engine.

---

# 5. DATA FLOW

Connections define data flow.

Example:

```text
INPUT
  │
  │ text
  ▼
AI MODEL
  │
  │ summary
  ▼
OUTPUT
```

Edges should be represented explicitly.

Conceptually:

```ts
WorkflowEdge {
    id
    workflowId
    sourceNodeId
    sourcePort
    targetNodeId
    targetPort
    mapping
    condition?
}
```

Do not rely on canvas coordinates to determine execution order.

The graph determines execution.

---

# 6. DATA MAPPING

Nodes must be able to consume outputs from previous nodes.

Support references such as:

```text
{{input.text}}

{{ai_model.output}}

{{customer.email}}

{{workflow.variables.user_id}}
```

The exact expression syntax should be standardized.

Do not introduce multiple incompatible templating syntaxes.

---

# 7. WORKFLOW CONTEXT

Every run receives a runtime context.

Conceptually:

```python
WorkflowContext:
    run_id
    workflow_id
    workflow_version
    tenant_id
    trigger
    inputs
    variables
    node_outputs
    metadata
    execution_state
```

Node execution must be deterministic with respect to the supplied
context wherever possible.

---

# 8. WORKFLOW RUN

A workflow definition and a workflow execution are separate entities.

```text
Workflow
   │
   ├── Version 1
   ├── Version 2
   └── Version 3
          │
          ▼
        Run
          │
     ┌────┼─────┐
     ▼    ▼     ▼
   Node  Node   Node
   Run   Run    Run
```

Never mutate historical runs when a workflow is edited.

Every run must reference the exact workflow version used.

---

# 9. RUN STATES

Workflow runs should support:

```text
PENDING
RUNNING
PAUSED
WAITING
COMPLETED
FAILED
CANCELLED
TIMED_OUT
```

Node executions should similarly track:

```text
PENDING
RUNNING
COMPLETED
FAILED
SKIPPED
WAITING
CANCELLED
```

---

# 10. RUN HISTORY

Persist execution history.

A user should be able to inspect:

```text
Run
 ├── Trigger
 ├── Start time
 ├── End time
 ├── Duration
 ├── Status
 ├── Cost
 ├── Inputs
 ├── Nodes
 │    ├── Input
 │    ├── AI
 │    ├── Tool
 │    └── Output
 ├── Errors
 └── Final Output
```

Historical execution data must be immutable.

---

# 11. REAL-TIME RUN MONITORING

The visual run pane should receive execution events.

Example:

```text
workflow.run.started
workflow.node.started
workflow.node.completed
workflow.node.failed
workflow.run.completed
workflow.run.failed
```

Flow:

```text
WORKFLOW ENGINE
      ↓
NATS / EVENT BUS
      ↓
REALTIME SUBSCRIBER
      ↓
NEXT.JS RUN PANE
```

Do not make the frontend poll aggressively if the existing event
architecture can provide realtime execution events.

---

# 12. CONDITIONAL LOGIC

Support decision nodes.

Example:

```text
AI MODEL
    ↓
DECISION
    │
    ├── condition A → TOOL A
    │
    └── condition B → TOOL B
```

Conditions may evaluate:

* structured model output;
* variables;
* previous node output;
* event metadata;
* tool results.

Critical business conditions should preferably be deterministic code
rather than unconstrained LLM reasoning.

---

# 13. ROUTER

Router nodes should support multiple branches.

Example:

```text
INPUT
  ↓
ROUTER
 ├── support → Support Agent
 ├── sales   → Sales Agent
 ├── billing → Billing Agent
 └── unknown → Human
```

Router decisions must produce structured output.

---

# 14. LOOPS

Support:

```text
FOR EACH
```

and bounded iterative execution.

Example:

```text
INPUT
 ↓
FOR EACH ITEM
 ↓
AI MODEL
 ↓
TRANSFORM
 ↓
COLLECT
 ↓
OUTPUT
```

All loops MUST have safety limits.

Required:

```text
max_iterations
timeout
max_items
budget
```

Never allow an accidental infinite workflow loop.

---

# 15. AI MODEL NODE

AI Model nodes must support:

```text
provider
model
instructions
system prompt
input mapping
output schema
temperature/configuration
context
limits
```

The model should receive only the context required for that node.

Do not automatically send the entire workflow state to every model.

---

# 16. MULTI-MODEL WORKFLOWS

A workflow may use different models for different tasks.

Example:

```text
Fast model
    ↓
classification
    ↓
reasoning model
    ↓
complex analysis
    ↓
small model
    ↓
formatting
```

The workflow definition must explicitly identify model requirements.

Do not assume one model is optimal for every node.

---

# 17. AGENT NODE

An Agent should be usable as a workflow node.

Example:

```text
Input
  ↓
Research Agent
  ↓
Transform
  ↓
Reviewer Agent
  ↓
Output
```

This creates the bridge between:

```text
AGENT RUNTIME
```

and:

```text
WORKFLOW RUNTIME
```

An agent node must execute through the canonical agent runtime.

Do not create a second agent implementation inside the workflow engine.

---

# 18. TOOL NODE

Tools should be first-class workflow components.

Examples:

```text
Web Search
HTTP Request
Email
MCP
Database
Code
Content Extraction
```

Tool execution must pass through the canonical tool registry where
possible.

This means:

```text
AGENT
  │
  ▼
TOOL REGISTRY
  ▲
  │
WORKFLOW
```

rather than maintaining separate agent and workflow tool systems.

---

# 19. TOOL APPROVAL

High-risk tools require approval.

Example:

```text
Agent
 ↓
Tool Proposal
 ↓
Risk Assessment
 ↓
Human Approval
 ↓
Tool Execution
```

Risk levels should be explicit.

Example:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 20. MCP NODE

MCP servers should be usable from workflows.

Flow:

```text
Workflow
   ↓
MCP Node
   ↓
MCP Server
   ↓
Tool
   ↓
Result
```

MCP should integrate with the same permission, observability and
tool-governance system used by agents.

---

# 21. INPUT NODE

Input nodes define workflow entry data.

Inputs may come from:

```text
manual run
public form
API
webhook
schedule
application event
agent
another workflow
```

Input schemas must be explicit.

Example:

```json
{
  "name": "string",
  "email": "string",
  "message": "string"
}
```

Validate inputs before execution.

---

# 22. OUTPUT NODE

Output nodes define workflow results.

Outputs should be structured where possible.

Example:

```json
{
  "summary": "...",
  "status": "completed"
}
```

The execution API should expose the final workflow output.

---

# 23. TRANSFORM NODE

Transform nodes perform deterministic data transformations.

Examples:

```text
map
filter
format
merge
split
parse
extract
rename
```

Prefer deterministic code for deterministic transformations.

Do not use an LLM when ordinary code is sufficient.

---

# 24. INFORMATION NODE

Information nodes provide context/documentation to the workflow without
necessarily performing an action.

Examples:

```text
instructions
documentation
static configuration
metadata
knowledge
```

Keep informational data separate from executable tools.

---

# 25. DATA SOURCES

Workflows should support controlled external data sources.

Examples:

```text
documents
files
databases
APIs
connected applications
MCP
```

Every source should have:

```text
authentication
permissions
schema
tenant ownership
availability
audit trail
```

---

# 26. FILE HANDLING

File-based workflow nodes must support:

```text
upload
read
parse
transform
extract
store
output
```

Never load unbounded files into model context.

Apply:

```text
size limits
type validation
sandboxing
timeouts
resource limits
```

---

# 27. HTTP REQUEST NODE

HTTP requests must use the platform's canonical HTTP infrastructure.

Do not implement a separate HTTP client inside every node.

Support:

```text
authentication
timeouts
retry
rate limits
headers
body
query parameters
response parsing
error handling
```

Respect SSRF protection.

---

# 28. WEB SEARCH / WEB CRAWL

Search and crawl tools must remain distinct.

```text
Web Search
    ↓
discover sources

Web Crawl
    ↓
retrieve specific content
```

Do not expose unrestricted network access to workflow nodes.

---

# 29. EMAIL

Email should be implemented as a tool/provider adapter.

Support:

```text
recipient
subject
body
attachments
template
provider
```

High-volume sending requires rate limiting and authorization.

---

# 30. TRIGGERS

Workflows can be activated by:

```text
manual
webhook
schedule
application event
agent
API
```

All triggers should eventually produce the same canonical:

```text
WorkflowTrigger
```

object.

---

# 31. WEBHOOK TRIGGERS

Webhook flow:

```text
HTTP Request
 ↓
Authentication
 ↓
Signature Verification
 ↓
Input Validation
 ↓
Idempotency Check
 ↓
Workflow Run
```

Never execute an unauthenticated webhook directly.

---

# 32. SCHEDULED RUNS

Scheduled workflows should support cron expressions.

Flow:

```text
Scheduler
 ↓
Trigger
 ↓
Workflow Run
```

Persist the schedule independently from the workflow graph.

Required:

```text
timezone
enabled
cron
last_run
next_run
failure_policy
```

---

# 33. APP TRIGGERS

External application events may trigger workflows.

Example:

```text
Payment received
      ↓
Event
      ↓
Workflow
      ↓
AI
      ↓
Notification
```

Use the existing NATS/event architecture.

Do not create another event bus.

---

# 34. PUBLIC INTERFACES

A workflow may be exposed as a public interface/form.

Flow:

```text
PUBLIC FORM
    ↓
INPUT VALIDATION
    ↓
WORKFLOW RUN
    ↓
OUTPUT
```

Public workflows require:

```text
rate limiting
abuse prevention
authentication where appropriate
run limits
cost limits
input validation
```

---

# 35. BLUEPRINTS

Blueprints are reusable workflow definitions.

A blueprint may contain:

```text
nodes
edges
configuration
input schema
output schema
metadata
```

Blueprints must not accidentally expose:

* API keys;
* secrets;
* tenant credentials;
* private data.

---

# 36. WORKFLOW VERSIONING

Every workflow change should create a version.

Example:

```text
Workflow
 ├── v1
 ├── v2
 ├── v3
 └── current → v3
```

Runs reference versions.

Allow:

```text
draft
published
archived
```

states.

---

# 37. COLLABORATION

Support workflow ownership and sharing.

Potential permissions:

```text
OWNER
EDITOR
RUNNER
VIEWER
```

Permission checks must happen server-side.

---

# 38. FOLDERS

Folders are organizational metadata.

Do not allow folder structure to become coupled to workflow execution.

Moving a workflow between folders must not alter its behavior.

---

# 39. RECENTLY DELETED

Deletion should preferably be soft deletion.

Support:

```text
active
deleted
restored
permanently_deleted
```

Do not immediately destroy historical execution records unless explicitly
required by retention policy.

---

# 40. RUN COST LIMITS

Every workflow must support execution budgets.

Possible limits:

```text
max_duration
max_nodes
max_iterations
max_tool_calls
max_tokens
max_model_cost
max_external_requests
```

A workflow exceeding its limits should transition to:

```text
FAILED
```

with a clear machine-readable reason.

---

# 41. DATA EXPORT

Users should be able to export appropriate workflow data.

Potential exports:

```text
workflow definition
workflow version
run history
outputs
analytics
```

Never export secrets.

---

# 42. WORKFLOW ANALYTICS

Track:

```text
run count
success rate
failure rate
average duration
node latency
tool usage
model usage
token usage
estimated cost
```

Analytics should be derived from execution events/history rather than
maintained through unrelated counters whenever possible.

---

# 43. CANVAS ARCHITECTURE

The visual canvas is an editor.

It is NOT the execution engine.

```text
                    CANVAS
                      │
             edit workflow graph
                      │
                      ▼
               WORKFLOW API
                      │
                      ▼
             WORKFLOW DEFINITION
                      │
                      ▼
              EXECUTION ENGINE
                      │
                      ▼
                    RUN
```

The browser must never be responsible for executing authoritative
workflow logic.

---

# 44. CANVAS ACTIONS

The canvas should support:

```text
create node
delete node
duplicate node
move node
connect nodes
disconnect nodes
configure node
validate graph
save draft
publish version
run workflow
view run
```

---

# 45. GRAPH VALIDATION

Before publishing or executing:

Validate:

```text
node IDs
edge references
missing inputs
missing required configuration
cycles
unreachable nodes
invalid node types
invalid schemas
missing credentials
permission violations
```

Some workflows may intentionally contain loops, so graph validation must
distinguish:

```text
valid bounded loop
```

from:

```text
accidental infinite cycle
```

---

# 46. WORKFLOW EXECUTION ENGINE

The engine should:

1. load workflow version;
2. validate inputs;
3. create run;
4. construct execution context;
5. resolve ready nodes;
6. execute nodes;
7. persist results;
8. emit events;
9. resolve downstream nodes;
10. continue until terminal state;
11. produce final output.

Conceptually:

```text
LOAD
 ↓
VALIDATE
 ↓
CREATE RUN
 ↓
READY NODES
 ↓
EXECUTE
 ↓
PERSIST
 ↓
EMIT EVENT
 ↓
RESOLVE NEXT NODES
 ↓
EXECUTE
 ↓
...
 ↓
FINAL OUTPUT
```

---

# 47. CONCURRENCY

Independent nodes should be capable of executing concurrently.

Example:

```text
          INPUT
          /   \
         /     \
   Search A   Search B
         \     /
          \   /
          MERGE
```

A and B should be eligible for parallel execution.

Concurrency must respect:

```text
tenant limits
workflow limits
tool limits
provider limits
resource limits
```

---

# 48. IDEMPOTENCY

Workflow execution must support idempotency.

Especially for:

* webhooks;
* payments;
* email;
* external API calls;
* scheduled jobs.

A duplicate trigger must not automatically create duplicate side effects.

---

# 49. HUMAN-IN-THE-LOOP NODE

Human approval should be a first-class node.

Example:

```text
AI
 ↓
Decision
 ↓
Human Approval
 ├── approved → Tool
 └── rejected → Output
```

A waiting workflow must be persistable and resumable.

---

# 50. AGENT + WORKFLOW INTEROPERABILITY

Agents can invoke workflows.

Workflows can invoke agents.

Therefore:

```text
AGENT
  ↓
WORKFLOW
  ↓
AGENT
  ↓
TOOL
```

must be supported without creating recursive uncontrolled execution.

All cross-boundary calls require:

```text
correlation_id
parent_execution_id
depth_limit
timeout
budget
```

---

# 51. WORKFLOW AS A TOOL

A published workflow should be representable as a callable tool.

Example:

```text
Agent
 ↓
workflow.run("customer_research")
 ↓
Workflow
 ↓
Result
 ↓
Agent
```

The workflow input/output schema becomes the tool schema.

This is one of the most important bridges between the Agent Runtime
and Workflow Runtime.

---

# 52. AGENT AS A NODE

Conversely:

```text
Workflow
 ↓
Agent Node
 ↓
Agent Runtime
 ↓
Result
```

The Agent Node should use the canonical agent runtime.

---

# 53. WORKFLOW EVENTS

Emit events such as:

```text
workflow.created
workflow.updated
workflow.published
workflow.deleted

workflow.run.created
workflow.run.started
workflow.run.paused
workflow.run.completed
workflow.run.failed
workflow.run.cancelled

workflow.node.started
workflow.node.completed
workflow.node.failed
workflow.node.waiting

workflow.trigger.received
workflow.approval.requested
workflow.approval.completed
```

All events should carry correlation metadata.

---

# 54. TESTING

Test workflow execution independently of the UI.

Required tests:

## Graph tests

* node creation
* edge creation
* graph validation
* cycle detection
* unreachable node detection

## Execution tests

* linear workflow
* branching
* router
* parallel execution
* loops
* failure
* retry
* timeout
* cancellation

## Integration tests

* AI model
* Agent
* MCP
* HTTP
* webhook
* scheduler
* database
* NATS

## E2E

```text
CREATE WORKFLOW
 ↓
CONFIGURE
 ↓
CONNECT
 ↓
PUBLISH
 ↓
RUN
 ↓
MONITOR
 ↓
INSPECT
 ↓
VERIFY OUTPUT
```

---

# 55. WORKFLOW DEFINITION OF DONE

A workflow feature is not complete because the canvas can display it.

Complete means:

```text
Canvas
+
Persistence
+
Validation
+
Execution
+
Events
+
Run History
+
Error Handling
+
Security
+
Tests
+
Observability
```

---

# 56. GOLDEN ARCHITECTURE

The final system should converge toward:

```
                     PLATFORM
                        │
        ┌───────────────┴────────────────┐
        │                                │
   AGENT RUNTIME                   WORKFLOW RUNTIME
        │                                │
   perceive                         graph
   reason                           nodes
   plan                             edges
   tools                            triggers
   memory                           scheduler
   handoff                          execution
        │                                │
        └───────────────┬────────────────┘
                        │
                 SHARED PRIMITIVES
                        │
      ┌─────────────────┼──────────────────┐
      │                 │                  │
   TOOL REGISTRY     EVENT BUS          POLICY
      │                 │                  │
      ├─────────────┬───┴──────────┬───────┤
      │             │              │
     MCP          NATS          APPROVAL
      │             │              │
      └─────────────┼──────────────┘
                    │
                PERSISTENCE
                    │
              PostgreSQL/Prisma
                    │
                    ▼
               OBSERVABILITY
```

The key principle:

## **Agents reason. Workflows orchestrate. Tools act. Events connect. Persistence remembers. Policy controls.**

Do not collapse all six responsibilities into one LLM agent.

# END WORKFLOW DIRECTIVE
