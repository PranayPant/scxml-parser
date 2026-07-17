/**
 * Graph analysis for the "multiple Initial States" feature.
 *
 * Groups are never persisted — every function here recomputes them fresh from
 * the current SCXML object model. Because transitions between states with
 * different parents are already rejected by validateCrossHierarchyTransitions
 * (src/lib/validators/transition-validator.ts), grouping only ever needs to be
 * evaluated among one parent container's direct children at a time — the
 * document root, or any single compound <state>.
 */
import type { SCXMLDocument, SCXMLElement, StateElement } from "@/types/scxml";
import { parseStateIdList } from "@/lib/validators/validator-utils";

export type ContainerElement = SCXMLElement | StateElement;

/** Direct child <state> elements of a container (root scxml, or a compound state). */
export function getDirectChildStates(
  container: ContainerElement,
): StateElement[] {
  if (!container.state) return [];
  return Array.isArray(container.state) ? container.state : [container.state];
}

/**
 * Find the container (the scxml root, or a StateElement) that directly holds
 * the given state id as one of its own <state> children. Returns null if the
 * id doesn't exist anywhere in the document.
 */
export function findParentContainer(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): ContainerElement | null {
  function search(container: ContainerElement): ContainerElement | null {
    const children = getDirectChildStates(container);
    if (children.some((c) => c["@_id"] === stateId)) return container;
    for (const child of children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  }
  return search(scxmlDoc.scxml);
}

/** Parse a container's `initial` attribute into the set of direct-child ids it lists. */
export function getInitialIds(container: ContainerElement): Set<string> {
  const raw = (container as any)["@_initial"] as string | undefined;
  if (!raw) return new Set();
  const childIds = new Set(
    getDirectChildStates(container).map((c) => c["@_id"]),
  );
  return new Set(parseStateIdList(raw, childIds));
}

/**
 * Undirected sibling edges: one entry per (source, target) pair where both
 * ends are direct children of `container` and a <transition> connects them.
 */
export function getSiblingEdges(
  container: ContainerElement,
): [string, string][] {
  const children = getDirectChildStates(container);
  const childIds = new Set(children.map((c) => c["@_id"]));
  const edges: [string, string][] = [];

  children.forEach((child) => {
    if (!child.transition) return;
    const transitions = Array.isArray(child.transition)
      ? child.transition
      : [child.transition];
    transitions.forEach((t) => {
      if (!t["@_target"]) return;
      t["@_target"]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((target) => {
          if (childIds.has(target) && target !== child["@_id"]) {
            edges.push([child["@_id"], target]);
          }
        });
    });
  });

  return edges;
}

export interface GroupAnalysis {
  /** stateId -> the Initial-marked id whose component it belongs to, or null if unassigned */
  groupsByState: Map<string, string | null>;
  /** Each entry is a set of 2+ Initial-marked ids that ended up in the same component */
  conflictedGroups: string[][];
}

/** Union-find over childIds using edges as undirected connections. */
export function analyzeGroups(
  childIds: string[],
  initialIds: Set<string>,
  edges: [string, string][],
): GroupAnalysis {
  const parent = new Map<string, string>();
  childIds.forEach((id) => parent.set(id, id));

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  edges.forEach(([a, b]) => {
    if (parent.has(a) && parent.has(b)) union(a, b);
  });

  const componentInitials = new Map<string, string[]>();
  childIds.forEach((id) => {
    if (!initialIds.has(id)) return;
    const root = find(id);
    const list = componentInitials.get(root) ?? [];
    list.push(id);
    componentInitials.set(root, list);
  });

  const groupsByState = new Map<string, string | null>();
  childIds.forEach((id) => {
    const members = componentInitials.get(find(id)) ?? [];
    groupsByState.set(id, members.length > 0 ? members[0] : null);
  });

  const conflictedGroups: string[][] = [];
  componentInitials.forEach((members) => {
    if (members.length > 1) conflictedGroups.push(members);
  });

  return { groupsByState, conflictedGroups };
}

/**
 * Check whether creating a transition sourceId -> targetId would merge two
 * different Initial State groups. Both states must share a direct parent —
 * if they don't (or either id can't be found), this defers to
 * validateCrossHierarchyTransitions and reports no block.
 */
export function wouldMergeDistinctGroups(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string,
): { blocked: boolean; reason?: string } {
  const sourceParent = findParentContainer(scxmlDoc, sourceId);
  const targetParent = findParentContainer(scxmlDoc, targetId);
  if (!sourceParent || !targetParent || sourceParent !== targetParent) {
    return { blocked: false };
  }

  const container = sourceParent;
  const childIds = getDirectChildStates(container).map((c) => c["@_id"]);
  const initialIds = getInitialIds(container);
  const edges = getSiblingEdges(container);
  edges.push([sourceId, targetId]);

  const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);
  if (conflictedGroups.length > 0) {
    const [a, b] = conflictedGroups[0];
    return {
      blocked: true,
      reason: `Cannot connect states that belong to different Initial State groups (rooted at '${a}' and '${b}').`,
    };
  }
  return { blocked: false };
}

/**
 * Check whether marking stateId as an Initial State would conflict with an
 * already-Initial-marked sibling it's transitively connected to (directly or
 * indirectly, via existing transitions among its parent's direct children).
 * Marking it would merge two Initial State groups into one chain that has
 * two Initial markers, which the "no merged groups" invariant forbids.
 */
export function wouldConflictIfMarkedInitial(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): { blocked: boolean; reason?: string } {
  debugger;
  const container = findParentContainer(scxmlDoc, stateId);
  if (!container) return { blocked: false };

  const childIds = getDirectChildStates(container).map((c) => c["@_id"]);
  const initialIds = new Set(getInitialIds(container));
  initialIds.add(stateId);
  const edges = getSiblingEdges(container);

  const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);
  const conflict = conflictedGroups.find((members) =>
    members.includes(stateId),
  );
  if (conflict) {
    const other = conflict.find((m) => m !== stateId) ?? conflict[0];
    return {
      blocked: true,
      reason: `Cannot mark '${stateId}' as an Initial State: it is already connected (directly or indirectly) to Initial State '${other}', which would merge two Initial State groups.`,
    };
  }
  return { blocked: false };
}

/** Whether stateId currently appears in its direct parent's `initial` list. */
export function isMarkedInitial(
  scxmlDoc: SCXMLDocument,
  stateId: string,
): boolean {
  const container = findParentContainer(scxmlDoc, stateId);
  if (!container) return false;
  return getInitialIds(container).has(stateId);
}

