import { PlatformError } from './errors';
import type { WorkflowEdge, WorkflowNode } from './schemas';

export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

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

  topologicalOrder(graph);
}

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
