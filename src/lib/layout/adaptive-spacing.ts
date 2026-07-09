/**
 * Pre-ELK helper: scales node-node spacing up for a hierarchy level that
 * contains a degree outlier (a hub with far more neighbors than its
 * siblings). ELK's 'layered' algorithm uses a single fixed spacing value
 * for every level regardless of how many edges converge on a node — a hub
 * with 6 neighbors gets the same 40px gap as a simple chain, so its
 * neighbors end up packed tightly around it with no room for edges/labels
 * to separate. Widening the whole level's spacing when a hub is present
 * gives every edge on that level more room, without touching levels that
 * don't need it.
 */

export interface SpacingNode {
  id: string;
}

export interface SpacingEdge {
  source: string;
  target: string;
}

export interface AdaptiveSpacingOptions {
  /** Spacing used when no node exceeds baselineDegree. */
  baseSpacing?: number;
  /** Extra px added per unit of degree beyond baselineDegree. */
  perNeighborExtra?: number;
  /** Degree at or below which a node needs no extra spacing. */
  baselineDegree?: number;
}

export function computeAdaptiveSpacing(
  nodes: SpacingNode[],
  edges: SpacingEdge[],
  options: AdaptiveSpacingOptions = {}
): number {
  const { baseSpacing = 40, perNeighborExtra = 15, baselineDegree = 2 } = options;

  if (nodes.length === 0) return baseSpacing;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const neighbors = new Map<string, Set<string>>(
    nodes.map((n) => [n.id, new Set<string>()])
  );

  for (const edge of edges) {
    if (edge.source === edge.target) continue; // self-loop: not a neighbor
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue; // external endpoint

    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }

  let maxDegree = 0;
  for (const set of neighbors.values()) {
    if (set.size > maxDegree) maxDegree = set.size;
  }

  const extraDegree = Math.max(0, maxDegree - baselineDegree);
  return baseSpacing + perNeighborExtra * extraDegree;
}
