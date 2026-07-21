/**
 * Pure grouping/threshold logic for parallel edges between the same two
 * nodes. Used by visual-diagram.tsx to decide, per edge, whether it should
 * render with the legacy 2-edge symmetric offset, as a bundled (badge +
 * expandable chip list) connector, or with no special treatment.
 */

export interface BundleEdgeLike {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
  // True if the user explicitly chose this edge's handles (e.g. by dragging
  // its endpoint to reconnect it), as opposed to an auto-assigned default.
  // When present in a group, it wins the canonical-handle vote below — so
  // reconnecting any one bundled edge moves the whole shared trunk to
  // follow it, instead of always sticking to whichever member happened to
  // be first in array order.
  hasExplicitHandles?: boolean;
}

export interface BundleAssignment {
  bundleGroupKey: string;
  bundleIndex: number;
  bundleSize: number;
  isBundled: boolean;
  // Handle pair every member of a multi-edge group (size >= 2) should be
  // rendered with, so they all resolve to identical anchor points and
  // actually overlap into one shared trunk — regardless of what the
  // upstream per-edge handle-assignment pass (obstacle-avoidance driven,
  // independent per edge) picked for each individual member. Derived from
  // whichever member has hasExplicitHandles set (a user-reconnected edge),
  // falling back to the group's first member, and resolved per physical
  // node (not per edge role) so a mirrored reverse-direction edge (B->A
  // alongside A->B) still resolves to the same two physical anchor points.
  // Undefined for groups of size 1, where no override is needed.
  canonicalSourceHandle?: string | null;
  canonicalTargetHandle?: string | null;
}

// Groups of this size or larger collapse into a badge + expandable chip list
// instead of the legacy per-edge offset fan-out.
export const BUNDLE_THRESHOLD = 3;

/**
 * Undirected key for a node pair — an A->B / B->A pair between the same two
 * nodes still reads as "parallel edges between the same two nodes"
 * visually, regardless of direction or which handles either one landed on.
 */
export function nodePairKey(source: string, target: string): string {
  return [source, target].sort().join('|');
}

export function computeEdgeBundles(
  edges: BundleEdgeLike[]
): Map<string, BundleAssignment> {
  const groups = new Map<string, BundleEdgeLike[]>();
  for (const edge of edges) {
    // Self-loops render via a dedicated fixed shape (buildSelfLoopPath) and
    // are never bundled with anything.
    if (edge.source === edge.target) continue;

    const key = nodePairKey(edge.source, edge.target);
    const group = groups.get(key);
    if (group) {
      group.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  const assignments = new Map<string, BundleAssignment>();
  for (const [key, group] of groups) {
    const bundleSize = group.length;
    const isBundled = bundleSize >= BUNDLE_THRESHOLD;

    let handleForNode: Map<string, string | null | undefined> | null = null;
    if (bundleSize >= 2) {
      const reference =
        group.find((edge) => edge.hasExplicitHandles) ?? group[0];
      handleForNode = new Map([
        [reference.source, reference.sourceHandle],
        [reference.target, reference.targetHandle],
      ]);
    }

    group.forEach((edge, index) => {
      assignments.set(edge.id, {
        bundleGroupKey: key,
        bundleIndex: index,
        bundleSize,
        isBundled,
        canonicalSourceHandle: handleForNode?.get(edge.source),
        canonicalTargetHandle: handleForNode?.get(edge.target),
      });
    });
  }
  return assignments;
}
