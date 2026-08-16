# VOXFLOW — TOOL & MCP SPECIFICATION

Version: 1.0
Status: Foundational
Depends On:
- DEVELOPMENT_SPEC.md
- CODE_AGENT_MASTER_PROMPT.md
- ARCHITECTURE_DECISIONS.md
- EXECUTION_KERNEL_SPEC.md
- AGENT_RUNTIME_SPEC.md

Purpose:
Define the canonical capability layer through which agents, workflows and
applications interact with APIs, databases, MCP servers, code execution,
external services and other executable capabilities.

---

# 01. PURPOSE

Tools are the action layer of VOXFLOW.

Agents reason.

Workflows orchestrate.

Tools act.

The tool layer translates intent into controlled, observable execution.

Core model:

```text
AGENT / WORKFLOW
       │
       ▼
 TOOL RESOLUTION
       │
       ▼
 PERMISSION / POLICY
       │
       ▼
 INPUT VALIDATION
       │
       ▼
 EXECUTION KERNEL
       │
       ▼
 TOOL EXECUTOR
       │
       ▼
 EXTERNAL SYSTEM
       │
       ▼
 RESULT VALIDATION
       │
       ▼
 EXECUTION CONTEXT
```

# 02. CANONICAL TOOL PRINCIPLE

There must be one conceptual tool system.

The same tool may be used by:

```text
an agent
a workflow
an API
a scheduled job
a voice command
a vision-triggered action
another workflow
another agent
```

Do not create separate:

```text
agent tools
workflow tools
voice tools
MCP tools
```

systems.

They should converge on the same tool abstraction.

# 03. TOOL CONTRACT

Where no equivalent abstraction exists, use a contract conceptually similar to:

```ts
interface ToolDefinition {
  id: string;
  name: string;
  description: string;

  inputSchema: unknown;
  outputSchema: unknown;

  riskLevel: ToolRiskLevel;

  permissions: ToolPermission[];

  timeoutMs?: number;

  retryPolicy?: RetryPolicy;

  metadata?: Record<string, unknown>;
}
```

Execution:

```ts
interface ToolExecutor {
  execute(
    input: unknown,
    context: ExecutionContext
  ): Promise<ToolResult>;
}
```

If the repository already contains an equivalent interface, reuse and
improve it rather than introducing another one.

# 04. TOOL METADATA

Every executable capability should expose enough metadata for the
runtime to make a safe selection.

Minimum conceptual metadata:

```text
id
name
description
input schema
output schema
risk level
permissions
timeout
availability
version
provider
```

Optional:

```text
cost
latency
rate limits
tenant scope
supported models
tags
health
```

# 05. TOOL IDENTITY

Every tool needs a stable identity.

Do not identify tools solely by display name.

Prefer:

```text
tool_id
provider
version
```

This prevents ambiguity when multiple providers expose similar capabilities.

# 06. TOOL VERSIONS

A tool may evolve.

Where changes can affect behavior, version it.

Example:

```text
salesforce.create_contact@v1
salesforce.create_contact@v2
```

Execution history should retain the tool version used.

# 07. TOOL RISK LEVEL

Every tool should have a risk classification.

Suggested levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Examples:

```text
LOW:

read public web page
format text
```

```text
MEDIUM:

read internal CRM data
```

```text
HIGH:

modify customer records
send email
```

```text
CRITICAL:

financial transaction
destructive infrastructure action
```

Risk classification must be enforced by policy.

# 08. TOOL PERMISSIONS

Permissions should answer:

Who is allowed to invoke this capability?

Possible dimensions:

```text
tenant
user
agent
workflow
role
environment
resource
operation
```

Example:

```text
Agent:
research-agent
```

```text
Allowed:
crm.read
```

```text
Denied:
crm.delete
payments.create
```

# 09. TOOL AUTHORIZATION

Authorization flow:

```text
Caller
 ↓
Resolve Tool
 ↓
Identity
 ↓
Tenant
 ↓
Permission
 ↓
Policy
 ↓
Budget
 ↓
Approval
 ↓
Execution
```

Authorization must happen server-side.

# 10. TOOL INPUT VALIDATION

Every tool invocation must validate input before execution.

```text
Caller Input
 ↓
Schema Validation
 ↓
Normalization
 ↓
Policy Validation
 ↓
Execution
```

Never pass arbitrary model-generated arguments directly to an external service.

# 11. TOOL OUTPUT VALIDATION

External responses are untrusted.

Flow:

```text
External Service
 ↓
Raw Response
 ↓
Schema Validation
 ↓
Normalization
 ↓
Tool Result
 ↓
Agent / Workflow Context
```

Malformed results must become controlled tool failures.

# 12. TOOL RESULT

Conceptually:

```ts
ToolResult {
  status: "success" | "failure" | "waiting";

  output?: unknown;

  error?: ToolError;

  metadata?: {
    provider?: string;
    durationMs?: number;
    attempt?: number;
    requestId?: string;
  };
}
```

The actual implementation should follow existing project conventions.

# 13. TOOL EXECUTION BOUNDARY

Tools must not directly modify arbitrary application state.

Preferred:

```text
Tool
 ↓
Execution Kernel
 ↓
Application Service
 ↓
Persistence / External System
```

This preserves policy and observability.

# 14. INTERNAL TOOLS

Internal tools may wrap existing application services.

Example:

```text
Tool:
createWorkflow

      ↓

WorkflowApplicationService.create()
```

Do not duplicate domain logic inside the tool.

# 15. HTTP TOOL

An HTTP tool should use the platform's canonical HTTP infrastructure.

It should support:

```text
method
URL
query
headers
body
timeout
retry
authentication
response validation
```

HTTP tools must include SSRF protections.

# 16. DATABASE TOOL

Database tools must not expose unrestricted database access to agents.

Prefer explicit operations:

```text
customers.search
customers.get
orders.get
inventory.lookup
```

over:

```text
database.execute(rawSQL)
```

unless raw SQL is explicitly sandboxed and authorized.

# 17. CODE EXECUTION TOOL

Code execution is high risk.

If supported, it must run in an isolated execution environment.

Minimum controls:

```text
timeout
memory limit
CPU limit
filesystem restriction
network restriction
package restriction
output limit
credential isolation
process termination
```

Never run untrusted generated code directly inside the main application process.

# 18. EMAIL TOOL

Email capabilities should be provider adapters.

Conceptually:

```text
Email Tool
    ↓
Provider Adapter
    ↓
Email Service
```

Support:

```text
recipients
subject
body
attachments
templates
```

Sending may require approval depending on policy.

# 19. WEB SEARCH TOOL

Search should produce structured results.

Example:

```json
{
  "query": "...",
  "results": [
    {
      "title": "...",
      "url": "...",
      "snippet": "..."
    }
  ]
}
```

External page text is untrusted content.

Do not treat search results as executable instructions.

# 20. WEB CRAWL TOOL

Crawling should remain distinct from search.

Search discovers.

Crawl retrieves.

Apply:

```text
domain policies
URL validation
SSRF protection
size limits
timeout
content-type validation
```

# 21. CONTENT EXTRACTION

Document/content extraction tools may produce:

```text
text
metadata
tables
entities
sections
confidence
```

Extracted content is DATA, not INSTRUCTIONS.

# 22. CONNECTED APPLICATIONS

Connected applications should use explicit provider adapters.

Example:

```text
Salesforce
HubSpot
SAP
Slack
Google
Stripe
```

The core tool runtime should not contain vendor-specific business logic where an adapter can isolate it.

# 23. PROVIDER ADAPTER

Conceptual structure:

```text
Tool Definition
      │
      ▼
Provider Adapter
      │
      ▼
Provider API
```

This allows providers to be swapped without changing workflow semantics.

# 24. SMARTPROXY

The earlier SmartProxy concept belongs here as infrastructure, not as a business-domain object.

Conceptual responsibilities:

```text
SmartProxy
 ├── protectedFetch()
 ├── batchRequests()
 ├── authentication
 ├── timeout
 ├── retry
 ├── connection pooling
 ├── rate limiting
 ├── circuit breaking
 ├── telemetry
 └── error normalization
```

The repository's existing HTTP client should be inspected first.

If it already provides these responsibilities, improve it rather than creating a second SmartProxy implementation.

# 25. PROTECTED FETCH

A protected HTTP request should conceptually perform:

```text
Request
 ↓
URL Validation
 ↓
SSRF Protection
 ↓
Authentication
 ↓
Policy
 ↓
Timeout
 ↓
Rate Limit
 ↓
HTTP Request
 ↓
Response Validation
```

# 26. RETRYABLE HTTP ERRORS

Retries should be based on classification.

Potential retry cases:

```text
transient network failure
timeout
selected 5xx
provider rate limiting
```

Usually non-retryable:

```text
invalid input
unauthorized
forbidden
missing resource
```

Provider-specific semantics must be respected.

# 27. IDEMPOTENCY

Mutating HTTP operations should support idempotency where the provider supports it.

Example:

```text
POST /payments
Idempotency-Key: execution_123_node_45
```

Never blindly retry a mutation without considering duplicate side effects.

# 28. BATCH REQUESTS

Batch requests should support:

```text
bounded concurrency
per-request result
partial failure
retry classification
cancellation
progress tracking
```

Never launch unlimited concurrent HTTP requests.

# 29. CONNECTION POOLING

Long-running workers should reuse HTTP connections where appropriate.

Do not create a new HTTP client per request unless the library/runtime specifically requires it.

# 30. RATE LIMITING

Rate limits may exist at:

```text
provider
tenant
agent
workflow
tool
endpoint
```

Use the smallest appropriate scope.

# 31. CIRCUIT BREAKING

External providers may use circuit breaking.

The breaker should exist around the provider boundary, not inside arbitrary business logic.

# 32. ERROR NORMALIZATION

External provider errors must become canonical internal errors.

Conceptual mapping:

```text
Provider Error
      ↓
Provider Adapter
      ↓
Tool Error
      ↓
Execution Error
```

Preserve original provider metadata where useful, but do not expose secrets.

# 33. MCP

MCP is an interoperability mechanism.

It should integrate through the Tool Registry.

```text
Agent
 ↓
Tool Registry
 ↓
MCP Adapter
 ↓
MCP Server
 ↓
MCP Tool
```

The agent must not need to know whether a capability is MCP-native.

# 34. MCP SERVER REGISTRY

Maintain a controlled registry of MCP servers.

Conceptually:

```text
MCP Server
 ├── id
 ├── name
 ├── transport
 ├── endpoint
 ├── authentication
 ├── tenant
 ├── trust level
 ├── status
 └── metadata
```

# 35. MCP SERVER TRUST

Do not assume MCP servers are trustworthy.

Classify them:

```text
TRUSTED
VERIFIED
UNVERIFIED
BLOCKED
```

Tool access should depend on trust level and policy.

# 36. MCP TOOL DISCOVERY

When connecting to an MCP server:

```text
Connect
 ↓
Authenticate
 ↓
Discover Tools
 ↓
Validate Schemas
 ↓
Classify Risk
 ↓
Apply Policy
 ↓
Register
```

Do not automatically expose every discovered capability to every agent.

# 37. MCP RESOURCE SECURITY

MCP resources and tool responses are untrusted external content.

Apply:

```text
schema validation
size limits
sanitization where appropriate
content trust boundaries
prompt-injection protections
```

# 38. MCP AUTHENTICATION

Authentication must be handled securely.

Credentials must not be stored in:

```text
prompts
workflow node text
agent instructions
client-side JavaScript
```

Use the platform's secure credential mechanism.

# 39. MCP SERVER LIFECYCLE

Support conceptually:

```text
REGISTERED
 ↓
CONNECTING
 ↓
CONNECTED
 ↓
AVAILABLE
 ↓
DEGRADED
 ↓
DISCONNECTED
 ↓
BLOCKED
```

# 40. MCP HEALTH

The system should know whether an MCP server is:

```text
available
unavailable
degraded
unauthorized
misconfigured
```

Agents should not continuously attempt unavailable tools.

# 41. DYNAMIC TOOL CREATION

Dynamically generated tools must pass through the same registry and governance system as static tools.

```text
Generate
 ↓
Validate
 ↓
Security Check
 ↓
Permissions
 ↓
Sandbox
 ↓
Test
 ↓
Register
```

Dynamic tools do not receive special trust because they were generated internally.

# 42. TOOL COMPOSITION

Tools may be composed into higher-level capabilities.

Example:

```text
Search Tool
 +
Extract Tool
 +
Score Tool
 =
Lead Research Capability
```

Composition should preferably be represented as workflows instead of embedding large orchestration logic inside tools.

# 43. TOOL VS WORKFLOW

Use a Tool when:

```text
operation is atomic
capability is reusable
action has a stable contract
```

Use a Workflow when:

```text
multiple steps exist
branching exists
human approval exists
retries span multiple operations
orchestration is meaningful
```

Do not turn every workflow into a tool implementation.

# 44. TOOL VS AGENT

Use a Tool when:

```text
execution is deterministic
clear input/output
no independent reasoning required
```

Use an Agent when:

```text
interpretation is required
planning is required
dynamic decisions are required
multiple tools may be chosen
```

# 45. TRANSACTION TOOL

Financial or economically consequential operations should use an explicit transaction abstraction.

Example:

```text
Agent
 ↓
Transaction Proposal
 ↓
Risk
 ↓
Permission
 ↓
Budget
 ↓
Approval
 ↓
Transaction Executor
 ↓
Verification
```

Never treat a payment as an ordinary HTTP request.

# 46. TRANSACTION STATE

Conceptually:

```text
CREATED
AUTHORIZED
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
REVERSED
```

The repository's existing transaction model remains authoritative.

# 47. TRANSACTION HISTORY

Transactions should provide an auditable history.

Track:

```text
creator
agent
workflow
authorization
attempts
provider
result
timestamps
```

# 48. SPENDING ANALYTICS

Where economic agents exist, usage should be traceable by:

```text
tenant
agent
workflow
tool
transaction
provider
```

# 49. WEBHOOKS

Tool providers may emit webhooks.

Webhook processing must use:

```text
signature verification
input validation
idempotency
event normalization
execution routing
```

Never trust arbitrary webhook payloads.

# 50. ENDPOINT INTERFACE

Endpoints represent external callable capabilities.

Conceptually:

```text
Endpoint
 ├── id
 ├── name
 ├── method
 ├── URL
 ├── schema
 ├── authentication
 ├── timeout
 ├── retry
 └── policy
```

# 51. ENDPOINT MANAGEMENT

The platform may eventually expose:

```text
createEndpoint()
updateEndpoint()
getEndpoint()
listEndpoints()
deleteEndpoint()
```

But only use these names if they match the project's public API conventions.

# 52. ENDPOINT VALIDATION

Before invoking an endpoint:

```text
Resolve
 ↓
Authenticate
 ↓
Validate
 ↓
Policy
 ↓
Execute
 ↓
Validate Response
```

# 53. TOOL OBSERVABILITY

Every tool invocation should generate sufficient metadata to answer:

```text
Which tool?
Which provider?
Who requested it?
Which agent?
Which workflow?
What was the duration?
What was the result?
Was it retried?
What did it cost?
```

# 54. TOOL EVENTS

Recommended:

```text
ToolRequested
ToolAuthorized
ToolDenied
ToolStarted
ToolCompleted
ToolFailed
ToolRetrying
ToolTimedOut
ToolRateLimited
```

# 55. TOOL CACHING

Caching may be used for safe, repeatable read operations.

Never cache sensitive or mutable responses without explicit policy.

Caching must respect:

```text
tenant isolation
authorization
freshness requirements
invalidation
```

# 56. TOOL TIMEOUTS

Every external tool invocation should have a bounded timeout.

Timeout values should be configurable by tool/provider.

Do not allow arbitrary external calls to wait forever.

# 57. TOOL CONCURRENCY

The runtime must respect concurrency limits.

Example:

```text
Tenant: 50 concurrent calls
Provider: 10 concurrent calls
Tool: 5 concurrent calls
```

The most restrictive applicable limit should win.

# 58. TOOL HEALTH

Tool health should be visible to orchestration where appropriate.

Possible states:

```text
AVAILABLE
DEGRADED
UNAVAILABLE
BLOCKED
```

The planner may use health metadata when selecting among equivalent tools.

# 59. TOOL FALLBACK

Multiple tools may implement similar capabilities.

Example:

```text
Primary Search
 ↓ unavailable
Fallback Search
```

Fallback selection must be policy-driven.

# 60. TOOL DISCOVERY

Agents should not receive an enormous unfiltered tool list.

Discovery should consider:

```text
task
capabilities
permissions
risk
tenant
availability
cost
```

# 61. TOOL DESCRIPTION QUALITY

Tool descriptions are part of the agent interface.

They should clearly state:

```text
what the tool does
what it accepts
what it returns
constraints
side effects
risk
```

Avoid ambiguous descriptions.

# 62. TOOL SCHEMA DESIGN

Input schemas should:

```text
reject invalid data
define required fields
define formats
constrain sizes
identify enums
avoid unnecessary optionality
```

Output schemas should identify stable fields where possible.

# 63. TOOL VERSION COMPATIBILITY

When changing a tool schema in a breaking way:

```text
create a new version
preserve historical executions
migrate consumers explicitly
```

Do not silently alter a production tool contract.

# 64. TENANT-SCOPED TOOLS

A tool can be:

```text
SYSTEM-WIDE
TENANT-SPECIFIC
USER-SPECIFIC
AGENT-SPECIFIC
```

The runtime must enforce its scope.

# 65. SECRET MANAGEMENT

Credentials belong in secure infrastructure.

Never store credentials inside:

```text
source code
prompts
workflow definitions
blueprint exports
agent memory
client-side configuration
```

BluePrint export must redact secrets.

# 66. TOOL POLICY ENGINE

Before execution:

```text
Tool Request
 ↓
Permission
 ↓
Risk
 ↓
Budget
 ↓
Environment
 ↓
Policy
 ↓
Approval
 ↓
Execute
```

The policy engine is deterministic.

# 67. DEVELOPMENT RULE

The coding agent MUST inspect the existing repository before creating:

```text
ToolRegistry
SmartProxy
EndpointService
MCPClient
TransactionService
ToolExecutor
ProviderAdapter
```

An equivalent may already exist.

Reuse it.

# 68. TESTING

Required tests include:

```text
Tool
schema validation
authorization
execution
timeout
retry
malformed response
```

```text
HTTP
SSRF protection
timeout
retry
rate limiting
circuit breaking
```

```text
MCP
connection
discovery
schema validation
tool execution
server failure
```

```text
Transactions
authorization
idempotency
duplicate prevention
state transitions
```

# 69. SECURITY TESTING

Test:

```text
SSRF
credential leakage
tool injection
prompt injection
malicious MCP server
malformed tool schema
unauthorized tool access
cross-tenant access
replayed webhook
duplicated transaction
```

# 70. ACCEPTANCE CRITERIA

The tool layer is successful when:

```text
[ ] agents and workflows use the same tool abstraction

[ ] tool inputs are validated

[ ] tool outputs are validated

[ ] permissions are enforced

[ ] tool risk is represented

[ ] external failures are normalized

[ ] retries are controlled

[ ] idempotency is supported where required

[ ] MCP integrates through the tool system

[ ] SmartProxy responsibilities are centralized

[ ] credentials are securely managed

[ ] tool execution is observable

[ ] transactions have stronger controls than ordinary tools

[ ] tool tests exist

[ ] MCP tests exist

[ ] security tests exist
```

FINAL PRINCIPLE

Tools are the hands of VOXFLOW.

They must therefore be:

```text
CAPABLE
+
CONTROLLED
+
OBSERVABLE
+
VALIDATED
+
RELIABLE
+
REVERSIBLE WHERE POSSIBLE
```

Agents may decide what should happen.

Tools must never decide what they are allowed to do.

The execution kernel remains the final execution authority.
