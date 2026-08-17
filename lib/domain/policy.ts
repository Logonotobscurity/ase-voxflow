import type { Agent, TenantRole, ToolDefinition, ToolRisk, WorkflowNode } from './schemas';

export type ActorContext = {
  tenantId: string;
  actorId: string;
  role: TenantRole;
  correlationId: string;
  environment: 'demo' | 'development' | 'staging' | 'production';
};

export type PolicyDecision =
  | { outcome: 'allow'; reason: string }
  | { outcome: 'deny'; reason: string }
  | { outcome: 'require_approval'; reason: string };

const rolePermissions: Record<TenantRole, readonly string[]> = {
  ADMIN: ['*'],
  BUILDER: ['agent:read', 'agent:write', 'agent:run', 'workflow:read', 'workflow:write', 'workflow:execute', 'tool:read', 'tool:invoke'],
  OPERATOR: ['agent:read', 'agent:run', 'workflow:read', 'workflow:execute', 'tool:read', 'tool:invoke'],
  APPROVER: ['agent:read', 'workflow:read', 'approval:decide', 'workflow:execute', 'transaction:authorize'],
  VIEWER: ['agent:read', 'workflow:read'],
  // §34 — synthetic role for anonymous public-interface callers. It may
  // execute the interface's workflow and nothing else; it is never a
  // membership role and cannot read or write tenant resources.
  PUBLIC: ['workflow:execute'],
};

export function roleAllows(role: TenantRole, permission: string): boolean {
  const granted = rolePermissions[role];
  return granted.includes('*') || granted.includes(permission);
}

export function evaluateToolPolicy(
  agent: Agent,
  tool: ToolDefinition,
  context: ActorContext,
): PolicyDecision {
  if (agent.tenantId !== context.tenantId || tool.tenantId !== context.tenantId) {
    return { outcome: 'deny', reason: 'Tenant boundary mismatch.' };
  }
  if (agent.status !== 'RUNNING') {
    return { outcome: 'deny', reason: `Agent must be RUNNING; current state is ${agent.status}.` };
  }
  if (!agent.policies.allowedEnvironments.includes(context.environment)) {
    return { outcome: 'deny', reason: `Agent is not permitted in ${context.environment}.` };
  }
  if (!roleAllows(context.role, 'tool:invoke')) {
    return { outcome: 'deny', reason: `Role ${context.role} cannot invoke tools.` };
  }
  if (!agent.toolIds.includes(tool.id) && !agent.toolIds.includes(tool.name)) {
    return { outcome: 'deny', reason: `Tool ${tool.name} is not assigned to this agent.` };
  }
  if (tool.permissions.some((permission) => !agent.permissions.includes(permission))) {
    return { outcome: 'deny', reason: `Agent lacks a permission required by ${tool.name}.` };
  }
  if (tool.availability === 'UNAVAILABLE') {
    return { outcome: 'deny', reason: `Tool ${tool.name} is unavailable.` };
  }
  if (requiresApproval(tool.riskLevel, agent.policies.requireApprovalFor, tool.name)) {
    return { outcome: 'require_approval', reason: `Tool ${tool.name} requires explicit approval.` };
  }
  return { outcome: 'allow', reason: 'Policy checks passed.' };
}

export function evaluateWorkflowNodePolicy(node: WorkflowNode, context: ActorContext): PolicyDecision {
  if (!roleAllows(context.role, 'workflow:execute')) {
    return { outcome: 'deny', reason: `Role ${context.role} cannot execute workflows.` };
  }
  if (node.type === 'human_approval' || node.type === 'transaction') {
    return { outcome: 'require_approval', reason: `${node.label} requires a human approval.` };
  }
  if (node.type === 'mcp' && node.configuration.trusted !== true) {
    return { outcome: 'deny', reason: 'Untrusted MCP servers cannot be invoked.' };
  }
  return { outcome: 'allow', reason: 'Node policy checks passed.' };
}

function requiresApproval(risk: ToolRisk, configured: readonly string[], toolName: string): boolean {
  return risk === 'CRITICAL' || configured.includes(toolName) || configured.includes(`risk:${risk}`);
}
