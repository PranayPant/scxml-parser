/**
 * Post-ELK positioning helper: nudges hub nodes (nodes whose degree is a
 * clear outlier relative to their siblings) toward the horizontal centroid
 * of their connected neighbors.
 *
 * ELK's 'layered' algorithm (used for the default per-level layout) assigns
 * positions by layer and crossing minimization — it has no notion of "this
 * node has far more neighbors than everyone else, keep it centered among
 * them". A hub can end up off to one side of its spokes, forcing every edge
 * on that side into a long detour. This is a small, local correction applied
 * only to genuine outliers, leaving ordinary layout untouched.
 */

export interface HubNudgeNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HubNudgeEdge {
  source: string;
  target: string;
}

export interface HubCentroidNudgeOptions {
  /** Minimum absolute degree required before a node can be considered a hub. */
  minDegree?: number;
  /** A node's degree must be at least this many times the group's average degree. */
  outlierMultiplier?: number;
  /**
   * Minimum horizontal gap to keep between a nudged hub and any other node
   * sharing its row — matches the row's own node-node spacing so a nudged
   * hub doesn't end up sitting flush against a neighbor with no room for
   * edges/labels between them.
   */
  minGap?: number;
}

/**
 * Returns a map of nodeId -> new {x, y} for nodes classified as hubs. Nodes
 * not present in the map should keep their original ELK position. Only x
 * changes (y is echoed back unchanged) so vertical layering is preserved.
 */
export function computeHubCentroidNudges(
  nodes: HubNudgeNode[],
  edges: HubNudgeEdge[],
  options: HubCentroidNudgeOptions = {},
): Map<string, { x: number; y: number }> {
  debugger;
  const { minDegree = 3, outlierMultiplier = 2, minGap = 40 } = options;

  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>(
    nodes.map((n) => [n.id, new Set<string>()]),
  );

  for (const edge of edges) {
    if (edge.source === edge.target) continue; // self-loop: not a neighbor
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue; // external endpoint

    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }

  const degrees = nodes.map((n) => neighbors.get(n.id)!.size);
  const avgDegree = degrees.reduce((sum, d) => sum + d, 0) / nodes.length;
  const threshold = Math.max(minDegree, avgDegree * outlierMultiplier);

  for (const node of nodes) {
    const neighborIds = neighbors.get(node.id)!;
    if (neighborIds.size < threshold) continue;

    let centerSum = 0;
    for (const neighborId of neighborIds) {
      const neighbor = nodeMap.get(neighborId)!;
      centerSum += neighbor.x + neighbor.width / 2;
    }
    const centroidX = centerSum / neighborIds.size;
    const idealX = centroidX - node.width / 2;

    // The ideal centroid x can coincide with (or overlap) some other node
    // already sitting in that spot — the average says nothing about who
    // else occupies that stretch of the row. Only nodes whose y-range
    // actually overlaps this hub's row can collide with it horizontally.
    const rowObstacles = nodes.filter(
      (other) =>
        other.id !== node.id &&
        other.y < node.y + node.height &&
        other.y + other.height > node.y,
    );
    const finalX = resolveHorizontalOverlap(
      idealX,
      node.width,
      rowObstacles,
      minGap,
    );

    result.set(node.id, { x: finalX, y: node.y });
  }

  return result;
}

/**
 * Nudges a candidate x at least minGap clear of any row obstacle it would
 * otherwise crowd, moving to whichever side of the collider is closer to
 * the ideal x. Bounded to one pass per obstacle, so it always terminates.
 */
function resolveHorizontalOverlap(
  idealX: number,
  width: number,
  obstacles: HubNudgeNode[],
  minGap: number,
): number {
  debugger;
  let x = idealX;
  for (let i = 0; i < obstacles.length; i++) {
    const collider = obstacles.find(
      (o) => x < o.x + o.width + minGap && x + width + minGap > o.x,
    );
    if (!collider) break;

    const leftOf = collider.x - width - minGap;
    const rightOf = collider.x + collider.width + minGap;
    x =
      Math.abs(leftOf - idealX) <= Math.abs(rightOf - idealX)
        ? leftOf
        : rightOf;
  }
  return x;
}
