/**
 * SCXML Parallel Region Validation Module (Phase 3: Logic and Validation Rules)
 *
 * Enforces the W3C SCXML rule that a transition may not target a state that
 * lives in a sibling region of the same <parallel> (SCXML §3.4 / the LCCA
 * exit-set algorithm — see docs/parallel-states-scxml-spec.md §1.4). Each
 * region of a <parallel> is effectively its own disconnected state machine:
 * transitions may move freely within a region, or leave the parallel
 * entirely, but must not "jump" across to a different region.
 */

import type { SCXMLElement, StateElement, ParallelElement, TransitionElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findTransitionPosition, parseStateIdList } from './validator-utils';

interface ParallelRegionIndex {
  /** immediate parent id for every state/parallel/final/history id, null at the root */
  parentOf: Map<string, string | null>;
  /** ids of every <parallel> element in the document */
  parallelIds: Set<string>;
}

/**
 * Walks the full document building an immediate-parent map and the set of
 * all <parallel> ids. Distinct from state-validator's buildStateHierarchy
 * because this one also needs to know *which* ancestors are parallels.
 */
function buildParallelRegionIndex(scxml: SCXMLElement): ParallelRegionIndex {
  const parentOf = new Map<string, string | null>();
  const parallelIds = new Set<string>();

  const visitState = (state: StateElement, parentId: string | null): void => {
    const id = state['@_id'];
    if (id) parentOf.set(id, parentId);
    const selfId = id ?? parentId;

    if (state.state) {
      const children = Array.isArray(state.state) ? state.state : [state.state];
      children.forEach((child) => visitState(child, selfId));
    }
    if (state.parallel) {
      const children = Array.isArray(state.parallel) ? state.parallel : [state.parallel];
      children.forEach((child) => visitParallel(child, selfId));
    }
    if (state.final) {
      const finals = Array.isArray(state.final) ? state.final : [state.final];
      finals.forEach((final) => {
        if (final['@_id']) parentOf.set(final['@_id'], selfId);
      });
    }
    if (state.history) {
      const histories = Array.isArray(state.history) ? state.history : [state.history];
      histories.forEach((history) => {
        if (history['@_id']) parentOf.set(history['@_id'], selfId);
      });
    }
  };

  const visitParallel = (parallel: ParallelElement, parentId: string | null): void => {
    const id = parallel['@_id'];
    if (id) {
      parentOf.set(id, parentId);
      parallelIds.add(id);
    }
    const selfId = id ?? parentId;

    if (parallel.state) {
      const children = Array.isArray(parallel.state) ? parallel.state : [parallel.state];
      children.forEach((child) => visitState(child, selfId));
    }
    if (parallel.parallel) {
      const children = Array.isArray(parallel.parallel) ? parallel.parallel : [parallel.parallel];
      children.forEach((child) => visitParallel(child, selfId));
    }
    if (parallel.history) {
      const histories = Array.isArray(parallel.history) ? parallel.history : [parallel.history];
      histories.forEach((history) => {
        if (history['@_id']) parentOf.set(history['@_id'], selfId);
      });
    }
  };

  if (scxml.state) {
    const children = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    children.forEach((child) => visitState(child, null));
  }
  if (scxml.parallel) {
    const children = Array.isArray(scxml.parallel) ? scxml.parallel : [scxml.parallel];
    children.forEach((child) => visitParallel(child, null));
  }
  if (scxml.final) {
    const finals = Array.isArray(scxml.final) ? scxml.final : [scxml.final];
    finals.forEach((final) => {
      if (final['@_id']) parentOf.set(final['@_id'], null);
    });
  }

  return { parentOf, parallelIds };
}

/** Root-to-self chain of ids for a given id (self last). */
function ancestorPath(id: string, parentOf: Map<string, string | null>): string[] {
  const path: string[] = [id];
  let cur = parentOf.get(id) ?? null;
  while (cur !== null && cur !== undefined) {
    path.unshift(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return path;
}

/**
 * True when a transition from sourceId to targetId illegally crosses from
 * one region of a <parallel> into a sibling region of that same <parallel>.
 *
 * Implements the LCCA rule directly: find the nearest common ancestor of
 * source and target. If neither is an ancestor of the other (i.e. they
 * genuinely diverge), and that common ancestor is a <parallel>, the two
 * states live in different regions of it — illegal. Targeting an ancestor
 * (or a descendant within the same branch), or diverging above/outside any
 * enclosing parallel, is legal.
 */
export function crossesParallelRegions(
  sourceId: string,
  targetId: string,
  index: ParallelRegionIndex
): boolean {
  if (sourceId === targetId) return false;
  if (!index.parentOf.has(sourceId) || !index.parentOf.has(targetId)) return false;

  const sourcePath = ancestorPath(sourceId, index.parentOf);
  const targetPath = ancestorPath(targetId, index.parentOf);

  let i = 0;
  while (
    i < sourcePath.length &&
    i < targetPath.length &&
    sourcePath[i] === targetPath[i]
  ) {
    i++;
  }

  // One path is a prefix of the other: ancestor/descendant relationship, not a
  // sibling-region jump (e.g. targeting an ancestor, or a state in the same branch).
  if (i === sourcePath.length || i === targetPath.length) return false;
  // No shared ancestor at all (two top-level siblings) — can't share a parallel.
  if (i === 0) return false;

  const nearestCommonAncestor = sourcePath[i - 1];
  return index.parallelIds.has(nearestCommonAncestor);
}

/** The nearest <parallel> governing an id — the id itself if it is a parallel,
 * otherwise the nearest parallel ancestor, or null if it isn't inside (or isn't) one. */
function nearestGoverningParallelId(id: string, index: ParallelRegionIndex): string | null {
  if (index.parallelIds.has(id)) return id;
  let cur = index.parentOf.get(id) ?? null;
  while (cur !== null && cur !== undefined) {
    if (index.parallelIds.has(cur)) return cur;
    cur = index.parentOf.get(cur) ?? null;
  }
  return null;
}

/** True if walking up from id's parent chain reaches ancestorId. */
function isAncestorOf(ancestorId: string, id: string, index: ParallelRegionIndex): boolean {
  let cur = index.parentOf.get(id) ?? null;
  while (cur !== null && cur !== undefined) {
    if (cur === ancestorId) return true;
    cur = index.parentOf.get(cur) ?? null;
  }
  return false;
}

/**
 * True when source and target belong to two distinct, unrelated <parallel>
 * machines (see docs/parallel-states-scxml-spec.md — "parallel state machines
 * remain entirely disconnected from one another"). Unlike crossesParallelRegions
 * (which only fires for two regions sharing the same parallel), this fires for
 * a transition connecting any two different parallels at all — including their
 * wrappers directly, e.g. parallel_1 -> parallel_2 — regardless of whether they
 * share a common non-parallel ancestor. Targeting an *ancestor* parallel (a
 * nested parallel re-entering the outer parallel that contains it) is exempted:
 * that's ordinary exit/reentry within the same machine, not a jump to another.
 */
export function jumpsBetweenDisconnectedParallels(
  sourceId: string,
  targetId: string,
  index: ParallelRegionIndex
): boolean {
  if (sourceId === targetId) return false;

  const sourceParallel = nearestGoverningParallelId(sourceId, index);
  const targetParallel = nearestGoverningParallelId(targetId, index);
  if (!sourceParallel || !targetParallel || sourceParallel === targetParallel) return false;

  if (
    isAncestorOf(sourceParallel, targetParallel, index) ||
    isAncestorOf(targetParallel, sourceParallel, index)
  ) {
    return false;
  }

  return true;
}

/**
 * Validates that no transition in the document targets a state living in a
 * sibling region of the same <parallel> as its source (Phase 3 "Connectivity
 * Checks": parallel regions must remain entirely disconnected from one
 * another except via transitions that leave the whole parallel).
 */
export function validateParallelRegionTransitions(
  scxml: SCXMLElement,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  const index = buildParallelRegionIndex(scxml);
  if (index.parallelIds.size === 0) return; // no parallels in this document — nothing to check

  const stateIds = new Set(index.parentOf.keys());

  const checkElement = (element: StateElement | ParallelElement): void => {
    const sourceId = element['@_id'];
    if (sourceId && element.transition) {
      const transitions = Array.isArray(element.transition)
        ? element.transition
        : [element.transition];

      transitions.forEach((transition: TransitionElement) => {
        if (!transition['@_target']) return;
        const targets = parseStateIdList(transition['@_target'], stateIds);

        targets.forEach((targetId) => {
          const event = transition['@_event'] || '';
          const cond = transition['@_cond'] || '';

          if (crossesParallelRegions(sourceId, targetId, index)) {
            const position = findTransitionPosition(sourceId, targetId, xmlContent, event, cond);
            errors.push({
              message: `Illegal transition: '${sourceId}' cannot target '${targetId}' — they are in different regions of the same <parallel> state. A transition may stay within its own region or leave the parallel entirely, but it cannot jump to a sibling region.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
            return;
          }

          if (jumpsBetweenDisconnectedParallels(sourceId, targetId, index)) {
            const position = findTransitionPosition(sourceId, targetId, xmlContent, event, cond);
            errors.push({
              message: `Illegal transition: '${sourceId}' cannot target '${targetId}' — they belong to different <parallel> state machines. Parallel state machines must remain entirely disconnected from one another.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
          }
        });
      });
    }

    if (element.state) {
      const children = Array.isArray(element.state) ? element.state : [element.state];
      children.forEach((child) => checkElement(child));
    }
    if (element.parallel) {
      const children = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      children.forEach((child) => checkElement(child));
    }
  };

  if (scxml.state) {
    const children = Array.isArray(scxml.state) ? scxml.state : [scxml.state];
    children.forEach((child) => checkElement(child));
  }
  if (scxml.parallel) {
    const children = Array.isArray(scxml.parallel) ? scxml.parallel : [scxml.parallel];
    children.forEach((child) => checkElement(child));
  }
}
