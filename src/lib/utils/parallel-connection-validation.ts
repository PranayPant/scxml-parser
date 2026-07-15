import type { Node } from 'reactflow';

/**
 * A transition directly connecting two sibling regions of the same
 * <parallel> state is illegal per the SCXML spec (see
 * docs/parallel-states-scxml-spec.md §1.4) — firing it would tear down and
 * rebuild the whole parallel rather than move within it. This rejects only
 * that specific case; every other connection (a region to something outside
 * its parallel, or vice versa) is left untouched.
 */
export function isSameParallelSiblingConnection(
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
  nodes: Node[]
): boolean {
  if (!sourceId || !targetId || sourceId === targetId) return false;

  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!sourceNode || !targetNode) return false;

  if (
    !sourceNode.parentId ||
    !targetNode.parentId ||
    sourceNode.parentId !== targetNode.parentId
  ) {
    return false;
  }

  const parent = nodes.find((n) => n.id === sourceNode.parentId);
  return parent?.data?.stateType === 'parallel';
}

/** Walks a node's parentId chain to find the nearest <parallel> that governs it — the
 * node itself if it is a parallel, otherwise the nearest parallel ancestor, or null if
 * it isn't inside (or isn't) a parallel at all. */
function nearestGoverningParallelId(nodeId: string, nodes: Node[]): string | null {
  let current = nodes.find((n) => n.id === nodeId);
  while (current) {
    if ((current.data as any)?.stateType === 'parallel') return current.id;
    if (!current.parentId) return null;
    current = nodes.find((n) => n.id === current!.parentId);
  }
  return null;
}

/** True if walking up from `nodeId`'s parentId chain reaches `ancestorId`. */
function isAncestorParallel(ancestorId: string, nodeId: string, nodes: Node[]): boolean {
  let current = nodes.find((n) => n.id === nodeId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = nodes.find((n) => n.id === current!.parentId);
  }
  return false;
}

/**
 * Two distinct <parallel> state machines must remain entirely disconnected from one
 * another (see docs/parallel-states-scxml-spec.md) — a transition may not jump from
 * one parallel (its wrapper or any of its regions, at any depth) directly into a
 * different, unrelated parallel. Transitioning to/from an *ancestor* parallel (e.g. a
 * nested parallel re-targeting the outer parallel that contains it) is still allowed —
 * that's a normal exit/reentry within the same machine, not a jump to another one.
 */
export function isDisconnectedParallelJump(
  sourceId: string | null | undefined,
  targetId: string | null | undefined,
  nodes: Node[]
): boolean {
  if (!sourceId || !targetId || sourceId === targetId) return false;

  const sourceParallel = nearestGoverningParallelId(sourceId, nodes);
  const targetParallel = nearestGoverningParallelId(targetId, nodes);
  if (!sourceParallel || !targetParallel || sourceParallel === targetParallel) return false;

  if (
    isAncestorParallel(sourceParallel, targetParallel, nodes) ||
    isAncestorParallel(targetParallel, sourceParallel, nodes)
  ) {
    return false;
  }

  return true;
}
