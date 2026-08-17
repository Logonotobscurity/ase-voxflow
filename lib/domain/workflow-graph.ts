import { PlatformError } from './errors';
import type { WorkflowEdge, WorkflowNode } from './schemas';

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

/**
 * Validate a workflow graph for execution.
 *
 * Plain DAG rules: unique node/edge ids, known endpoints, no self
 * edges, no cycles.
 *
 * Orcflo control flow (§45 of the WORKFLOW ENGINE & VISUAL AUTOMATION
 * DIRECTIVE): a cycle is acceptable ONLY when it is a bounded loop —
 * every cycle-forming edge is marked `loop: true` and targets a
 * `for_each` node, and that head has at least one `loopExit` edge so
 * the loop can terminate. Nested loops are rejected in this increment.
 * Router edges must carry a `sourceHandle` matching a declared route.
 */
export function validateWorkflowGraph(graph: WorkflowGraph): void {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      throw new PlatformError('WORKFLOW_ERROR', `Duplicate workflow node id: ${node.id}.`);
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new PlatformError('WORKFLOW_ERROR', `Duplicate workflow edge id: ${edge.id}.`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new PlatformError('WORKFLOW_ERROR', `Edge ${edge.id} references an unknown node.`);
    }
    if (edge.source === edge.target) {
      throw new PlatformError('WORKFLOW_ERROR', `Edge ${edge.id} cannot connect a node to itself.`);
    }
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const loopEdges = graph.edges.filter((edge) => edge.loop === true);
  const nonLoopEdges = graph.edges.filter((edge) => edge.loop !== true);

  // Loop edges must point at a for_each head.
  for (const edge of loopEdges) {
    if (nodeById.get(edge.target)?.type !== 'for_each') {
      throw new PlatformError(
        'WORKFLOW_ERROR',
        `Loop edge ${edge.id} must target a for_each node. Only bounded loops may form cycles.`,
      );
    }
  }

  // Loop exit edges must originate from a for_each head.
  for (const edge of graph.edges) {
    if (edge.loopExit === true && nodeById.get(edge.source)?.type !== 'for_each') {
      throw new PlatformError(
        'WORKFLOW_ERROR',
        `Loop exit edge ${edge.id} must originate from a for_each node.`,
      );
    }
  }

  // The non-loop graph must be acyclic.
  topologicalOrder({ nodes: graph.nodes, edges: nonLoopEdges });

  // Every for_each head that is a loop target needs an exit path.
  const loopHeadIds = new Set(loopEdges.map((edge) => edge.target));
  for (const headId of loopHeadIds) {
    const hasExit = graph.edges.some((edge) => edge.source === headId && edge.loopExit === true);
    if (!hasExit) {
      throw new PlatformError(
        'WORKFLOW_ERROR',
        `for_each loop head ${headId} has no loopExit edge; the loop can never terminate.`,
      );
    }
  }

  // Nested loops are not supported in this increment: no for_each head
  // may be reachable from another head's body.
  for (const headId of loopHeadIds) {
    const reachable = reachableNodes(headId, nonLoopEdges);
    for (const other of loopHeadIds) {
      if (other !== headId && reachable.has(other)) {
        throw new PlatformError(
          'WORKFLOW_ERROR',
          `Nested for_each loops are not supported: loop head ${other} is reachable from loop head ${headId}.`,
        );
      }
    }
  }

  // Router edges must carry a sourceHandle matching a declared route.
  for (const node of graph.nodes) {
    if (node.type !== 'router') continue;
    const routes = Array.isArray(node.configuration.routes) ? node.configuration.routes : [];
    const routeKeys = new Set(
      routes
        .map((route) => (typeof route === 'object' && route !== null ? (route as { key?: unknown }).key : undefined))
        .filter((key): key is string => typeof key === 'string'),
    );
    if (routeKeys.size === 0) {
      throw new PlatformError('WORKFLOW_ERROR', `Router node ${node.id} must declare configuration.routes with at least one key.`);
    }
    for (const edge of graph.edges.filter((candidate) => candidate.source === node.id)) {
      if (typeof edge.sourceHandle !== 'string' || !routeKeys.has(edge.sourceHandle)) {
        throw new PlatformError(
          'WORKFLOW_ERROR',
          `Router edge ${edge.id} must carry sourceHandle matching one of the declared routes on ${node.id}.`,
        );
      }
    }
  }
}

/** Topological order of the (acyclic) graph; throws on a cycle. */
export function topologicalOrder(graph: WorkflowGraph): WorkflowNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    const node = byId.get(id);
    if (node) ordered.push(node);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  if (ordered.length !== graph.nodes.length) {
    throw new PlatformError('WORKFLOW_ERROR', 'Workflow graph contains a cycle.');
  }
  return ordered;
}

function reachableNodes(source: string, edges: WorkflowEdge[]): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const seen = new Set<string>();
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const target of outgoing.get(current) ?? []) {
      if (!seen.has(target)) queue.push(target);
    }
  }
  seen.delete(source);
  return seen;
}
