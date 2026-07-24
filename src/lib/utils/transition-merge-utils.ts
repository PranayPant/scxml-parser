import type { TransitionElement, StateElement, ParallelElement } from '@/types/scxml';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';

/**
 * Combines a merge group's `@_cond` values into a single boolean expression via OR.
 * If any transition in the group is unconditional (no cond, or whitespace-only), the
 * merged result is unconditional too — OR'd with "always true" is "always true".
 */
export function combineConditions(conds: (string | undefined)[]): string | undefined {
  const trimmed = conds.map((c) => c?.trim());
  if (trimmed.some((c) => !c)) return undefined;
  return trimmed.map((c) => `(${c})`).join(' || ');
}

/**
 * Two transitions belong to the same merge family when they share a target and a type
 * (internal/external, defaulting to external). The `event` attribute is deliberately not
 * compared — merging is driven purely by combining conditions via OR, not by event names.
 */
export function isSameTransitionFamily(a: TransitionElement, b: TransitionElement): boolean {
  if (a['@_target'] !== b['@_target']) return false;
  const typeOf = (t: TransitionElement) => t['@_type'] || 'external';
  return typeOf(a) === typeOf(b);
}

/** Recursively sorts object keys so attribute order doesn't affect the resulting JSON string. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Extracts a transition's action content: every key that isn't an XML attribute (the parser
 * prefixes attribute keys with '@_', including standard ones like `@_event`/`@_cond`/`@_target`
 * and any other attribute such as `@_viz:sourceHandle`/`@_viz:targetHandle` added by auto-layout —
 * none of these represent behavior and must not affect the merge decision). Action child elements
 * (assign/log/send/cancel/raise/...) are attached directly as un-prefixed keys on the transition
 * object (e.g. `{ assign: {...} }`) rather than under an `.executable` field, which the parser
 * never actually populates for transitions.
 */
function actionContentOf(t: TransitionElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(t)) {
    if (!key.startsWith('@_')) out[key] = (t as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * Structural equality of two transitions' action content. Used to avoid merging transitions
 * whose actions differ, which would silently change which behavior fires under which condition.
 */
export function actionsAreEqual(a: TransitionElement, b: TransitionElement): boolean {
  return stableStringify(actionContentOf(a)) === stableStringify(actionContentOf(b));
}

/**
 * Groups a flat transitions array into merge-candidate clusters: same family
 * (target + type) and identical actions. Clusters of size 1 are omitted since
 * there's nothing to merge them with.
 */
export function findMergeGroups(transitions: TransitionElement[]): TransitionElement[][] {
  const groups: TransitionElement[][] = [];
  const assigned = new Set<TransitionElement>();

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    if (assigned.has(t)) continue;

    const group = [t];
    for (let j = i + 1; j < transitions.length; j++) {
      const candidate = transitions[j];
      if (assigned.has(candidate)) continue;
      if (isSameTransitionFamily(t, candidate) && actionsAreEqual(t, candidate)) {
        group.push(candidate);
        assigned.add(candidate);
      }
    }

    if (group.length > 1) {
      assigned.add(t);
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Collapses a merge group into the single surviving TransitionElement: the first
 * (document-order) transition's event/type/target/actions are kept, and its cond
 * is replaced with the OR-combination of the whole group's conditions.
 */
export function mergeTransitionGroup(group: TransitionElement[]): TransitionElement {
  const merged: TransitionElement = { ...group[0] };
  const combined = combineConditions(group.map((t) => t['@_cond']));
  if (combined === undefined) {
    delete merged['@_cond'];
  } else {
    merged['@_cond'] = combined;
  }
  return merged;
}

/** Applies findMergeGroups/mergeTransitionGroup to one element's transition list. Returns true if it changed. */
function mergeTransitionsOnElement(element: { transition?: TransitionElement | TransitionElement[] }): boolean {
  if (!element.transition) return false;
  const original = Array.isArray(element.transition) ? element.transition : [element.transition];

  const groups = findMergeGroups(original);
  if (groups.length === 0) return false;

  const firstToMerged = new Map<TransitionElement, TransitionElement>();
  const toDrop = new Set<TransitionElement>();
  for (const group of groups) {
    firstToMerged.set(group[0], mergeTransitionGroup(group));
    for (const t of group.slice(1)) toDrop.add(t);
  }

  const result: TransitionElement[] = [];
  for (const t of original) {
    if (toDrop.has(t)) continue;
    result.push(firstToMerged.get(t) ?? t);
  }

  element.transition = result.length === 1 ? result[0] : result;
  return true;
}

/**
 * Load-time normalization: scans an SCXML document for sets of transitions between the same
 * source+target with identical actions and merges each set into one transition with an OR-combined
 * cond. Returns the original string unmodified (byte-identical) if nothing needed merging.
 */
export function mergeDuplicateTransitionsInDocument(xmlContent: string): string {
  const parser = new SCXMLParser();
  const parseResult = parser.parse(xmlContent);
  if (!parseResult.success || !parseResult.data) return xmlContent;

  let changed = false;

  const walkStates = (states: StateElement | StateElement[] | undefined): void => {
    if (!states) return;
    const arr = Array.isArray(states) ? states : [states];
    for (const state of arr) {
      if (mergeTransitionsOnElement(state)) changed = true;
      walkStates(state.state);
      walkParallels(state.parallel);
    }
  };

  const walkParallels = (parallels: ParallelElement | ParallelElement[] | undefined): void => {
    if (!parallels) return;
    const arr = Array.isArray(parallels) ? parallels : [parallels];
    for (const p of arr) {
      if (mergeTransitionsOnElement(p)) changed = true;
      walkStates(p.state);
      walkParallels(p.parallel);
    }
  };

  walkStates(parseResult.data.scxml.state);
  walkParallels(parseResult.data.scxml.parallel);

  if (!changed) return xmlContent;

  parser.getVisualMetadataManager().extractAllVisualMetadata(parseResult.data);
  return parser.serialize(parseResult.data, true);
}
