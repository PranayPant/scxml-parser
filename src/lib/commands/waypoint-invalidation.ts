/**
 * Waypoint invalidation for state-dimension-changing commands.
 *
 * Any command that changes a state's rendered width/height (renaming —
 * label length; changing entry/exit actions — height; changing state type;
 * toggling Initial — the badge) can leave connected edges with a persisted
 * `viz:waypoints` path computed against the *old* size. SCXMLTransitionEdge
 * always prefers a persisted path over dynamic routing, so a stale one
 * renders visually cutting through the resized node instead of adapting to
 * it. Clearing `viz:waypoints` on every transition touching the resized
 * state (as source or target) forces those edges back to dynamic,
 * obstacle-aware routing, which recomputes correctly against the new size.
 *
 * Two undo styles exist across commands in this module's callers:
 * - "Inverse command" (Rename, UpdateActions, ChangeStateType): undo just
 *   re-executes with the old values, which naturally re-clears waypoints
 *   for the state as it resizes back — callers don't need the returned
 *   snapshot at all.
 * - "Direct restore" (ToggleInitialState): undo doesn't re-run execute(),
 *   so it must explicitly restore the snapshot via restoreClearedWaypoints.
 */

export interface ClearedWaypoint {
  sourceId: string;
  targetId: string;
  event: string | null;
  cond: string | null;
  /** Never null — only transitions that had a value are recorded. */
  previousWaypoints: string;
}

function findStateElementById(doc: Document, stateId: string): Element | null {
  return doc.querySelector(
    `state[id="${stateId}"], parallel[id="${stateId}"], final[id="${stateId}"]`
  );
}

/** Every <transition> in the document with stateId as source or target. */
function collectTouchingTransitions(
  doc: Document,
  stateId: string
): Array<{ el: Element; sourceId: string; targetId: string; event: string | null; cond: string | null }> {
  const results: Array<{
    el: Element;
    sourceId: string;
    targetId: string;
    event: string | null;
    cond: string | null;
  }> = [];

  doc.querySelectorAll('transition').forEach((transitionEl) => {
    const sourceId = transitionEl.parentElement?.getAttribute('id') || '';
    const targets = (transitionEl.getAttribute('target') || '').split(/\s+/).filter(Boolean);
    if (sourceId === stateId || targets.includes(stateId)) {
      results.push({
        el: transitionEl,
        sourceId,
        targetId: targets.join(' '),
        event: transitionEl.getAttribute('event'),
        cond: transitionEl.getAttribute('cond'),
      });
    }
  });

  return results;
}

/**
 * Clear `viz:waypoints` on every transition touching stateId (as source or
 * target). Returns a snapshot of what was cleared, for callers that need to
 * restore it explicitly on undo (see module doc — most don't).
 */
export function clearWaypointsForTouchingTransitions(
  doc: Document,
  stateId: string
): ClearedWaypoint[] {
  const cleared: ClearedWaypoint[] = [];

  collectTouchingTransitions(doc, stateId).forEach(({ el, sourceId, targetId, event, cond }) => {
    const previousWaypoints = el.getAttribute('viz:waypoints');
    if (previousWaypoints === null) return;
    cleared.push({ sourceId, targetId, event, cond, previousWaypoints });
    el.removeAttribute('viz:waypoints');
  });

  return cleared;
}

/** Re-find a transition by its (source, target, event, cond) identity. */
function findTransitionByKey(
  doc: Document,
  sourceId: string,
  targetId: string,
  event: string | null,
  cond: string | null
): Element | null {
  const sourceElement = findStateElementById(doc, sourceId);
  if (!sourceElement) return null;

  for (const transitionEl of Array.from(sourceElement.querySelectorAll('transition'))) {
    if (transitionEl.parentElement !== sourceElement) continue;
    const targets = (transitionEl.getAttribute('target') || '').split(/\s+/).filter(Boolean).join(' ');
    const transEvent = transitionEl.getAttribute('event');
    const transCond = transitionEl.getAttribute('cond');
    if (targets === targetId && transEvent === event && transCond === cond) {
      return transitionEl;
    }
  }
  return null;
}

/** Restore a snapshot previously returned by clearWaypointsForTouchingTransitions. */
export function restoreClearedWaypoints(doc: Document, cleared: ClearedWaypoint[]): void {
  cleared.forEach(({ sourceId, targetId, event, cond, previousWaypoints }) => {
    const transitionEl = findTransitionByKey(doc, sourceId, targetId, event, cond);
    transitionEl?.setAttribute('viz:waypoints', previousWaypoints);
  });
}
