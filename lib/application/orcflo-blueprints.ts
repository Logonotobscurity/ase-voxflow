import { PlatformError } from '../domain/errors';
import { createId } from '../domain/events';
import { validateWorkflowGraph } from '../domain/workflow-graph';
import {
  BlueprintParameterSchema,
  BlueprintSchema,
  BlueprintInstantiateSchema,
  type BlueprintParameter,
  type BlueprintParameterType,
  type OrcfloBlueprint,
} from '../domain/orcflo';
import { WorkflowSchema, type Workflow, type WorkflowEdge, type WorkflowNode } from '../domain/schemas';
import { roleAllows, type ActorContext } from '../domain/policy';
import type { OrcfloRuntimePorts } from './ports';

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const STANDALONE_PATTERN = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;

export type BlueprintCreateFromGraphInput = {
  name: string;
  description?: string;
  parameters: Array<{
    key: string;
    label: string;
    type?: BlueprintParameterType;
    required?: boolean;
    default?: unknown;
  }>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
};

/**
 * OrcfloBlueprintService — reusable workflow templates.
 *
 * A blueprint is a `Workflow` graph with parameter slots. Two slot
 * syntaxes are supported inside node labels, configurations, edge
 * metadata and other string fields:
 *
 *   - `{{ key }}` — inline string interpolation; the value is rendered
 *     with `String(value)` into the surrounding text.
 *   - `$key` as the *entire* value of a string — typed substitution;
 *     the parameter value keeps its type (number/boolean/json).
 *
 * `instantiate` validates every required parameter, coerces values by
 * declared type, substitutes the graph, and saves a new `Workflow`
 * through the canonical workflow repository — the resulting workflow is
 * a first-class workflow that any runner (including Orcflo) can execute.
 */
export class OrcfloBlueprintService {
  constructor(private readonly ports: OrcfloRuntimePorts) {}

  async createFromGraph(context: ActorContext, input: BlueprintCreateFromGraphInput): Promise<OrcfloBlueprint> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot create blueprints.`);
    }
    validateWorkflowGraph({ nodes: input.nodes, edges: input.edges });
    const parameters = input.parameters.map((parameter) => BlueprintParameterSchema.parse(parameter));
    const placeholders = collectPlaceholders(input.nodes, input.edges);
    const declared = new Set(parameters.map((parameter) => parameter.key));
    const undeclared = [...placeholders].filter((key) => !declared.has(key));
    if (undeclared.length > 0) {
      throw new PlatformError(
        'VALIDATION_ERROR',
        `Graph references parameters without a declaration: ${undeclared.join(', ')}.`,
      );
    }
    const now = new Date().toISOString();
    const blueprint = BlueprintSchema.parse({
      id: createId('bp'),
      tenantId: context.tenantId,
      name: input.name,
      description: input.description ?? '',
      version: 1,
      parameters,
      graph: { nodes: input.nodes, edges: input.edges },
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
    await this.ports.blueprints.save(blueprint);
    return blueprint;
  }

  /** Derive a blueprint from an existing workflow, extracting `{{ key }}` slots. */
  async createFromWorkflow(context: ActorContext, input: {
    workflowId: string;
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<OrcfloBlueprint> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot create blueprints.`);
    }
    const workflow = await this.ports.workflows.findById(context.tenantId, input.workflowId);
    if (!workflow) throw new PlatformError('NOT_FOUND', `Workflow ${input.workflowId} was not found.`);
    const keys = [...collectPlaceholders(workflow.nodes, workflow.edges)].sort();
    const parameters = keys.map((key) => BlueprintParameterSchema.parse({ key, label: key, type: 'string', required: true }));
    const now = new Date().toISOString();
    const blueprint = BlueprintSchema.parse({
      id: createId('bp'),
      tenantId: context.tenantId,
      name: input.name ?? `Blueprint from ${workflow.name}`,
      description: input.description ?? `Parameterized template derived from workflow ${workflow.name}.`,
      version: 1,
      parameters,
      graph: { nodes: workflow.nodes, edges: workflow.edges },
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
    await this.ports.blueprints.save(blueprint);
    return blueprint;
  }

  async list(context: ActorContext): Promise<OrcfloBlueprint[]> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read blueprints.`);
    }
    return this.ports.blueprints.list(context.tenantId);
  }

  async findById(context: ActorContext, blueprintId: string): Promise<OrcfloBlueprint | null> {
    if (!roleAllows(context.role, 'workflow:read')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot read blueprints.`);
    }
    return this.ports.blueprints.findById(context.tenantId, blueprintId);
  }

  async instantiate(
    context: ActorContext,
    blueprintId: string,
    input: {
      values: Record<string, unknown>;
      workflowName?: string;
      status?: Workflow['status'];
      metadata?: Record<string, unknown>;
    },
  ): Promise<Workflow> {
    if (!roleAllows(context.role, 'workflow:write')) {
      throw new PlatformError('AUTHORIZATION_DENIED', `Role ${context.role} cannot instantiate blueprints.`);
    }
    const parsed = BlueprintInstantiateSchema.parse(input);
    const blueprint = await this.ports.blueprints.findById(context.tenantId, blueprintId);
    if (!blueprint) throw new PlatformError('NOT_FOUND', `Blueprint ${blueprintId} was not found.`);
    const values = this.resolveValues(blueprint.parameters, parsed.values);
    const nodes = blueprint.graph.nodes.map((node) => substituteDeep(node, values) as WorkflowNode);
    const edges = blueprint.graph.edges.map((edge) => substituteDeep(edge, values) as WorkflowEdge);
    validateWorkflowGraph({ nodes, edges });
    const now = new Date().toISOString();
    const workflow = WorkflowSchema.parse({
      id: createId('workflow'),
      tenantId: context.tenantId,
      name: parsed.workflowName ?? blueprint.name,
      description: blueprint.description,
      status: parsed.status,
      version: 1,
      nodes,
      edges,
      metadata: { ...blueprint.metadata, blueprintId, blueprintVersion: blueprint.version },
      createdAt: now,
      updatedAt: now,
    });
    await this.ports.workflows.save(workflow);
    return workflow;
  }

  private resolveValues(
    parameters: BlueprintParameter[],
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const declared = new Set(parameters.map((parameter) => parameter.key));
    const unknown = Object.keys(values).filter((key) => !declared.has(key));
    if (unknown.length > 0) {
      throw new PlatformError('VALIDATION_ERROR', `Values provided for undeclared parameters: ${unknown.join(', ')}.`);
    }
    const resolved: Record<string, unknown> = {};
    for (const parameter of parameters) {
      const provided = Object.prototype.hasOwnProperty.call(values, parameter.key);
      if (provided) {
        resolved[parameter.key] = coerceValue(parameter.type, values[parameter.key], parameter.key);
      } else if (parameter.default !== undefined) {
        resolved[parameter.key] = coerceValue(parameter.type, parameter.default, parameter.key);
      } else if (parameter.required) {
        throw new PlatformError('VALIDATION_ERROR', `Missing value for required parameter "${parameter.key}".`);
      }
    }
    return resolved;
  }
}

function collectPlaceholders(nodes: WorkflowNode[], edges: WorkflowEdge[]): Set<string> {
  const keys = new Set<string>();
  const serialized = JSON.stringify({ nodes, edges });
  for (const match of serialized.matchAll(PLACEHOLDER_PATTERN)) {
    keys.add(match[1]);
  }
  return keys;
}

function coerceValue(type: BlueprintParameterType, value: unknown, key: string): unknown {
  switch (type) {
    case 'string':
      return String(value);
    case 'number': {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) {
        throw new PlatformError('VALIDATION_ERROR', `Parameter "${key}" must be a number.`);
      }
      return number;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new PlatformError('VALIDATION_ERROR', `Parameter "${key}" must be a boolean.`);
    }
    case 'json': {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          throw new PlatformError('VALIDATION_ERROR', `Parameter "${key}" must be valid JSON.`);
        }
      }
      return value;
    }
    default:
      throw new PlatformError('VALIDATION_ERROR', `Unsupported parameter type for "${key}".`);
  }
}

function substituteDeep(value: unknown, values: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const standalone = STANDALONE_PATTERN.exec(value);
    if (standalone && Object.prototype.hasOwnProperty.call(values, standalone[1])) {
      return values[standalone[1]];
    }
    return value.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
      const replacement = values[key];
      return replacement === undefined ? _match : String(replacement);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteDeep(item, values));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, substituteDeep(entryValue, values)]),
    );
  }
  return value;
}
