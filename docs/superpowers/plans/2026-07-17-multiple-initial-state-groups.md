# Multiple Independent Initial State Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark any state as an "Initial State"; each Initial State roots its own independent, non-mergeable connected component among its siblings (root-level or within any compound state), and the editor blocks any transition that would merge two different Initial State groups.

**Architecture:** A pure, dependency-free graph-analysis module (`initial-group-utils.ts`) computes groups on demand from the parsed SCXML object model — no group state is ever persisted. It's consumed three ways: (1) a DOM-based `ToggleInitialStateCommand` for marking/unmarking a state Initial, (2) a real-time gate in the diagram's `onConnect`/`isValidConnection` handlers that blocks merging connections before they're created, and (3) a persistent `initial-group-validator.ts` that catches already-invalid states reached via the XML text editor or file load. Three pre-existing single-value-only mutation sites (rename, delete, badge rendering) are fixed to handle the now-common multi-value `initial` attribute correctly.

**Tech Stack:** TypeScript, React, ReactFlow, vitest (`describe`/`it`/`expect`, co-located `*.test.ts` files — see `src/lib/layout/chain-wrapping.test.ts` for the convention). Object-model SCXML types from `@/types/scxml`. DOM-based XML mutation via `BaseCommand` (`DOMParser`/`XMLSerializer`) for commands, matching `rename-state-command.ts`.

Design spec: `docs/superpowers/specs/2026-07-17-multiple-initial-state-groups-design.md`

---

## Task 1: Graph analysis utility

**Files:**
- Create: `src/lib/utils/initial-group-utils.ts`
- Test: `src/lib/utils/initial-group-utils.test.ts`

This is the foundational pure module everything else depends on. It operates on the parsed
`SCXMLDocument` object model (same shape used by the validators), not the DOM.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/utils/initial-group-utils.test.ts
import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import {
  getDirectChildStates,
  findParentContainer,
  getInitialIds,
  getSiblingEdges,
  analyzeGroups,
  wouldMergeDistinctGroups,
  isMarkedInitial,
  canUnmarkInitial,
} from './initial-group-utils';

function doc(scxml: SCXMLDocument['scxml']): SCXMLDocument {
  return { scxml };
}

describe('getDirectChildStates', () => {
  it('returns an empty array when there are no children', () => {
    expect(getDirectChildStates({ '@_version': '1.0' } as any)).toEqual([]);
  });

  it('normalizes a single state to an array', () => {
    const child = { '@_id': 'A' };
    expect(getDirectChildStates({ state: child } as any)).toEqual([child]);
  });

  it('passes through an array of states', () => {
    const children = [{ '@_id': 'A' }, { '@_id': 'B' }];
    expect(getDirectChildStates({ state: children } as any)).toEqual(children);
  });
});

describe('findParentContainer', () => {
  it('finds the scxml root as the parent of a root-level state', () => {
    const scxml = { state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'A')).toBe(d.scxml);
  });

  it('finds a nested compound state as the parent of its child', () => {
    const child = { '@_id': 'Child' };
    const parent = { '@_id': 'Parent', '@_initial': 'Child', state: child };
    const scxml = { state: [parent] };
    const d = doc(scxml as any);
    expect(findParentContainer(d, 'Child')).toBe(parent);
  });

  it('returns null for an unknown state id', () => {
    const d = doc({ state: [{ '@_id': 'A' }] } as any);
    expect(findParentContainer(d, 'Nope')).toBeNull();
  });
});

describe('getInitialIds', () => {
  it('parses a single-value initial attribute', () => {
    const container = { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(getInitialIds(container as any)).toEqual(new Set(['A']));
  });

  it('parses a multi-value space-separated initial attribute', () => {
    const container = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }, { '@_id': 'C' }] };
    expect(getInitialIds(container as any)).toEqual(new Set(['A', 'B']));
  });

  it('returns an empty set when there is no initial attribute', () => {
    const container = { state: [{ '@_id': 'A' }] };
    expect(getInitialIds(container as any)).toEqual(new Set());
  });
});

describe('getSiblingEdges', () => {
  it('builds an edge for a transition between two siblings', () => {
    const a = { '@_id': 'A', transition: { '@_target': 'B' } };
    const b = { '@_id': 'B' };
    const container = { state: [a, b] };
    expect(getSiblingEdges(container as any)).toEqual([['A', 'B']]);
  });

  it('ignores a transition target that is not a sibling', () => {
    const a = { '@_id': 'A', transition: { '@_target': 'Outside' } };
    const container = { state: [a] };
    expect(getSiblingEdges(container as any)).toEqual([]);
  });

  it('handles multiple transitions on one state', () => {
    const a = { '@_id': 'A', transition: [{ '@_target': 'B' }, { '@_target': 'C' }] };
    const container = { state: [a, { '@_id': 'B' }, { '@_id': 'C' }] };
    expect(getSiblingEdges(container as any)).toEqual([['A', 'B'], ['A', 'C']]);
  });
});

describe('analyzeGroups', () => {
  it('assigns a state to its own group when it is the only Initial marker', () => {
    const result = analyzeGroups(['A'], new Set(['A']), []);
    expect(result.groupsByState.get('A')).toBe('A');
    expect(result.conflictedGroups).toEqual([]);
  });

  it('leaves a state with no Initial marker and no connection unassigned', () => {
    const result = analyzeGroups(['A'], new Set(), []);
    expect(result.groupsByState.get('A')).toBeNull();
  });

  it('propagates a group root through a chain of transitions', () => {
    // Initial A -> State1 -> State2 (the spec's Graph A example)
    const childIds = ['A', 'State1', 'State2'];
    const edges: [string, string][] = [['A', 'State1'], ['State1', 'State2']];
    const result = analyzeGroups(childIds, new Set(['A']), edges);
    expect(result.groupsByState.get('State1')).toBe('A');
    expect(result.groupsByState.get('State2')).toBe('A');
    expect(result.conflictedGroups).toEqual([]);
  });

  it('flags a component that contains two different Initial markers', () => {
    const childIds = ['A', 'B'];
    const edges: [string, string][] = [['A', 'B']];
    const result = analyzeGroups(childIds, new Set(['A', 'B']), edges);
    expect(result.conflictedGroups).toEqual([['A', 'B']]);
  });
});

describe('wouldMergeDistinctGroups', () => {
  it('allows connecting two states already in the same group (State1 -> State2)', () => {
    const scxml = {
      '@_initial': 'A',
      state: [
        { '@_id': 'A' },
        { '@_id': 'State1', transition: { '@_target': 'A' } },
        { '@_id': 'State2' },
      ],
    };
    const result = wouldMergeDistinctGroups(doc(scxml as any), 'State1', 'State2');
    expect(result.blocked).toBe(false);
  });

  it('blocks connecting two different Initial States directly, in either direction', () => {
    const scxml = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'B').blocked).toBe(true);
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'B', 'A').blocked).toBe(true);
  });

  it("blocks the spec's State2 -> State5 example (bridging two established graphs)", () => {
    const scxml = {
      '@_initial': 'InitialA InitialB',
      state: [
        { '@_id': 'InitialA' },
        { '@_id': 'State1', transition: { '@_target': 'InitialA' } },
        { '@_id': 'State2', transition: { '@_target': 'State1' } },
        { '@_id': 'InitialB' },
        { '@_id': 'State4', transition: { '@_target': 'InitialB' } },
        { '@_id': 'State5', transition: { '@_target': 'State4' } },
      ],
    };
    const result = wouldMergeDistinctGroups(doc(scxml as any), 'State2', 'State5');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('InitialA');
    expect(result.reason).toContain('InitialB');
  });

  it('allows two unassigned states to connect to each other', () => {
    const scxml = { state: [{ '@_id': 'X' }, { '@_id': 'Y' }] };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'X', 'Y').blocked).toBe(false);
  });

  it('allows an unassigned state to join an existing group', () => {
    const scxml = {
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'Island' }],
    };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'Island').blocked).toBe(false);
  });

  it('does not block when source and target have different parents (handled elsewhere)', () => {
    const scxml = {
      state: [
        { '@_id': 'P1', '@_initial': 'A', state: { '@_id': 'A' } },
        { '@_id': 'P2', '@_initial': 'B', state: { '@_id': 'B' } },
      ],
    };
    expect(wouldMergeDistinctGroups(doc(scxml as any), 'A', 'B').blocked).toBe(false);
  });
});

describe('isMarkedInitial / canUnmarkInitial', () => {
  it('reports a listed state as marked initial', () => {
    const scxml = { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(isMarkedInitial(doc(scxml as any), 'A')).toBe(true);
    expect(isMarkedInitial(doc(scxml as any), 'B')).toBe(true);
  });

  it('reports an unlisted state as not marked initial', () => {
    const scxml = { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] };
    expect(isMarkedInitial(doc(scxml as any), 'B')).toBe(false);
  });

  it('always allows unmarking a root-level Initial state, even if it is the only one', () => {
    const scxml = { '@_initial': 'A', state: [{ '@_id': 'A' }] };
    expect(canUnmarkInitial(doc(scxml as any), 'A')).toBe(true);
  });

  it('disallows unmarking the sole Initial state of a nested compound parent', () => {
    const scxml = {
      state: [{ '@_id': 'Parent', '@_initial': 'Child', state: { '@_id': 'Child' } }],
    };
    expect(canUnmarkInitial(doc(scxml as any), 'Child')).toBe(false);
  });

  it('allows unmarking one of several Initial states in the same nested parent', () => {
    const scxml = {
      state: [
        {
          '@_id': 'Parent',
          '@_initial': 'ChildA ChildB',
          state: [{ '@_id': 'ChildA' }, { '@_id': 'ChildB' }],
        },
      ],
    };
    expect(canUnmarkInitial(doc(scxml as any), 'ChildA')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/initial-group-utils.test.ts`
Expected: FAIL — `Cannot find module './initial-group-utils'` (module doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/utils/initial-group-utils.ts
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
import type { SCXMLDocument, SCXMLElement, StateElement } from '@/types/scxml';
import { parseStateIdList } from '@/lib/validators/validator-utils';

export type ContainerElement = SCXMLElement | StateElement;

/** Direct child <state> elements of a container (root scxml, or a compound state). */
export function getDirectChildStates(container: ContainerElement): StateElement[] {
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
  stateId: string
): ContainerElement | null {
  function search(container: ContainerElement): ContainerElement | null {
    const children = getDirectChildStates(container);
    if (children.some((c) => c['@_id'] === stateId)) return container;
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
  const raw = (container as any)['@_initial'] as string | undefined;
  if (!raw) return new Set();
  const childIds = new Set(getDirectChildStates(container).map((c) => c['@_id']));
  return new Set(parseStateIdList(raw, childIds));
}

/**
 * Undirected sibling edges: one entry per (source, target) pair where both
 * ends are direct children of `container` and a <transition> connects them.
 */
export function getSiblingEdges(container: ContainerElement): [string, string][] {
  const children = getDirectChildStates(container);
  const childIds = new Set(children.map((c) => c['@_id']));
  const edges: [string, string][] = [];

  children.forEach((child) => {
    if (!child.transition) return;
    const transitions = Array.isArray(child.transition) ? child.transition : [child.transition];
    transitions.forEach((t) => {
      if (!t['@_target']) return;
      t['@_target'].split(/\s+/).filter(Boolean).forEach((target) => {
        if (childIds.has(target) && target !== child['@_id']) {
          edges.push([child['@_id'], target]);
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
  edges: [string, string][]
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
  targetId: string
): { blocked: boolean; reason?: string } {
  const sourceParent = findParentContainer(scxmlDoc, sourceId);
  const targetParent = findParentContainer(scxmlDoc, targetId);
  if (!sourceParent || !targetParent || sourceParent !== targetParent) {
    return { blocked: false };
  }

  const container = sourceParent;
  const childIds = getDirectChildStates(container).map((c) => c['@_id']);
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

/** Whether stateId currently appears in its direct parent's `initial` list. */
export function isMarkedInitial(scxmlDoc: SCXMLDocument, stateId: string): boolean {
  const container = findParentContainer(scxmlDoc, stateId);
  if (!container) return false;
  return getInitialIds(container).has(stateId);
}

/**
 * Whether stateId can safely be unmarked as Initial. Always true at the
 * document root (root never requires an initial state). For a nested
 * compound parent, false only when stateId is the *sole* Initial marker
 * (validateCompoundStates requires every compound state to keep at least one).
 */
export function canUnmarkInitial(scxmlDoc: SCXMLDocument, stateId: string): boolean {
  const container = findParentContainer(scxmlDoc, stateId);
  if (!container) return true;
  if (container === scxmlDoc.scxml) return true;
  const initialIds = getInitialIds(container);
  if (!initialIds.has(stateId)) return true;
  return initialIds.size > 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/initial-group-utils.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/initial-group-utils.ts src/lib/utils/initial-group-utils.test.ts
git commit -m "feat: add pure graph analysis for multiple Initial State groups"
```

---

## Task 2: Fix multi-value `initial` rendering in the diagram

**Files:**
- Modify: `src/lib/converters/converter-modules/layout-positioning.ts:298-345` (the `isInitialState` function)
- Test: `src/lib/converters/converter-modules/layout-positioning.test.ts` (new file — none exists for this module today)

Today `isInitialState` compares `stateId === rootInitial` / `stateId === parentInitial` against
the *whole* attribute string, so it already silently returns `false` for every state once that
attribute holds more than one space-separated id. This task fixes it to check membership.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/converters/converter-modules/layout-positioning.test.ts
import { describe, it, expect } from 'vitest';
import { isInitialState } from './layout-positioning';

function getAttribute(element: any, attrName: string): string | undefined {
  return element?.[`@_${attrName}`];
}
function getElements(parent: any, elementName: string): any {
  return parent?.[elementName];
}

describe('isInitialState', () => {
  it('returns true for a single-value root initial (existing behavior)', () => {
    const rootScxml = { '@_initial': 'A' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value root initial', () => {
    const rootScxml = { '@_initial': 'A B' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }], ['C', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('C', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value nested-parent initial', () => {
    const parentState = { '@_initial': 'ChildA ChildB' };
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};
    expect(
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildB', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildC', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/converters/converter-modules/layout-positioning.test.ts`
Expected: FAIL on the two multi-value cases (single-value case already passes today)

- [ ] **Step 3: Fix the implementation**

In `src/lib/converters/converter-modules/layout-positioning.ts`, add the import at the top of the file:

```typescript
import { parseStateIdList } from '@/lib/validators/validator-utils';
```

Then replace the body of `isInitialState` (lines 298-345 in the current file) with:

```typescript
export function isInitialState(
  stateId: string,
  parentPath: string,
  rootScxml: any,
  stateRegistry: Map<string, StateRegistryEntry>,
  getAttribute: (element: any, attrName: string) => string | undefined,
  getElements: (parent: any, elementName: string) => any
): boolean {
  const allIds = new Set(stateRegistry.keys());

  if (!parentPath) {
    // Check if it's one of the (possibly multiple) root initial states
    const rootInitial = getAttribute(rootScxml, 'initial');
    if (rootInitial && parseStateIdList(rootInitial, allIds).includes(stateId)) {
      return true;
    }

    // Also check for <initial> element at root
    const initialElement = getElements(rootScxml, 'initial');
    if (initialElement) {
      const transition = getElements(initialElement, 'transition');
      if (transition) {
        const target = getAttribute(transition, 'target');
        if (stateId === target) return true;
      }
    }

    return false;
  }

  // Find parent state and check its (possibly multiple) initial ids
  const parentId =
    typeof parentPath === 'string' ? parentPath.split('#').pop() : null;
  if (parentId) {
    const parentInfo = stateRegistry.get(parentId);
    if (parentInfo) {
      const parentInitial = getAttribute(parentInfo.state, 'initial');
      if (parentInitial && parseStateIdList(parentInitial, allIds).includes(stateId)) {
        return true;
      }

      // Also check for <initial> element in parent
      const initialElement = getElements(parentInfo.state, 'initial');
      if (initialElement) {
        const transition = getElements(initialElement, 'transition');
        if (transition) {
          const target = getAttribute(transition, 'target');
          if (stateId === target) return true;
        }
      }
    }
  }

  return false;
}
```

(Keep whatever closing logic/braces followed the original function — this replaces the
conditional bodies only, not the function's surrounding structure. Read the current file first
to confirm the exact tail before editing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/converters/converter-modules/layout-positioning.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/converters/converter-modules/layout-positioning.ts src/lib/converters/converter-modules/layout-positioning.test.ts
git commit -m "fix: recognize multi-value initial attributes when rendering the Initial badge"
```

---

## Task 3: Fix `RenameStateCommand` for multi-value `initial` lists

**Files:**
- Modify: `src/lib/commands/rename-state-command.ts:51-55`
- Test: `src/lib/commands/rename-state-command.test.ts` (new file)

Today's `doc.querySelectorAll('[initial="${this.stateId}"]')` only matches when the *entire*
attribute equals the renamed id — already broken for multi-value lists (a rename would silently
fail to update the reference at all, since `[initial="A"]` never matches `initial="A B"`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/commands/rename-state-command.test.ts
import { describe, it, expect } from 'vitest';
import { RenameStateCommand } from './rename-state-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

describe('RenameStateCommand', () => {
  it('updates a single-value initial attribute (existing behavior)', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const result = new RenameStateCommand('A', 'A2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A2"');
  });

  it('replaces only the renamed token in a multi-value initial attribute, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new RenameStateCommand('A', 'A2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A2 B"');
  });

  it('updates a multi-value initial attribute on a nested compound state', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="ChildA ChildB"><state id="ChildA"/><state id="ChildB"/></state></scxml>`;
    const result = new RenameStateCommand('ChildB', 'ChildB2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="ChildA ChildB2"');
  });

  it('leaves an initial attribute untouched when it does not reference the renamed state', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/><state id="C"/></scxml>`;
    const result = new RenameStateCommand('C', 'C2').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A B"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/commands/rename-state-command.test.ts`
Expected: FAIL on the multi-value cases (the token-preserving replace isn't implemented yet)

- [ ] **Step 3: Fix the implementation**

In `src/lib/commands/rename-state-command.ts`, replace lines 51-55:

```typescript
    // Update parent's initial attribute if it points to this state
    const parentsWithInitial = doc.querySelectorAll(`[initial="${this.stateId}"]`);
    parentsWithInitial.forEach((parent) => {
      parent.setAttribute('initial', this.newId);
    });
```

with:

```typescript
    // Update parent's initial attribute if it references this state — token-aware
    // so a multi-value list ("A B") only has the renamed token replaced, not wiped.
    const elementsWithInitial = doc.querySelectorAll('[initial]');
    elementsWithInitial.forEach((element) => {
      const tokens = (element.getAttribute('initial') || '').split(/\s+/).filter(Boolean);
      if (tokens.includes(this.stateId)) {
        const updated = tokens.map((t) => (t === this.stateId ? this.newId : t));
        element.setAttribute('initial', updated.join(' '));
      }
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/commands/rename-state-command.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/rename-state-command.ts src/lib/commands/rename-state-command.test.ts
git commit -m "fix: preserve sibling ids when renaming a state in a multi-value initial list"
```

---

## Task 4: Fix `scxml-manipulation-utils.ts` for multi-value/nested `initial` lists

**Files:**
- Modify: `src/lib/utils/scxml-manipulation-utils.ts:44-83` (`updateTransitionTargets`) and `:234-270` (`removeStateFromDocument`)
- Test: `src/lib/utils/scxml-manipulation-utils.test.ts` (new file)

Both functions today only look at `scxmlDoc.scxml['@_initial']` (root only) and only handle an
exact full-string match (breaks multi-value lists). This task makes both token-aware and
recursive across nested compound states.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/utils/scxml-manipulation-utils.test.ts
import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { updateTransitionTargets, removeStateFromDocument } from './scxml-manipulation-utils';

describe('updateTransitionTargets', () => {
  it('updates a single-value root initial (existing behavior)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2');
  });

  it('replaces only the matching token in a multi-value root initial', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2 B');
  });

  it('replaces only the matching token in a nested compound state initial', () => {
    const child = { '@_id': 'ChildA' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [child, { '@_id': 'ChildB' }] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    updateTransitionTargets(d, 'ChildA', 'ChildA2');
    expect((parent as any)['@_initial']).toBe('ChildA2 ChildB');
  });
});

describe('removeStateFromDocument', () => {
  it('drops the removed id from a multi-value root initial without touching the rest', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBe('B');
  });

  it('clears the root initial attribute entirely when the removed id was the only one (no forced fallback at root)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBeUndefined();
  });

  it('auto-falls-back to a remaining sibling when a nested compound parent would otherwise lose its only initial', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });

  it('drops just the removed token from a nested compound parent that still has another initial marker', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: FAIL on the multi-value and nested cases

- [ ] **Step 3: Fix the implementation**

In `src/lib/utils/scxml-manipulation-utils.ts`, replace the tail of `updateTransitionTargets`
(the block currently reading `// Update initial attribute if it references the old state` through
its closing brace, lines ~79-82) with:

```typescript
  // Update initial attribute if it references the old state — token-aware,
  // and checked at every nesting level (root and every compound state), not just root.
  function updateInitialAttr(container: { '@_initial'?: string }): void {
    if (!container['@_initial']) return;
    const tokens = container['@_initial'].split(/\s+/).filter(Boolean);
    if (tokens.includes(oldStateId)) {
      container['@_initial'] = tokens.map((t) => (t === oldStateId ? newStateId : t)).join(' ');
    }
  }

  function updateInitialInStates(states: StateElement | StateElement[] | undefined): void {
    if (!states) return;
    const stateArray = Array.isArray(states) ? states : [states];
    stateArray.forEach((state) => {
      updateInitialAttr(state);
      updateInitialInStates(state.state);
    });
  }

  updateInitialAttr(scxmlDoc.scxml);
  updateInitialInStates(scxmlDoc.scxml.state);
```

Then replace `removeStateFromDocument` (lines 234-270) entirely with:

```typescript
export function removeStateFromDocument(
  scxmlDoc: SCXMLDocument,
  stateId: string
): void {
  function removeFromStates(
    states: StateElement | StateElement[] | undefined
  ): StateElement | StateElement[] | undefined {
    if (!states) return undefined;

    if (Array.isArray(states)) {
      const filtered = states.filter((state) => state['@_id'] !== stateId);
      filtered.forEach((state) => {
        state.state = removeFromStates(state.state) as any;
      });
      return filtered.length > 0 ? filtered : undefined;
    } else {
      if (states['@_id'] === stateId) {
        return undefined;
      }
      states.state = removeFromStates(states.state) as any;
      return states;
    }
  }

  // Remove the state's token from whichever parent's initial list contains it,
  // at any nesting level. Nested compound states must always retain at least
  // one initial marker if they still have children (validateCompoundStates
  // requires it); the document root has no such requirement, so it's left
  // empty ("unassigned") rather than force-picking a replacement.
  function stripInitialToken(container: { '@_initial'?: string }): void {
    if (!container['@_initial']) return;
    const tokens = container['@_initial'].split(/\s+/).filter((t) => t && t !== stateId);
    if (tokens.length > 0) {
      container['@_initial'] = tokens.join(' ');
    } else {
      delete container['@_initial'];
    }
  }

  function stripInitialTokenRecursive(
    states: StateElement | StateElement[] | undefined
  ): void {
    if (!states) return;
    const stateArray = Array.isArray(states) ? states : [states];
    stateArray.forEach((state) => {
      stripInitialToken(state);
      if (!state['@_initial'] && !state.initial) {
        const children = Array.isArray(state.state)
          ? state.state
          : state.state
            ? [state.state]
            : [];
        if (children.length > 0) {
          state['@_initial'] = children[0]['@_id'];
        }
      }
      stripInitialTokenRecursive(state.state);
    });
  }

  // Remove from document
  scxmlDoc.scxml.state = removeFromStates(scxmlDoc.scxml.state) as any;

  // Remove transitions that target this state
  removeTransitionsTargeting(scxmlDoc, stateId);

  // Clean up any initial-attribute references to the removed state
  stripInitialToken(scxmlDoc.scxml);
  stripInitialTokenRecursive(scxmlDoc.scxml.state);
}
```

Note this drops the old `findFirstState`-based root fallback (picking an arbitrary new root
initial after deleting the current one) — that behavior conflicts with the new "root states can
be freely unassigned" semantics from the design spec. Check whether `findFirstState` is still
used elsewhere in this file before removing its export; if unused elsewhere, it can stay
exported (harmless) or be removed — prefer leaving it as-is unless a lint/build error says
otherwise, to keep this task's diff focused.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/scxml-manipulation-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/scxml-manipulation-utils.ts src/lib/utils/scxml-manipulation-utils.test.ts
git commit -m "fix: handle multi-value and nested initial lists when renaming/removing states"
```

---

## Task 5: `ToggleInitialStateCommand`

**Files:**
- Create: `src/lib/commands/toggle-initial-state-command.ts`
- Modify: `src/lib/commands/index.ts`
- Test: `src/lib/commands/toggle-initial-state-command.test.ts`

DOM-based command (matches `RenameStateCommand`'s pattern) that adds/removes a state's id from
its direct parent's `initial` attribute list.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/commands/toggle-initial-state-command.test.ts
import { describe, it, expect } from 'vitest';
import { ToggleInitialStateCommand } from './toggle-initial-state-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

describe('ToggleInitialStateCommand', () => {
  it('marks a previously-unmarked root state as Initial by adding it to a fresh initial attribute', () => {
    const xml = `${SCXML_HEADER}><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A"');
  });

  it('marks a second root state as Initial by appending to an existing initial attribute', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('B').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="A B"');
  });

  it('unmarks a state by removing just its token, preserving the rest', () => {
    const xml = `${SCXML_HEADER} initial="A B"><state id="A"/><state id="B"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="B"');
    expect(result.newContent).not.toMatch(/initial="[^"]*A[^"]*"/);
  });

  it('removes the initial attribute entirely when unmarking the only root Initial state', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/></scxml>`;
    const result = new ToggleInitialStateCommand('A').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).not.toContain('initial=');
  });

  it('fails when trying to unmark the sole Initial state of a nested compound parent', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="Child"><state id="Child"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('Child').execute(xml);
    expect(result.success).toBe(false);
    expect(result.newContent).toBe(xml);
  });

  it('allows unmarking one of several Initial states in the same nested parent', () => {
    const xml = `${SCXML_HEADER}><state id="Parent" initial="ChildA ChildB"><state id="ChildA"/><state id="ChildB"/></state></scxml>`;
    const result = new ToggleInitialStateCommand('ChildA').execute(xml);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain('initial="ChildB"');
  });

  it('undo restores the exact prior initial attribute value', () => {
    const xml = `${SCXML_HEADER} initial="A"><state id="A"/><state id="B"/></scxml>`;
    const command = new ToggleInitialStateCommand('B');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A B"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).toContain('initial="A"');
    expect(undone.newContent).not.toContain('initial="A B"');
  });

  it('undo restores an absent initial attribute after marking a fresh one', () => {
    const xml = `${SCXML_HEADER}><state id="A"/></scxml>`;
    const command = new ToggleInitialStateCommand('A');
    const result = command.execute(xml);
    expect(result.newContent).toContain('initial="A"');
    const undone = command.undo(result.newContent);
    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('initial=');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/commands/toggle-initial-state-command.test.ts`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/commands/toggle-initial-state-command.ts
import { BaseCommand, type CommandResult } from './base-command';

/**
 * ToggleInitialStateCommand
 *
 * Adds or removes a state's id from its direct parent's `initial` attribute
 * (space-separated list), marking/unmarking it as the root of an independent
 * Initial State group. Refuses to remove the sole Initial marker of a nested
 * compound parent, since every compound state must keep at least one
 * (validateCompoundStates). The document root has no such requirement.
 */
export class ToggleInitialStateCommand extends BaseCommand {
  private previousInitialValue?: string | null;

  constructor(private stateId: string) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement || !stateElement.parentElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }
    const parent = stateElement.parentElement;

    const currentValue = parent.getAttribute('initial') || '';
    const tokens = currentValue.split(/\s+/).filter(Boolean);
    const isCurrentlyInitial = tokens.includes(this.stateId);

    this.previousInitialValue = parent.hasAttribute('initial') ? currentValue : null;

    if (isCurrentlyInitial) {
      const isRoot = parent === doc.documentElement;
      if (!isRoot && tokens.length === 1) {
        return this.createFailureResult(
          `Cannot unmark '${this.stateId}' as an Initial State: it is the only Initial State for its parent, which must always have at least one.`,
          scxmlContent
        );
      }
      const updated = tokens.filter((t) => t !== this.stateId);
      if (updated.length > 0) {
        parent.setAttribute('initial', updated.join(' '));
      } else {
        parent.removeAttribute('initial');
      }
    } else {
      parent.setAttribute('initial', [...tokens, this.stateId].join(' '));
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  undo(scxmlContent: string): CommandResult {
    if (this.previousInitialValue === undefined) {
      return this.createFailureResult('Nothing to undo', scxmlContent);
    }

    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
    }

    const stateElement = this.findStateElement(doc, this.stateId);
    if (!stateElement || !stateElement.parentElement) {
      return this.createFailureResult(
        `State element not found: ${this.stateId}`,
        scxmlContent
      );
    }

    const parent = stateElement.parentElement;
    if (this.previousInitialValue === null) {
      parent.removeAttribute('initial');
    } else {
      parent.setAttribute('initial', this.previousInitialValue);
    }

    return this.createSuccessResult(this.serializeXML(doc), [this.stateId]);
  }

  getDescription(): string {
    return `Toggle Initial State for "${this.stateId}"`;
  }
}
```

Add the export to `src/lib/commands/index.ts` (append after the last export line):

```typescript
export { ToggleInitialStateCommand } from './toggle-initial-state-command';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/commands/toggle-initial-state-command.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/commands/toggle-initial-state-command.ts src/lib/commands/toggle-initial-state-command.test.ts src/lib/commands/index.ts
git commit -m "feat: add ToggleInitialStateCommand for marking/unmarking Initial States"
```

---

## Task 6: Persistent document validator

**Files:**
- Create: `src/lib/validators/initial-group-validator.ts`
- Modify: `src/lib/validators/index.ts`
- Modify: `src/lib/validators/scxml-validator.ts`
- Test: `src/lib/validators/initial-group-validator.test.ts`

Catches documents that already violate the "no merged Initial groups" invariant via a route the
real-time `onConnect` gate can't cover (XML text editor, pasted/loaded files).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validators/initial-group-validator.test.ts
import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateInitialStateGroups } from './initial-group-validator';

describe('validateInitialStateGroups', () => {
  it('reports no errors for a document with a single Initial State', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A',
      state: [{ '@_id': 'A' }, { '@_id': 'B', transition: { '@_target': 'A' } }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('reports no errors when two Initial States exist but are never connected', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A' }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors).toEqual([]);
  });

  it('reports an error when a transition connects two different root-level Initial State groups', () => {
    const scxml: SCXMLElement = {
      '@_initial': 'A B',
      state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toContain('A');
    expect(errors[0].message).toContain('B');
  });

  it('reports an error for a merged group inside a nested compound state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Parent',
          '@_initial': 'ChildA ChildB',
          state: [
            { '@_id': 'ChildA', transition: { '@_target': 'ChildB' } },
            { '@_id': 'ChildB' },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
  });

  it('does not let a conflict in one parent leak into an unrelated parent', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'P1', '@_initial': 'A B', state: [{ '@_id': 'A', transition: { '@_target': 'B' } }, { '@_id': 'B' }] },
        { '@_id': 'P2', '@_initial': 'C', state: [{ '@_id': 'C' }] },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateInitialStateGroups(scxml, errors);
    expect(errors.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/validators/initial-group-validator.test.ts`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/validators/initial-group-validator.ts
import type { SCXMLElement, StateElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import {
  getDirectChildStates,
  getInitialIds,
  getSiblingEdges,
  analyzeGroups,
  type ContainerElement,
} from '@/lib/utils/initial-group-utils';

/**
 * Detects documents where a transition already connects two different
 * Initial State groups under the same parent — the state real-time onConnect
 * blocking can't prevent (hand-edited XML, pasted/loaded files).
 */
export function validateInitialStateGroups(
  scxml: SCXMLElement,
  errors: ValidationError[]
): void {
  validateContainer(scxml, errors);
}

function validateContainer(
  container: ContainerElement,
  errors: ValidationError[]
): void {
  const children = getDirectChildStates(container);

  if (children.length > 0) {
    const childIds = children.map((c) => c['@_id']);
    const initialIds = getInitialIds(container);
    const edges = getSiblingEdges(container);
    const { conflictedGroups } = analyzeGroups(childIds, initialIds, edges);

    conflictedGroups.forEach((members) => {
      errors.push({
        message: `States ${members
          .map((m) => `'${m}'`)
          .join(' and ')} are both marked as Initial States but are connected by a transition (directly or indirectly), which merges two Initial State groups. Remove one of the Initial markers, or remove the transition(s) connecting them.`,
        severity: 'error',
      });
    });
  }

  children.forEach((child: StateElement) => validateContainer(child, errors));
}
```

Add the barrel export in `src/lib/validators/index.ts` (append after the last line):

```typescript
export * from './initial-group-validator';
```

Wire it into `src/lib/validators/scxml-validator.ts`: add to the import block that currently
imports `validateCrossHierarchyTransitions` from `./transition-validator` — add a new import
line:

```typescript
import { validateInitialStateGroups } from './initial-group-validator';
```

Then in the `validate()` method, immediately after the existing `validateCrossHierarchyTransitions(...)` call (right before `return deduplicateErrors(errors);`), add:

```typescript
    // Multiple Initial State group validation
    validateInitialStateGroups(scxml, errors);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/validators/initial-group-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/initial-group-validator.ts src/lib/validators/initial-group-validator.test.ts src/lib/validators/index.ts src/lib/validators/scxml-validator.ts
git commit -m "feat: add persistent validator for merged Initial State groups"
```

---

## Task 7: Real-time connection blocking in the diagram

**Files:**
- Create: `src/components/diagram/initial-group-conflict-banner.tsx`
- Modify: `src/components/diagram/visual-diagram.tsx`

Blocks the diagram's drag-to-connect flow from ever creating a transition that merges two
Initial State groups, with a transient banner explaining why.

- [ ] **Step 1: Create the banner component**

```typescript
// src/components/diagram/initial-group-conflict-banner.tsx
'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface InitialGroupConflictBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function InitialGroupConflictBanner({
  message,
  onDismiss,
}: InitialGroupConflictBannerProps) {
  if (!message) return null;

  return (
    <div
      role='alert'
      className='absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-error bg-elevated px-3 py-2 text-xs text-default shadow-lg max-w-md'
    >
      <AlertTriangle className='h-4 w-4 text-error flex-shrink-0' />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label='Dismiss'
        className='ml-1 text-dimmed hover:text-default transition-colors flex-shrink-0'
      >
        <X className='h-3 w-3' />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `visual-diagram.tsx`**

Add the import near the other local component imports (after the `StateActionsPanel` import
around line 53):

```typescript
import { InitialGroupConflictBanner } from './initial-group-conflict-banner';
import {
  wouldMergeDistinctGroups,
} from '@/lib/utils/initial-group-utils';
```

Add state for the transient banner message near the other `React.useState` declarations at the
top of `VisualDiagramInner` (find where `selectedStateForActions` or similar local UI state is
declared, and add alongside it):

```typescript
const [initialGroupConflictMessage, setInitialGroupConflictMessage] = React.useState<string | null>(null);

React.useEffect(() => {
  if (!initialGroupConflictMessage) return;
  const timer = setTimeout(() => setInitialGroupConflictMessage(null), 4000);
  return () => clearTimeout(timer);
}, [initialGroupConflictMessage]);
```

Modify the `onConnect` callback (`visual-diagram.tsx:775`) to check first, before doing anything
else. Insert this at the very top of the callback body, before `const sourceHandle = ...`:

```typescript
      if (params.source && params.target && parserRef.current && scxmlContent) {
        const preCheck = parserRef.current.parse(scxmlContent);
        if (preCheck.success && preCheck.data) {
          const { blocked, reason } = wouldMergeDistinctGroups(
            preCheck.data,
            params.source,
            params.target
          );
          if (blocked) {
            setInitialGroupConflictMessage(
              reason || 'Cannot connect states that belong to different Initial State groups.'
            );
            return;
          }
        }
      }

```

Add `setInitialGroupConflictMessage` and keep `scxmlContent` in `onConnect`'s dependency array
(it's already there).

Add an `isValidConnection` callback (for live drag feedback) — place it near `onConnect`:

```typescript
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return true;
      if (!parserRef.current || !scxmlContent) return true;
      const parseResult = parserRef.current.parse(scxmlContent);
      if (!parseResult.success || !parseResult.data) return true;
      return !wouldMergeDistinctGroups(parseResult.data, connection.source, connection.target).blocked;
    },
    [scxmlContent]
  );
```

Pass it to the `<ReactFlow>` element (find the existing `onConnect={onConnect}` prop around line
2406 and add directly after it):

```typescript
            isValidConnection={isValidConnection}
```

Render the banner just after the closing `</ReactFlow>` tag's containing `<div>` — find the
`</div>` at line 2541 (the one directly wrapping the ReactFlow canvas) and add the banner as a
sibling before that div closes, or immediately after it, inside the same relatively-positioned
canvas container:

```tsx
          </ReactFlow>
          <InitialGroupConflictBanner
            message={initialGroupConflictMessage}
            onDismiss={() => setInitialGroupConflictMessage(null)}
          />
        </div>
```

(Verify the immediate parent `<div>` of `<ReactFlow>` has `position: relative` — or an
equivalent Tailwind `relative` class — so the banner's `absolute` positioning anchors to the
canvas rather than the page; add `relative` to that div's className if it's missing.)

- [ ] **Step 3: Manually verify in the running app**

Run: `npm run dev`, open the app, load or build a document with two states each marked Initial
(once Task 8 lands the UI for that — until then, this can be verified by hand-editing the XML in
the text editor to add `initial="A B"` on two root states, then trying to drag a transition
between them in the diagram).
Expected: the drag either shows invalid-connection styling and/or the edge fails to attach, and
the banner appears with the conflict message, auto-dismissing after ~4s.

(This step is a placeholder for manual verification — it depends on Task 8's UI to be fully
exercisable end-to-end, so treat it as deferred until Task 8 is also done. No automated test is
added in this task since `visual-diagram.tsx` has no existing component-test coverage to extend
and introducing one is out of scope for this plan.)

- [ ] **Step 4: Commit**

```bash
git add src/components/diagram/initial-group-conflict-banner.tsx src/components/diagram/visual-diagram.tsx
git commit -m "feat: block diagram connections that would merge Initial State groups"
```

---

## Task 8: "Initial State" toggle in the State Actions panel

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`
- Modify: `src/components/diagram/visual-diagram.tsx`

Adds the user-facing control for marking/unmarking a state as Initial.

- [ ] **Step 1: Add props and the toggle UI to `StateActionsPanel`**

In `src/components/ui/state-actions-panel.tsx`, extend `StateActionsPanelProps` (after the
existing `internalEventActions` field):

```typescript
  stateType: 'simple' | 'compound' | 'parallel' | 'final';
  isInitial: boolean;
  canUnmarkInitial: boolean;
  onToggleInitial: () => void;
```

Destructure the new props in the component signature (add alongside `internalEventActions: initialReactions,`):

```typescript
  stateType,
  isInitial,
  canUnmarkInitial,
  onToggleInitial,
```

Replace the existing sub-header block (currently lines 369-378):

```tsx
        {/* Sub-header: stateId + add button */}
        <div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
          <p className='text-xs text-primary'>{stateId}</p>
          <button
            onClick={handleAddClick}
            title='Add action'
            className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
          >
            <Plus className='h-4 w-4' />
          </button>
        </div>
```

with:

```tsx
        {/* Sub-header: stateId + add button */}
        <div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
          <p className='text-xs text-primary'>{stateId}</p>
          <button
            onClick={handleAddClick}
            title='Add action'
            className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
          >
            <Plus className='h-4 w-4' />
          </button>
        </div>

        {/* Initial State toggle — only markable for simple/compound states */}
        {(stateType === 'simple' || stateType === 'compound') && (
          <div className='flex items-center px-3 py-1 border-b border-default bg-muted flex-shrink-0'>
            <label
              className={`flex items-center gap-1.5 text-[10px] ${
                isInitial && !canUnmarkInitial ? 'text-dimmed cursor-not-allowed' : 'text-muted cursor-pointer'
              }`}
              title={
                isInitial && !canUnmarkInitial
                  ? 'This is the only Initial State for its parent — mark another sibling Initial first to unmark this one'
                  : undefined
              }
            >
              <input
                type='checkbox'
                checked={isInitial}
                disabled={isInitial && !canUnmarkInitial}
                onChange={onToggleInitial}
                className='h-3 w-3'
              />
              Initial State
            </label>
          </div>
        )}
```

- [ ] **Step 2: Wire the new props from `visual-diagram.tsx`**

First, extend the `selectedStateForActions` state shape to carry the new fields. Find its
declaration (`React.useState` typed with `id`, `entryActions`, `exitActions`,
`internalEventActions` — search for `setSelectedStateForActions` to find the type) and add:

```typescript
    stateType: 'simple' | 'compound' | 'parallel' | 'final';
    isInitial: boolean;
    canUnmarkInitial: boolean;
```

At the selection site (`visual-diagram.tsx`, inside the block that calls
`setSelectedStateForActions({...})` around line 984-989), compute the two derived fields using
the freshly-parsed SCXML and add them to the object:

```typescript
                  let isInitialFlag = false;
                  let canUnmarkFlag = true;
                  if (parserRef.current && scxmlContent) {
                    const parseResult = parserRef.current.parse(scxmlContent);
                    if (parseResult.success && parseResult.data) {
                      isInitialFlag = isMarkedInitial(parseResult.data, stateId);
                      canUnmarkFlag = canUnmarkInitial(parseResult.data, stateId);
                    }
                  }

                  setSelectedEdgeForEdit(null);
                  setSelectedTransitions(new Set());
                  setActivePanel('stateActions');
                  setSelectedStateForActions({
                    id: stateId,
                    entryActions: parseActions(node.data.entryActions || []),
                    exitActions: parseActions(node.data.exitActions || []),
                    internalEventActions: node.data.internalEventActions || [],
                    stateType: node.data.stateType,
                    isInitial: isInitialFlag,
                    canUnmarkInitial: canUnmarkFlag,
                  });
```

Add the two functions to the existing import from `@/lib/utils/initial-group-utils` at the top
of the file (extend the import added in Task 7):

```typescript
import {
  wouldMergeDistinctGroups,
  isMarkedInitial,
  canUnmarkInitial,
} from '@/lib/utils/initial-group-utils';
```

Add a handler, next to `handleNodeActionsChange`/`handleNodeInternalEventsChange`:

```typescript
  const handleToggleInitialState = React.useCallback(
    (stateId: string) => {
      if (!onSCXMLChange || !scxmlContent) return;
      try {
        const { ToggleInitialStateCommand } = require('@/lib/commands');
        const command = new ToggleInitialStateCommand(stateId);
        const result = command.execute(scxmlContent);

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
          setSelectedStateForActions((prev) => {
            if (!prev || prev.id !== stateId || !parserRef.current) return prev;
            const parseResult = parserRef.current.parse(result.newContent);
            if (!parseResult.success || !parseResult.data) return prev;
            return {
              ...prev,
              isInitial: isMarkedInitial(parseResult.data, stateId),
              canUnmarkInitial: canUnmarkInitial(parseResult.data, stateId),
            };
          });
        } else {
          console.error('Failed to toggle initial state:', result.error);
        }
      } catch (error) {
        console.error('Failed to toggle initial state:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );
```

Finally, pass the new props to `<StateActionsPanel>` (around line 2567-2593):

```typescript
        stateType={selectedStateForActions?.stateType ?? 'simple'}
        isInitial={selectedStateForActions?.isInitial ?? false}
        canUnmarkInitial={selectedStateForActions?.canUnmarkInitial ?? true}
        onToggleInitial={() => {
          if (selectedStateForActions) {
            handleToggleInitialState(selectedStateForActions.id);
          }
        }}
```

- [ ] **Step 3: Manually verify in the running app**

Run: `npm run dev`. Select a root-level state, open its State Actions panel, and confirm:
1. The "Initial State" checkbox appears (for simple/compound states) and is unchecked by default
   for a state that isn't marked.
2. Checking it marks the state Initial — the "Initial" badge appears on the node in the diagram,
   and the SCXML's `initial` attribute gains the state's id.
3. Marking a second, unconnected root state Initial creates a second badge and a second
   independent group.
4. Dragging a transition between the two Initial-marked states is blocked (Task 7's banner
   appears).
5. Dragging a transition between an unmarked ("unassigned") state and one Initial-marked state
   succeeds, and that unassigned state's badge context (not directly visible, but confirmed by:
   attempting to then connect it to the *other* Initial group is now also blocked).
6. Unchecking the box on a state that is the sole Initial marker of a nested compound parent is
   disabled with a tooltip; unchecking it at the root level (or when a sibling is also marked
   Initial) works and removes the badge.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (Tasks 1-6's suites plus every pre-existing test)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/state-actions-panel.tsx src/components/diagram/visual-diagram.tsx
git commit -m "feat: add Initial State toggle to the State Actions panel"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Section 1 (algorithm) → Task 1. Section 2 (representation + bug fixes) →
  Tasks 2-4. Section 3 (UI: toggle + blocking) → Tasks 7-8. Section 4 (persistent validation +
  testing) → Task 6, and tests are embedded in every task rather than deferred to the end.
- **Out-of-scope reminders carried over from the spec:** no `<parallel>` support, no
  `<initial>`-child-element support, no new visual grouping/color indicators beyond the existing
  badge — none of the tasks above introduce any of these.
- **Type consistency check:** `stateType` values (`'simple' | 'compound' | 'parallel' | 'final'`)
  match `SCXMLStateNodeData['stateType']` from `scxml-to-xstate.ts`. `ToggleInitialStateCommand`,
  `isMarkedInitial`, and `canUnmarkInitial` names/signatures are identical everywhere they're
  referenced (Tasks 5, 7, 8). `wouldMergeDistinctGroups` returns `{ blocked, reason? }`
  consistently in Tasks 1, 7.
- **Sequencing:** Tasks 1-6 are independently testable pure/backend work with no UI dependency —
  safe to implement and verify in isolation. Tasks 7 and 8 both touch `visual-diagram.tsx`; Task 7
  must land first since Task 8's manual verification step exercises the blocking behavior Task 7
  introduces.
