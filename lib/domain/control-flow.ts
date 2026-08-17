import { PlatformError } from './errors';
import type { WorkflowEdge } from './schemas';

/**
 * Deterministic control-flow primitives for the Orcflo workflow engine.
 *
 * Everything here is pure: same input, same decision, always. Critical
 * business conditions are evaluated in code, never by an LLM
 * (WORKFLOW ENGINE & VISUAL AUTOMATION DIRECTIVE §12). Expression
 * syntax is a single, standardized dot-path reference resolved against
 * the run context `{ ...run.input, ...nodeOutputs }`.
 */

export type ConditionConfig = {
  /** Dot-path into the run context, e.g. `score`, `customer.tier`, `outputs.router_1.route`. */
  path: string;
  op?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'truthy';
  value?: unknown;
};

export type RouterRouteConfig = {
  key: string;
  label?: string;
};

export type RouterConfig = {
  routes: RouterRouteConfig[];
  /** Dot-path to the routing value; default `route`. */
  pickPath?: string;
  defaultRoute?: string;
};

/** Resolve a dot-path reference inside a context object. */
export function resolvePath(input: unknown, path: string): unknown {
  if (typeof path !== 'string' || path.trim() === '') return undefined;
  let current: unknown = input;
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/** Deterministic condition evaluation for `condition` nodes. */
export function evaluateCondition(config: Record<string, unknown>, input: Record<string, unknown>): { result: boolean } {
  const path = typeof config.path === 'string' && config.path.trim() !== '' ? config.path : undefined;
  if (!path) {
    throw new PlatformError('WORKFLOW_ERROR', 'A condition node requires configuration.path.');
  }
  const op = typeof config.op === 'string' ? config.op : 'truthy';
  const actual = resolvePath(input, path);
  const expected = config.value;
  let result: boolean;
  switch (op) {
    case 'eq':
      result = actual === expected;
      break;
    case 'neq':
      result = actual !== expected;
      break;
    case 'gt':
      result = typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      break;
    case 'gte':
      result = typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      break;
    case 'lt':
      result = typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      break;
    case 'lte':
      result = typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      break;
    case 'exists':
      result = actual !== undefined;
      break;
    case 'truthy':
      result = Boolean(actual);
      break;
    default:
      throw new PlatformError('WORKFLOW_ERROR', `Unsupported condition op "${op}".`);
  }
  return { result };
}

/** Deterministic structured route selection for `router` nodes. */
export function selectRoute(config: Record<string, unknown>, input: Record<string, unknown>): { route: string } {
  const routes = Array.isArray(config.routes) ? (config.routes as RouterRouteConfig[]) : [];
  if (routes.length === 0) {
    throw new PlatformError('WORKFLOW_ERROR', 'A router node requires configuration.routes.');
  }
  const pickPath = typeof config.pickPath === 'string' && config.pickPath.trim() !== '' ? config.pickPath : 'route';
  const defaultRoute = typeof config.defaultRoute === 'string' ? config.defaultRoute : undefined;
  const raw = resolvePath(input, pickPath);
  if (raw === undefined || raw === null) {
    if (defaultRoute !== undefined) return { route: defaultRoute };
    throw new PlatformError('WORKFLOW_ERROR', `Router found no value at "${pickPath}" and no defaultRoute is configured.`);
  }
  const key = String(raw);
  if (routes.some((route) => route.key === key)) return { route: key };
  if (defaultRoute !== undefined) return { route: defaultRoute };
  throw new PlatformError('WORKFLOW_ERROR', `Router matched no route for value "${key}" and no defaultRoute is configured.`);
}

/** Resolve the collection a `for_each` head iterates. Missing path -> empty collection. */
export function resolveCollection(input: Record<string, unknown>, path: string): unknown[] {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new PlatformError('WORKFLOW_ERROR', 'A for_each node requires configuration.collection.');
  }
  const value = resolvePath(input, path);
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PlatformError('WORKFLOW_ERROR', `for_each collection at "${path}" is not an array.`);
  }
  return value;
}

/**
 * Edge guard for non-control sources. `edge.condition === true` fires
 * when the source output (or its `result` field) is truthy; `false`
 * fires when falsy; no condition always fires.
 */
export function edgeGuardFires(edge: WorkflowEdge, sourceOutput: unknown): boolean {
  if (edge.condition === undefined) return true;
  const result = (
    sourceOutput !== null
    && typeof sourceOutput === 'object'
    && 'result' in (sourceOutput as Record<string, unknown>)
  )
    ? (sourceOutput as Record<string, unknown>).result
    : sourceOutput;
  return edge.condition === true ? Boolean(result) : !Boolean(result);
}
