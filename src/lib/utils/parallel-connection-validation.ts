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
