# VOXFLOW — Route Architecture Specification

Version: 1.0
Status: Foundational (target — frontend route-by-route implementation map)
Depends On:
- DEVELOPMENT_SPEC.md
- CODE_AGENT_MASTER_PROMPT.md
- ARCHITECTURE_DECISIONS.md
- EXECUTION_KERNEL_SPEC.md
- AGENT_RUNTIME_SPEC.md
- TOOL_AND_MCP_SPEC.md
- VOICE_VISION_SPEC.md

Purpose:
Define the canonical Next.js App Router surface as **surfaces over the same domain primitives** — never independent pages owning their own state — and the route completion contract every route must satisfy.

Current-state honesty:
The repository today ships marketing routes (`/`, `/platform`, `/solutions`, `/marketplace`, `/resources`, `/company`, `/privacy`, `/terms`, `/security`, `/log_on`, `/voxflow`) and a partial app surface (`/app/canvas`, `/app/voice`, `/app/vendors`). This specification is the **target** route map; every route below is a surface over the existing domain primitives (Execution Kernel, Agent Runtime, Tool/MCP layer, Governance, Scheduler) — never a new owner of backend state (see §40 Route → Domain Ownership and the Route Completion Contract). Building routes without their domain contracts is explicitly out of scope until the contract exists.

---

```text
/
├── /product
│   ├── /agents
│   ├── /workflows
│   ├── /tools
│   ├── /voice
│   ├── /vision
│   └── /mcp
│
├── /solutions
│   ├── /operations
│   ├── /research
│   ├── /sales
│   ├── /support
│   └── /enterprise
│
├── /blueprints
│   ├── /
│   └── /[slug]
│
├── /developers
│   ├── /overview
│   ├── /api
│   ├── /sdk
│   ├── /python
│   ├── /typescript
│   └── /mcp
│
├── /docs
│   ├── /getting-started
│   ├── /concepts
│   ├── /workflows
│   ├── /agents
│   ├── /tools
│   ├── /voice
│   ├── /vision
│   └── /api
│
├── /app
│   ├── /dashboard
│   ├── /workflows
│   │   ├── /new
│   │   └── /[workflowId]
│   ├── /agents
│   │   ├── /new
│   │   └── /[agentId]
│   ├── /tools
│   ├── /mcp
│   ├── /runs
│   │   ├── /
│   │   └── /[executionId]
│   ├── /approvals
│   ├── /blueprints
│   ├── /schedules
│   ├── /connections
│   ├── /knowledge
│   ├── /settings
│   ├── /team
│   ├── /usage
│   └── /audit
│
├── /run
│   └── /[executionId]
│
├── /share
│   └── /[workflowId]
│
└── /api
    └── /v1
```

---

# 1. `/` — Marketing Homepage

### Purpose

Establish the product category and demonstrate the core execution model.

### Primary narrative

```text
Give AI a goal.
↓
Build a system.
↓
Watch it work.
↓
Verify the outcome.
```

### Next actions after UI completion

```text
[ ] Connect hero goal input
[ ] Connect natural-language workflow generation
[ ] Add working demo workflow
[ ] Add scroll-reveal system diagram
[ ] Add responsive/mobile composition
[ ] Add CTA routing to /app
[ ] Add analytics events
[ ] Add SEO metadata
[ ] Add structured metadata / OpenGraph
[ ] Validate accessibility
```

### Backend dependency

`generateWorkflow()` or equivalent existing workflow-generation contract.

Do **not** invent a second workflow-generation service.

---

# 2. `/product`

### Purpose

The product overview.

This should explain:

```text
Agents
Workflows
Tools
Realtime
Governance
Execution
```

### Next actions

```text
[ ] Build section navigation
[ ] Link each capability to canonical product routes
[ ] Reuse SystemIllustration components
[ ] Create interactive execution demo
[ ] Add "Build / Run / Verify" narrative
```

---

# 3. `/product/agents`

### Purpose

Explain and demonstrate the Agent Runtime.

### UI

```text
Agent
Objective
Model
Memory
Tools
Permissions
Autonomy
Budget
Handoffs
```

### Next actions

```text
[ ] Connect to AgentDefinition schema
[ ] Add agent preview
[ ] Add capability visualization
[ ] Add autonomy-level explanation
[ ] Add sample run
[ ] Route CTA to /app/agents/new
```

### Product distinction

This page explains **why agents exist**.

The application `/app/agents` is where they are built.

---

# 4. `/product/workflows`

### Purpose

Explain Visual Workflow Studio.

Show:

```text
Input
→ AI
→ Decision
→ Tool
→ Agent
→ Output
```

### Next actions

```text
[ ] Embed controlled canvas demo
[ ] Add node-category carousel
[ ] Add "Describe → Generate → Inspect"
[ ] Connect Run button to demo execution
[ ] Link to /app/workflows/new
```

---

# 5. `/product/tools`

### Purpose

Explain the Tool Layer.

### Next actions

```text
[ ] Build tool taxonomy
[ ] Show API/MCP/database/search/code
[ ] Explain permissions
[ ] Explain risk levels
[ ] Demonstrate tool execution lifecycle
[ ] Link to /app/tools
```

---

# 6. `/product/voice`

### Purpose

Position voice as an interface to workflows.

### Demonstration

```text
"Run customer research."

Voice
↓
Intent
↓
Policy
↓
Workflow
↓
Execution
```

### Next actions

```text
[ ] Use real VoiceCommand schema where available
[ ] Add simulated voice interaction if provider remains unresolved
[ ] Do NOT wire Coqui
[ ] Keep Pipecat as canonical direction
[ ] Link to /app/workflows
```

The specification explicitly states actual STT/TTS wiring is not yet implemented and the TTS provider remains unresolved.

---

# 7. `/product/vision`

### Purpose

Show perception rather than market "AI vision" as a gimmick.

### Next actions

```text
[ ] Camera demo
[ ] Document demo
[ ] Screen demo
[ ] Structured observation visualization
[ ] Workflow integration example
[ ] Provider-agnostic language
```

---

# 8. `/product/mcp`

### Purpose

Explain interoperability.

### Next actions

```text
[ ] MCP architecture diagram
[ ] Tool registry visualization
[ ] Trust model
[ ] Example MCP workflow
[ ] Developer CTA → /developers/mcp
```

---

# 9. `/solutions/*`

These pages should be **problem-first**, not technology-first.

For example:

`/solutions/sales`

```text
LEADS
↓
RESEARCH
↓
QUALIFICATION
↓
CRM
↓
FOLLOW-UP
```

### Next actions per solution route

```text
[ ] Define problem
[ ] Show workflow
[ ] Show agents
[ ] Show tools
[ ] Show outcome
[ ] Show governance
[ ] Add blueprint CTA
```

Do not duplicate product mechanics across every solution page. Reuse content components.

---

# 10. `/blueprints`

This becomes the template discovery surface.

### UI

```text
Search
Categories
Difficulty
Use case
Tools
Agents
```

### Next actions

```text
[ ] Connect Blueprint model
[ ] Build filtering
[ ] Build search
[ ] Add preview
[ ] Add clone action
[ ] Validate blueprint compatibility
[ ] Route clone → /app/workflows/new?blueprint=...
```

---

# 11. `/blueprints/[slug]`

### Purpose

Blueprint detail.

```text
Objective
Workflow
Agents
Tools
Inputs
Outputs
Requirements
Estimated cost
```

### Actions

```text
[Use Blueprint]
[Preview]
[View Workflow]
```

The backend must validate the blueprint before cloning.

---

# 12. `/developers`

### Purpose

Developer landing page.

Message:

> **Visual when you want speed. Code when you need control.**

### Next actions

```text
[ ] SDK examples
[ ] Architecture diagram
[ ] API overview
[ ] MCP overview
[ ] Workflow-as-code example
[ ] Link docs
[ ] Link GitHub if appropriate
```

---

# 13. `/developers/python`

Show the same workflow as the visual builder, but in Python.

### Key requirement

The code example must represent the same underlying execution model.

Do not invent a separate Python orchestration engine.

---

# 14. `/developers/typescript`

Same principle.

```text
Visual workflow
↕
Typed workflow representation
```

The UI and SDK are alternate interfaces to the same domain model.

---

# 15. `/developers/mcp`

Show:

```text
MCP Server
↓
Discovery
↓
Trust
↓
Tool Registry
↓
Policy
↓
Execution
```

---

# 16. `/docs`

This is the technical knowledge system.

I would structure it around the actual runtime concepts:

```text
Getting Started
Concepts
Execution Kernel
Workflows
Agents
Tools
MCP
Voice
Vision
Governance
API
SDK
Troubleshooting
```

### Important

Your architecture specifications should become the **technical source material** for these docs.

Do not let marketing copy become the technical source of truth.

---

# 17. `/app/dashboard`

This is **Mission Control**.

Not a generic analytics dashboard.

Show:

```text
Active Runs
Pending Approvals
Recent Outcomes
Failures
Scheduled Work
Agents
Workflows
Usage
```

### Next actions

```text
[ ] Connect real counts
[ ] Connect run feed
[ ] Connect approval count
[ ] Connect execution telemetry
[ ] Add quick-create actions
```

---

# 18. `/app/workflows`

This is the operational workflow library.

### UI

```text
My Workflows

Search
Filter
Sort

Draft
Published
Paused
Archived

[ New Workflow ]
```

### Next actions

```text
[ ] Connect Workflow model
[ ] Connect versioning
[ ] Connect deletion
[ ] Add folder organization
[ ] Add blueprint cloning
[ ] Add run action
```

---

# 19. `/app/workflows/new`

This is the **primary creation surface**.

Three creation modes:

```text
FROM SCRATCH
FROM BLUEPRINT
DESCRIBE GOAL
```

The third is critical.

### Natural-language entry

> "Build a system that researches every lead and sends qualified ones to Salesforce."

Then:

```text
Goal
↓
Generate
↓
Preview
↓
Inspect
↓
Publish
```

---

# 20. `/app/workflows/[workflowId]`

This is the actual **Workflow Studio**.

Layout:

```text
┌──────────────────────────────────────────────┐
│ Header                                       │
├────────────┬──────────────────────┬──────────┤
│ Node       │                      │ Config   │
│ Library    │      CANVAS          │ Panel    │
│            │                      │          │
│ AI         │                      │          │
│ Agent      │                      │          │
│ Tool       │                      │          │
│ Logic      │                      │          │
├────────────┴──────────────────────┴──────────┤
│                 RUN CONSOLE                  │
└──────────────────────────────────────────────┘
```

### Next actions

```text
[ ] Connect canonical workflow graph
[ ] Node CRUD
[ ] Edge CRUD
[ ] Validation
[ ] Draft save
[ ] Version creation
[ ] Publish
[ ] Run
[ ] Simulation
[ ] Undo/redo
[ ] Execution overlay
```

---

# 21. `/app/agents`

Agent registry.

### Next actions

```text
[ ] Connect agent records
[ ] Search/filter
[ ] Agent status
[ ] Usage
[ ] Autonomy
[ ] Last execution
[ ] Create agent
```

---

# 22. `/app/agents/new`

Agent builder.

Sections:

```text
Identity
Objective
Instructions
Model
Memory
Tools
Permissions
Autonomy
Budget
Handoffs
```

### Next actions

```text
[ ] Schema-backed editor
[ ] Tool selector
[ ] Permission selector
[ ] Budget configuration
[ ] Test agent
[ ] Simulation
[ ] Publish/version
```

---

# 23. `/app/agents/[agentId]`

Agent command center.

Show:

```text
Overview
Runs
Tools
Memory
Policies
Handoffs
Versions
Usage
```

This page should not expose raw internal chain-of-thought.

Show structured decisions, actions, evidence and outcomes.

---

# 24. `/app/tools`

Tool registry.

Sections:

```text
Installed
Internal
MCP
Connected Apps
Custom
```

### Next actions

```text
[ ] Tool inventory
[ ] Health states
[ ] Risk levels
[ ] Versioning
[ ] Permissions
[ ] Test tool
```

---

# 25. `/app/mcp`

MCP control plane.

```text
Servers
Tools
Trust
Health
Credentials
```

### Next actions

```text
[ ] Connect MCP server
[ ] Authenticate
[ ] Discover
[ ] Review tools
[ ] Assign trust
[ ] Assign permissions
[ ] Enable/disable
```

The UI must never itself become the MCP execution layer.

---

# 26. `/app/runs`

Global execution history.

Filters:

```text
Workflow
Agent
Status
Date
Tenant
Cost
```

### Next actions

```text
[ ] Connect Execution model
[ ] Add filters
[ ] Add pagination
[ ] Add live execution updates
[ ] Add export
```

---

# 27. `/app/runs/[executionId]`

This is one of the most important product screens.

## Execution Observatory

```text
GOAL
↓
PLAN
↓
STEP 1
↓
STEP 2
↓
TOOL
↓
APPROVAL
↓
STEP 3
↓
VERIFY
↓
OUTCOME
```

Panels:

```text
Timeline
Inputs
Outputs
Events
Tools
Evidence
Cost
Errors
Approvals
```

This is where "executed ≠ verified" becomes visible.

---

# 28. `/run/[executionId]`

This should be a **focused execution experience**.

Useful for:

```text
* shared runs
* embedded execution
* public status
* customer-facing workflow execution
```

Strip away the rest of the application shell.

---

# 29. `/app/approvals`

Human intervention inbox.

Show:

```text
Waiting
Approved
Rejected
Expired
```

Each approval:

```text
Action
Risk
Agent
Workflow
Impact
Reason
Evidence

[Approve]
[Reject]
```

---

# 30. `/app/blueprints`

Private blueprint management.

```text
My Blueprints
Drafts
Published
Shared
Imported
```

---

# 31. `/app/schedules`

Scheduled execution.

Show:

```text
Workflow
Cron
Timezone
Next Run
Last Run
Status
```

Actions:

```text
Pause
Resume
Edit
Run Now
```

---

# 32. `/app/connections`

External system connections.

```text
Salesforce
SAP
Google
Slack
MCP
Custom APIs
```

Never expose secrets.

Only show:

```text
Connected
Last verified
Scopes
Owner
Status
```

---

# 33. `/app/knowledge`

Knowledge/data sources.

```text
Documents
Files
Indexes
Connections
Permissions
```

This becomes the bridge between data and agents.

---

# 34. `/app/usage`

Usage and cost.

Show:

```text
LLM
Tokens
Tool calls
Runs
Voice
Vision
Storage
External APIs
```

Eventually:

```text
Budget
Current usage
Projected usage
Alerts
```

---

# 35. `/app/team`

Team and RBAC.

```text
Members
Roles
Groups
Permissions
Invitations
```

---

# 36. `/app/audit`

Enterprise audit trail.

Filters:

```text
Actor
Action
Resource
Date
Risk
Tenant
```

This must come from authoritative backend audit events.

---

# 37. `/app/settings`

Settings should be divided:

```text
Workspace
Identity
Security
Notifications
Models
Providers
Policies
Billing
API
```

Do not dump everything into one enormous settings page.

---

# 38. `/share/[workflowId]`

Public workflow interface.

The workflow itself remains private.

The public surface only exposes:

```text
approved inputs
execution
safe output
```

Required protections:

```text
rate limit
abuse controls
input validation
execution limits
cost limits
```

---

# 39. `/api/v1`

This should expose domain APIs rather than UI-shaped APIs.

Primary resources:

```text
/workflows
/workflow-versions
/executions
/agents
/tools
/mcp
/approvals
/blueprints
/schedules
/connections
/events
```

The API layer must call application services.

It should not contain execution business logic itself.

---

# 40. ROUTE → DOMAIN OWNERSHIP

The most important implementation map is:

```text
/api/v1/workflows
        ↓
Workflow Domain

/api/v1/agents
        ↓
Agent Runtime

/api/v1/tools
        ↓
Tool Layer

/api/v1/executions
        ↓
Execution Kernel

/api/v1/approvals
        ↓
Governance

/api/v1/mcp
        ↓
MCP / Tool Layer

/api/v1/schedules
        ↓
Trigger / Scheduler

/api/v1/events
        ↓
Event Infrastructure
```

---

# 41. PAGE BUILD ORDER

Do **not** implement all routes at once.

I would build in this order:

### Wave 1 — Core product

```text
/app/dashboard
/app/workflows
/app/workflows/new
/app/workflows/[workflowId]
/app/runs/[executionId]
```

### Wave 2 — Agent system

```text
/app/agents
/app/agents/new
/app/agents/[agentId]
```

### Wave 3 — Tool system

```text
/app/tools
/app/mcp
/app/connections
```

### Wave 4 — Governance

```text
/app/approvals
/app/audit
/app/usage
/app/team
```

### Wave 5 — Automation

```text
/app/schedules
/app/blueprints
/share/[workflowId]
```

### Wave 6 — Developer ecosystem

```text
/developers
/developers/api
/developers/sdk
/developers/python
/developers/typescript
/developers/mcp
/docs/*
```

### Wave 7 — Marketing

Then finalize:

```text
/
/product/*
/solutions/*
```

because marketing should reflect what the product actually does, not promise infrastructure that isn't implemented.

---

# 42. IMPORTANT ROUTING RULE

Every route should answer:

> **What domain owns this state?**

For example:

```text
Workflow page
→ Workflow Domain

Run page
→ Execution Kernel

Agent page
→ Agent Runtime

Tool page
→ Tool Registry

Approval page
→ Governance

MCP page
→ Tool/MCP layer
```

The frontend should never become the owner simply because it is where the user sees the information.

---

# 43. NEXT ACTION AFTER EACH PAGE

The coding agent should use this lifecycle:

```text
ROUTE CREATED
      ↓
DESIGN SYSTEM APPLIED
      ↓
STATIC UI
      ↓
DOMAIN CONTRACT
      ↓
API CONNECTION
      ↓
REAL DATA
      ↓
LOADING
      ↓
EMPTY
      ↓
ERROR
      ↓
SUCCESS
      ↓
PERMISSION
      ↓
MOBILE
      ↓
ACCESSIBILITY
      ↓
TEST
      ↓
VERIFIED
```

This is what I would add to the `CODE_AGENT_MASTER_PROMPT` as the **Route Completion Contract**.

---

# ROUTE COMPLETION CONTRACT

```md
A route is not complete when its visual design exists.

For every route, the implementation agent must establish:

1. Route ownership
2. Domain ownership
3. Source of truth
4. Data contract
5. Loading state
6. Empty state
7. Error state
8. Permission state
9. Success state
10. Mutation behavior
11. Backend integration
12. Mobile behavior
13. Accessibility
14. Tests
15. Runtime verification

The frontend must never fabricate backend state to make a route appear complete.

Mock data may only be used where the route explicitly operates in demo/mock mode.
```

---

That is the bridge between the **beautiful full-page visual system** we've designed and an actual production application. The most important pages to make truly excellent are **`/app/workflows/[workflowId]`**, **`/app/runs/[executionId]`**, and **`/app/agents/[agentId]`**—because together they make the core promise of VOXFLOW visible: **define the work, let the system act, and see whether the outcome was actually achieved.**
