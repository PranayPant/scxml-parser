# Transition Slot Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block (with a warning) any new attempt — via the diagram connect gesture, the transition panel, or the code editor — to create more than one event-slot and one cond-slot transition between the same two states, or a transition with both an event and a condition set. Legacy files keep auto-merging silently on load, unchanged.

**Architecture:** One small pure rule module (`src/lib/utils/transition-slot-rules.ts`) classifies a transition into an `event`/`cond`/`invalid-both` slot and checks a candidate against existing sibling transitions. It's reused by three integration points: a live pre-check in the diagram's `onConnect`/`isValidConnection` (reusing the existing block+banner pattern already used for Initial-State-group conflicts), a pre-check in the transition panel's apply handler (new inline warning UI, no merge-on-edit anymore), and a new validator function wired into the existing `SCXMLValidator` pipeline (gets Monaco squiggles + Validation panel entries automatically).

**Tech Stack:** TypeScript, React, vitest, the existing `SCXMLParser`/`SCXMLDocument` tree shape, the existing `ValidationError`/`SCXMLValidator` pipeline.

**Design doc:** `docs/superpowers/specs/2026-07-25-transition-slot-validation-design.md`

---

## Important context for the implementer

- `UpdateTransitionCommand` (`src/lib/commands/update-transition-command.ts:66-74`) already clears the *opposite* attribute on every panel edit (setting `cond` removes `event`, and vice versa). So a transition panel edit's "candidate" transition is always unambiguously `{ event: newValue }` or `{ cond: newValue }` — never both. The "both present" case is only reachable through hand-edited/legacy XML, which is exactly what the code-editor validator (Task 5) catches.
- "Absent" means missing entirely OR whitespace-only, for both `event` and `cond` — consistent with `condsAreEqual`/`combineConditions` in `src/lib/utils/transition-merge-utils.ts`.
- Slot uniqueness is scoped per (target, `@_type`) — internal and external transitions to the same target are independent slot families, matching how the existing merge feature already treats `@_type`.
- `initial`/`history` transitions are out of scope (same precedent as the merge feature).

---

### Task 1: `classifyTransitionSlot` + `findTransitionSlotConflict` (pure rule functions)

**Files:**
- Create: `src/lib/utils/transition-slot-rules.ts`
- Test: `src/lib/utils/transition-slot-rules.test.ts`

- [ ] **Step 1: Write the failing tests for `classifyTransitionSlot`**

Create `src/lib/utils/transition-slot-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TransitionElement } from '@/types/scxml';
import { classifyTransitionSlot, findTransitionSlotConflict } from './transition-slot-rules';

describe('classifyTransitionSlot', () => {
  it('classifies an event-only transition as the event slot', () => {
    const t: TransitionElement = { '@_event': 'click', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('event');
  });

  it('classifies a bare transition with neither event nor cond as the event slot', () => {
    const t: TransitionElement = { '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('event');
  });

  it('classifies a cond-only transition as the cond slot', () => {
    const t: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('cond');
  });

  it('classifies a transition with both event and cond as invalid-both', () => {
    const t: TransitionElement = { '@_event': 'click', '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('invalid-both');
  });

  it('treats a whitespace-only event as absent (falls into cond slot)', () => {
    const t: TransitionElement = { '@_event': '   ', '@_cond': 'x>1', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('cond');
  });

  it('treats a whitespace-only cond as absent (falls into event slot)', () => {
    const t: TransitionElement = { '@_event': 'click', '@_cond': '  ', '@_target': 'B' };
    expect(classifyTransitionSlot(t)).toBe('event');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: FAIL — `Cannot find module './transition-slot-rules'` (module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/utils/transition-slot-rules.ts`:

```ts
import type { TransitionElement } from '@/types/scxml';

export type TransitionSlot = 'event' | 'cond' | 'invalid-both';

function isPresent(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

/**
 * cond absent -> 'event' (covers event-only and bare/always transitions).
 * cond present + event absent -> 'cond'.
 * both present -> 'invalid-both'.
 */
export function classifyTransitionSlot(t: TransitionElement): TransitionSlot {
  const hasEvent = isPresent(t['@_event']);
  const hasCond = isPresent(t['@_cond']);
  if (hasEvent && hasCond) return 'invalid-both';
  if (hasCond) return 'cond';
  return 'event';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: 6 tests PASS (the `findTransitionSlotConflict` import will fail to resolve — that's expected, it's added next).

- [ ] **Step 5: Write the failing tests for `findTransitionSlotConflict`**

Append to `src/lib/utils/transition-slot-rules.test.ts`:

```ts
describe('findTransitionSlotConflict', () => {
  it('does not block when there are no existing transitions', () => {
    const candidate: TransitionElement = { '@_event': 'click', '@_target': 'B' };
    expect(findTransitionSlotConflict([], candidate)).toEqual({ blocked: false });
  });

  it('blocks a second event-slot transition when one already exists', () => {
    const existing: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one event-based transition/i);
  });

  it('blocks a second cond-slot transition when one already exists', () => {
    const existing: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_cond': 'x<0', '@_target': 'B' };
    const result = findTransitionSlotConflict([existing], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one condition-based transition/i);
  });

  it('does not block an event-slot candidate when only a cond-slot transition exists', () => {
    const existing: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('does not block a cond-slot candidate when only an event-slot transition exists', () => {
    const existing: TransitionElement = { '@_event': 'e1', '@_target': 'B' };
    const candidate: TransitionElement = { '@_cond': 'x>1', '@_target': 'B' };
    expect(findTransitionSlotConflict([existing], candidate)).toEqual({ blocked: false });
  });

  it('blocks a candidate with both event and cond, even with no existing transitions', () => {
    const candidate: TransitionElement = { '@_event': 'e1', '@_cond': 'x>1', '@_target': 'B' };
    const result = findTransitionSlotConflict([], candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/both an event and a condition/i);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: FAIL — `findTransitionSlotConflict is not a function`.

- [ ] **Step 7: Write the minimal implementation**

Append to `src/lib/utils/transition-slot-rules.ts`:

```ts
/**
 * existingTransitionsToSameTarget: the OTHER transitions already on this source state
 * that target the same state + type as `candidate` — the caller is responsible for
 * filtering to same target/type and excluding the transition being edited, if any.
 */
export function findTransitionSlotConflict(
  existingTransitionsToSameTarget: TransitionElement[],
  candidate: TransitionElement
): { blocked: boolean; reason?: string } {
  const candidateSlot = classifyTransitionSlot(candidate);

  if (candidateSlot === 'invalid-both') {
    return { blocked: true, reason: "A transition can't have both an event and a condition." };
  }

  const conflict = existingTransitionsToSameTarget.some(
    (t) => classifyTransitionSlot(t) === candidateSlot
  );
  if (conflict) {
    return {
      blocked: true,
      reason:
        candidateSlot === 'event'
          ? 'Only one event-based transition is allowed between these two states.'
          : 'Only one condition-based transition is allowed between these two states.',
    };
  }

  return { blocked: false };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: all 12 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/transition-slot-rules.ts src/lib/utils/transition-slot-rules.test.ts
git commit -m "feat: add transition slot classification and conflict rule"
```

---

### Task 2: Document-level slot-conflict checks

**Files:**
- Modify: `src/lib/utils/transition-slot-rules.ts`
- Modify: `src/lib/utils/transition-slot-rules.test.ts`

These wrap Task 1's pure functions with the document lookups needed at each call site — same shape as the existing `wouldMergeDistinctGroups(scxmlDoc, sourceId, targetId)` in `src/lib/utils/initial-group-utils.ts:197-223`.

- [ ] **Step 1: Write the failing tests for `checkNewConnectionSlotConflict`**

Append to `src/lib/utils/transition-slot-rules.test.ts` (add `SCXMLDocument` to the existing type import):

```ts
import type { TransitionElement, SCXMLDocument } from '@/types/scxml';
```

```ts
describe('checkNewConnectionSlotConflict', () => {
  it('blocks a new connection when an event-slot transition to the same target already exists', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    const result = checkNewConnectionSlotConflict(doc, 'A', 'B');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one event-based transition/i);
  });

  it('does not block a new connection when only a cond-slot transition to the target exists', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_cond': 'x>1', '@_target': 'B' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new connection when the source has no transitions at all', () => {
    const doc: SCXMLDocument = { scxml: { state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new connection when the existing transition targets a different state', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'C' } },
          { '@_id': 'B' },
          { '@_id': 'C' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });

  it('does not block a new (external) connection when the existing event-slot transition to the target is internal', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B', '@_type': 'internal' } },
          { '@_id': 'B' },
        ],
      } as any,
    };
    expect(checkNewConnectionSlotConflict(doc, 'A', 'B')).toEqual({ blocked: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: FAIL — `checkNewConnectionSlotConflict is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add to the top of `src/lib/utils/transition-slot-rules.ts` (alongside the existing `TransitionElement` import):

```ts
import type { TransitionElement, SCXMLDocument } from '@/types/scxml';
import { findStateById } from './scxml-manipulation-utils';
```

Append to `src/lib/utils/transition-slot-rules.ts`:

```ts
/**
 * A freshly-drawn diagram connection is always constructed as an event-slot candidate
 * (auto-generated event name, no cond — see onConnect in visual-diagram.tsx), so this
 * only ever needs to check the event slot.
 */
export function checkNewConnectionSlotConflict(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  targetId: string
): { blocked: boolean; reason?: string } {
  const sourceState = findStateById(scxmlDoc, sourceId);
  if (!sourceState || !sourceState.transition) return { blocked: false };

  const existing = Array.isArray(sourceState.transition)
    ? sourceState.transition
    : [sourceState.transition];
  const sameTarget = existing.filter(
    (t) => t['@_target'] === targetId && (t['@_type'] || 'external') === 'external'
  );

  const candidate: TransitionElement = { '@_event': '__new_connection__', '@_target': targetId };
  return findTransitionSlotConflict(sameTarget, candidate);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: all 17 tests PASS (the `checkTransitionEditSlotConflict` import in the next tests will fail — expected).

- [ ] **Step 5: Write the failing tests for `checkTransitionEditSlotConflict`**

Append to `src/lib/utils/transition-slot-rules.test.ts`:

```ts
describe('checkTransitionEditSlotConflict', () => {
  it('excludes the transition being edited from the conflict check (no self-conflict)', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'A',
            transition: [
              { '@_event': 'e1', '@_target': 'B' },
              { '@_cond': 'x>1', '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    };
    // Re-saving transition index 0's own event should not conflict with itself.
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result).toEqual({ blocked: false });
  });

  it('blocks switching a transition into a slot already occupied by a sibling', () => {
    const doc: SCXMLDocument = {
      scxml: {
        state: [
          {
            '@_id': 'A',
            transition: [
              { '@_event': 'e1', '@_target': 'B' },
              { '@_cond': 'x>1', '@_target': 'B' },
            ],
          },
          { '@_id': 'B' },
        ],
      } as any,
    };
    // Editing transition index 0 (currently event-slot) to a cond collides with index 1 (cond-slot).
    const candidate: TransitionElement = { '@_cond': 'y<0', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/only one condition-based transition/i);
  });

  it('blocks a candidate with both event and cond regardless of transitionIndex', () => {
    const doc: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } }, { '@_id': 'B' }] } as any,
    };
    const candidate: TransitionElement = { '@_event': 'e2', '@_cond': 'x>1', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', 0, candidate);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/both an event and a condition/i);
  });

  it('does not exclude anything when transitionIndex is undefined (e.g. index could not be parsed)', () => {
    const doc: SCXMLDocument = {
      scxml: { state: [{ '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } }, { '@_id': 'B' }] } as any,
    };
    const candidate: TransitionElement = { '@_event': 'e2', '@_target': 'B' };
    const result = checkTransitionEditSlotConflict(doc, 'A', undefined, candidate);
    expect(result.blocked).toBe(true);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: FAIL — `checkTransitionEditSlotConflict is not a function`.

- [ ] **Step 7: Write the minimal implementation**

Append to `src/lib/utils/transition-slot-rules.ts`:

```ts
/**
 * transitionIndex identifies the transition currently being edited (its index within the
 * source state's transition array, as parsed from the edge id by
 * parseTransitionIndexFromEdgeId) so it's excluded from the conflict check against itself.
 */
export function checkTransitionEditSlotConflict(
  scxmlDoc: SCXMLDocument,
  sourceId: string,
  transitionIndex: number | undefined,
  candidate: TransitionElement
): { blocked: boolean; reason?: string } {
  const sourceState = findStateById(scxmlDoc, sourceId);
  if (!sourceState || !sourceState.transition) return findTransitionSlotConflict([], candidate);

  const all = Array.isArray(sourceState.transition) ? sourceState.transition : [sourceState.transition];
  const candidateType = candidate['@_type'] || 'external';
  const sameTarget = all.filter(
    (t, i) =>
      i !== transitionIndex &&
      t['@_target'] === candidate['@_target'] &&
      (t['@_type'] || 'external') === candidateType
  );

  return findTransitionSlotConflict(sameTarget, candidate);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/transition-slot-rules.test.ts`
Expected: all 21 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/transition-slot-rules.ts src/lib/utils/transition-slot-rules.test.ts
git commit -m "feat: add document-level transition slot conflict checks"
```

---

### Task 3: Wire connect-gesture blocking into the diagram

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

This reuses the exact block+banner pattern already used for `wouldMergeDistinctGroups`. The existing state variable `initialGroupConflictMessage` gets renamed to `connectionBlockedMessage` since it will now serve two different conflict reasons — purely a rename, no behavior change to the existing Initial-State-group check.

- [ ] **Step 1: Add the import**

In `src/components/diagram/visual-diagram.tsx`, find this existing import block (currently around line 17-20):

```ts
import {
  mergeDuplicateTransitionsInDocument,
  mergeDuplicateTransitionsByEventInDocument,
} from '@/lib/utils/transition-merge-utils';
```

Add immediately after it:

```ts
import {
  checkNewConnectionSlotConflict,
  checkTransitionEditSlotConflict,
} from '@/lib/utils/transition-slot-rules';
```

(The `mergeDuplicateTransitionsInDocument`/`mergeDuplicateTransitionsByEventInDocument` import block itself is removed in Task 4, once its last two call sites are deleted — don't remove it yet, it's still used in `handleTransitionApply` until then.)

- [ ] **Step 2: Rename the conflict-message state and its effect**

Find (around line 218-224):

```ts
  const [initialGroupConflictMessage, setInitialGroupConflictMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!initialGroupConflictMessage) return;
    const timer = setTimeout(() => setInitialGroupConflictMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [initialGroupConflictMessage]);
```

Replace with:

```ts
  const [connectionBlockedMessage, setConnectionBlockedMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!connectionBlockedMessage) return;
    const timer = setTimeout(() => setConnectionBlockedMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [connectionBlockedMessage]);
```

- [ ] **Step 3: Update `onConnect`'s existing group-conflict block and add the new slot check**

Find (around line 848-868):

```ts
  const onConnect = useCallback(
    (params: Connection) => {
      let preParsedDoc: SCXMLDocument | undefined;
      if (params.source && params.target && parserRef.current && scxmlContent) {
        const preCheck = parserRef.current.parse(scxmlContent);
        if (preCheck.success && preCheck.data) {
          preParsedDoc = preCheck.data;
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

Replace with:

```ts
  const onConnect = useCallback(
    (params: Connection) => {
      let preParsedDoc: SCXMLDocument | undefined;
      if (params.source && params.target && parserRef.current && scxmlContent) {
        const preCheck = parserRef.current.parse(scxmlContent);
        if (preCheck.success && preCheck.data) {
          preParsedDoc = preCheck.data;
          const { blocked, reason } = wouldMergeDistinctGroups(
            preCheck.data,
            params.source,
            params.target
          );
          if (blocked) {
            setConnectionBlockedMessage(
              reason || 'Cannot connect states that belong to different Initial State groups.'
            );
            return;
          }

          const slotCheck = checkNewConnectionSlotConflict(preCheck.data, params.source, params.target);
          if (slotCheck.blocked) {
            setConnectionBlockedMessage(slotCheck.reason || 'Cannot add this transition.');
            return;
          }
        }
      }
```

- [ ] **Step 4: Update `isValidConnection`**

Find (around line 970-994):

```ts
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return true;
      if (!parserRef.current || !scxmlContent) return true;
      const parseResult = parserRef.current.parse(scxmlContent);
      if (!parseResult.success || !parseResult.data) return true;

      const { blocked, reason } = wouldMergeDistinctGroups(
        parseResult.data,
        connection.source,
        connection.target
      );
      if (blocked) {
        // ReactFlow never calls onConnect for a connection isValidConnection
        // rejects, so this is the only place a warning can be surfaced —
        // fires live while dragging (on hover) and again on drop.
        setInitialGroupConflictMessage(
          reason || 'Cannot connect states that belong to different Initial State groups.'
        );
        return false;
      }
      return true;
    },
    [scxmlContent]
  );
```

Replace with:

```ts
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return true;
      if (!parserRef.current || !scxmlContent) return true;
      const parseResult = parserRef.current.parse(scxmlContent);
      if (!parseResult.success || !parseResult.data) return true;

      const { blocked, reason } = wouldMergeDistinctGroups(
        parseResult.data,
        connection.source,
        connection.target
      );
      if (blocked) {
        // ReactFlow never calls onConnect for a connection isValidConnection
        // rejects, so this is the only place a warning can be surfaced —
        // fires live while dragging (on hover) and again on drop.
        setConnectionBlockedMessage(
          reason || 'Cannot connect states that belong to different Initial State groups.'
        );
        return false;
      }

      const slotCheck = checkNewConnectionSlotConflict(parseResult.data, connection.source, connection.target);
      if (slotCheck.blocked) {
        setConnectionBlockedMessage(slotCheck.reason || 'Cannot add this transition.');
        return false;
      }
      return true;
    },
    [scxmlContent]
  );
```

- [ ] **Step 5: Update the banner's JSX props**

Find (around line 2698-2701):

```tsx
          <InitialGroupConflictBanner
            message={initialGroupConflictMessage}
            onDismiss={() => setInitialGroupConflictMessage(null)}
          />
```

Replace with:

```tsx
          <InitialGroupConflictBanner
            message={connectionBlockedMessage}
            onDismiss={() => setConnectionBlockedMessage(null)}
          />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (in particular, no leftover references to `initialGroupConflictMessage`/`setInitialGroupConflictMessage` — grep to confirm: `grep -n "initialGroupConflictMessage" src/components/diagram/visual-diagram.tsx` should return nothing).

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat: block diagram connections that would violate transition slot rules"
```

---

### Task 4: Wire panel-edit blocking, remove merge-on-edit

**Files:**
- Modify: `src/components/diagram/transition-panel.tsx`
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Add `TransitionApplyResult` type and update `onApply`'s prop type**

In `src/components/diagram/transition-panel.tsx`, find:

```ts
export interface TransitionApplyArgs {
  newValue: string;
  editingField: 'event' | 'cond';
  delay: { type: 'delay' | 'delayexpr'; value: string } | null;
  cancelSendId: string | null;
  originalEventName: string | undefined;
  originalCancelSendId: string | undefined;
}
```

Add immediately after it:

```ts
export type TransitionApplyResult = { blocked: boolean; reason?: string } | void;
```

Find:

```ts
  onApply: (args: TransitionApplyArgs) => void;
```

Replace with:

```ts
  onApply: (args: TransitionApplyArgs) => TransitionApplyResult;
```

- [ ] **Step 2: Add local warning state**

Find (around line 86):

```ts
  const [selectionMode, setSelectionMode] = React.useState<'undecided' | 'event' | 'cond'>(initSelectionMode);
```

Add immediately after it:

```ts
  const [applyError, setApplyError] = React.useState<string | null>(null);
```

- [ ] **Step 3: Capture `onApply`'s result in both call sites of `handleApply`**

Find (the time-parsed / "after X" branch):

```ts
      onApply({
        newValue: eventName,
        editingField: 'event',
        delay: timeParsed,
        cancelSendId: eventName,
        originalEventName: event,
        originalCancelSendId: initCancelId || undefined,
      });
      return;
    }
```

Replace with:

```ts
      const timeResult = onApply({
        newValue: eventName,
        editingField: 'event',
        delay: timeParsed,
        cancelSendId: eventName,
        originalEventName: event,
        originalCancelSendId: initCancelId || undefined,
      });
      setApplyError(timeResult && timeResult.blocked ? timeResult.reason ?? 'This change is not allowed.' : null);
      return;
    }
```

Find (the regular event/cond branch):

```ts
    onApply({
      newValue: trimmed,
      editingField: resolvedField,
      delay: null,
      cancelSendId: null,
      originalEventName: event,
      originalCancelSendId: initCancelId || undefined,
    });
  };
```

Replace with:

```ts
    const result = onApply({
      newValue: trimmed,
      editingField: resolvedField,
      delay: null,
      cancelSendId: null,
      originalEventName: event,
      originalCancelSendId: initCancelId || undefined,
    });
    setApplyError(result && result.blocked ? result.reason ?? 'This change is not allowed.' : null);
  };
```

- [ ] **Step 4: Clear the warning as soon as the user edits the input again**

Find (the input's `onChange`, around line 315-321):

```tsx
            onChange={(e) => {
              const v = e.target.value;
              setRawValue(v);
              if (v === '') setSelectionMode('undecided');
              setIsOpen(true);
              setActiveIndex(-1);
            }}
```

Replace with:

```tsx
            onChange={(e) => {
              const v = e.target.value;
              setRawValue(v);
              if (v === '') setSelectionMode('undecided');
              setIsOpen(true);
              setActiveIndex(-1);
              setApplyError(null);
            }}
```

- [ ] **Step 5: Render the warning inline below the input**

Find (the closing of the input's wrapping div, around line 348-349):

```tsx
          )}
        </div>
      </div>

    </Panel>
```

Replace with:

```tsx
          )}
        </div>
        {applyError && (
          <p className='mt-1.5 text-xs text-error'>{applyError}</p>
        )}
      </div>

    </Panel>
```

- [ ] **Step 6: Wire the pre-check into `handleTransitionApply` and remove the merge-on-edit calls**

In `src/components/diagram/visual-diagram.tsx`, find the full `handleTransitionApply` callback:

```ts
  const handleTransitionApply = React.useCallback(
    ({ newValue, editingField, delay, cancelSendId, originalEventName, originalCancelSendId }: TransitionApplyArgs) => {
      if (!onSCXMLChange || !scxmlContent || !selectedEdgeForEdit) return;
      try {
        let content = scxmlContent;

        // Step 1: apply transition event/cond update
        const { UpdateTransitionCommand } = require('@/lib/commands');
        const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
        const transitionIndex = parseTransitionIndexFromEdgeId(selectedEdgeForEdit.id);
        const transResult = new UpdateTransitionCommand(
          selectedEdgeForEdit.source,
          selectedEdgeForEdit.target,
          selectedEdgeForEdit.event,
          selectedEdgeForEdit.cond,
          newValue,
          editingField,
          transitionIndex
        ).execute(content);
        if (transResult.success) content = transResult.newContent;
        else console.error('Failed to update transition:', transResult.error);

        // Step 2: apply delay/cancel actions on the already-updated content
        // Runs in event mode (add/remove) and when switching to cond (cleanup old send/cancel)
        if (editingField === 'event' || (editingField === 'cond' && originalEventName)) {
          const sourceNodeId = selectedEdgeForEdit.source;
          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          if (sourceNode) {
            const existingEntry: string[] = sourceNode.data.entryActions ?? [];
            const existingExit: string[] = sourceNode.data.exitActions ?? [];

            // Remove send for original OR new event name, then add back if delay is set
            const newEntry = [
              ...existingEntry.filter((a) => {
                if (newValue && a.startsWith(`send|${newValue}|`)) return false;
                if (originalEventName && a.startsWith(`send|${originalEventName}|`)) return false;
                return true;
              }),
              ...(delay ? [`send|${newValue}|${delay.type}|${delay.value}`] : []),
            ];

            // Remove old cancel by original sendId and by new sendId, then add back if set
            const newExit = [
              ...existingExit.filter((a) => {
                if (originalCancelSendId && a === `cancel|${originalCancelSendId}`) return false;
                if (cancelSendId && a === `cancel|${cancelSendId}`) return false;
                return true;
              }),
              ...(cancelSendId ? [`cancel|${cancelSendId}`] : []),
            ];

            const entryChanged = JSON.stringify(newEntry) !== JSON.stringify(existingEntry);
            const exitChanged = JSON.stringify(newExit) !== JSON.stringify(existingExit);
            if (entryChanged || exitChanged) {
              const { UpdateActionsCommand } = require('@/lib/commands');
              const actResult = new UpdateActionsCommand(sourceNodeId, newEntry, newExit).execute(content);
              if (actResult.success) content = actResult.newContent;
              else console.error('Failed to update actions:', actResult.error);
            }
          }
        }

        // If this edit's new condition now makes this transition a duplicate of another
        // transition to the same target (same actions), fold them into one OR'd transition.
        if (editingField === 'cond') {
          content = mergeDuplicateTransitionsInDocument(content);
        }
        // If this edit's new event now makes this transition a duplicate of another
        // transition to the same target/cond (same actions), fold them into one
        // transition with a comma-combined event list.
        if (editingField === 'event') {
          content = mergeDuplicateTransitionsByEventInDocument(content);
        }

        onSCXMLChange(content, 'property');
      } catch (error) {
        console.error('Failed to apply transition:', error);
      }
```

Replace with:

```ts
  const handleTransitionApply = React.useCallback(
    ({ newValue, editingField, delay, cancelSendId, originalEventName, originalCancelSendId }: TransitionApplyArgs): TransitionApplyResult => {
      if (!onSCXMLChange || !scxmlContent || !selectedEdgeForEdit) return;
      try {
        // Pre-check: block if this edit would create a duplicate slot or an invalid
        // event+cond-both transition, instead of applying it. UpdateTransitionCommand
        // always clears the field NOT being edited, so the candidate is unambiguous.
        if (parserRef.current) {
          const preCheck = parserRef.current.parse(scxmlContent);
          if (preCheck.success && preCheck.data) {
            const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
            const transitionIndex = parseTransitionIndexFromEdgeId(selectedEdgeForEdit.id);
            const candidate: TransitionElement =
              editingField === 'cond'
                ? { '@_cond': newValue, '@_target': selectedEdgeForEdit.target }
                : { '@_event': newValue, '@_target': selectedEdgeForEdit.target };
            const slotCheck = checkTransitionEditSlotConflict(
              preCheck.data,
              selectedEdgeForEdit.source,
              transitionIndex,
              candidate
            );
            if (slotCheck.blocked) {
              return { blocked: true, reason: slotCheck.reason };
            }
          }
        }

        let content = scxmlContent;

        // Step 1: apply transition event/cond update
        const { UpdateTransitionCommand } = require('@/lib/commands');
        const { parseTransitionIndexFromEdgeId } = require('@/lib/converters/converter-modules');
        const transitionIndex = parseTransitionIndexFromEdgeId(selectedEdgeForEdit.id);
        const transResult = new UpdateTransitionCommand(
          selectedEdgeForEdit.source,
          selectedEdgeForEdit.target,
          selectedEdgeForEdit.event,
          selectedEdgeForEdit.cond,
          newValue,
          editingField,
          transitionIndex
        ).execute(content);
        if (transResult.success) content = transResult.newContent;
        else console.error('Failed to update transition:', transResult.error);

        // Step 2: apply delay/cancel actions on the already-updated content
        // Runs in event mode (add/remove) and when switching to cond (cleanup old send/cancel)
        if (editingField === 'event' || (editingField === 'cond' && originalEventName)) {
          const sourceNodeId = selectedEdgeForEdit.source;
          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          if (sourceNode) {
            const existingEntry: string[] = sourceNode.data.entryActions ?? [];
            const existingExit: string[] = sourceNode.data.exitActions ?? [];

            // Remove send for original OR new event name, then add back if delay is set
            const newEntry = [
              ...existingEntry.filter((a) => {
                if (newValue && a.startsWith(`send|${newValue}|`)) return false;
                if (originalEventName && a.startsWith(`send|${originalEventName}|`)) return false;
                return true;
              }),
              ...(delay ? [`send|${newValue}|${delay.type}|${delay.value}`] : []),
            ];

            // Remove old cancel by original sendId and by new sendId, then add back if set
            const newExit = [
              ...existingExit.filter((a) => {
                if (originalCancelSendId && a === `cancel|${originalCancelSendId}`) return false;
                if (cancelSendId && a === `cancel|${cancelSendId}`) return false;
                return true;
              }),
              ...(cancelSendId ? [`cancel|${cancelSendId}`] : []),
            ];

            const entryChanged = JSON.stringify(newEntry) !== JSON.stringify(existingEntry);
            const exitChanged = JSON.stringify(newExit) !== JSON.stringify(existingExit);
            if (entryChanged || exitChanged) {
              const { UpdateActionsCommand } = require('@/lib/commands');
              const actResult = new UpdateActionsCommand(sourceNodeId, newEntry, newExit).execute(content);
              if (actResult.success) content = actResult.newContent;
              else console.error('Failed to update actions:', actResult.error);
            }
          }
        }

        onSCXMLChange(content, 'property');
      } catch (error) {
        console.error('Failed to apply transition:', error);
      }
```

Note the closing `, [scxmlContent, onSCXMLChange, selectedEdgeForEdit, nodes]);` dependency array right after this callback body is unchanged — leave it as-is.

- [ ] **Step 7: Update the `TransitionPanel` import and remove the now-unused merge-utils import**

Find:

```ts
import { TransitionPanel, type TransitionApplyArgs } from './transition-panel';
```

Replace with:

```ts
import { TransitionPanel, type TransitionApplyArgs, type TransitionApplyResult } from './transition-panel';
```

Find and delete entirely (now unused — both call sites were just removed in Step 6):

```ts
import {
  mergeDuplicateTransitionsInDocument,
  mergeDuplicateTransitionsByEventInDocument,
} from '@/lib/utils/transition-merge-utils';
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `grep -n "mergeDuplicateTransitionsInDocument\|mergeDuplicateTransitionsByEventInDocument" src/components/diagram/visual-diagram.tsx`
Expected: no output (confirms the import and both call sites are gone).

- [ ] **Step 9: Commit**

```bash
git add src/components/diagram/transition-panel.tsx src/components/diagram/visual-diagram.tsx
git commit -m "feat: block transition panel edits that violate slot rules, remove merge-on-edit"
```

---

### Task 5: Code-editor validator

**Files:**
- Create: `src/lib/validators/transition-slot-validator.ts`
- Test: `src/lib/validators/transition-slot-validator.test.ts`
- Modify: `src/lib/validators/scxml-validator.ts`
- Modify: `src/lib/validators/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/validators/transition-slot-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SCXMLElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { validateTransitionSlotConflicts } from './transition-slot-validator';

describe('validateTransitionSlotConflicts', () => {
  it('reports no errors for one event-slot and one cond-slot transition to the same target (the allowed case)', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'e1', '@_target': 'B' },
            { '@_cond': 'x>1', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
  });

  it('reports an error for a transition with both event and cond set', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'A', transition: { '@_event': 'e1', '@_cond': 'x>1', '@_target': 'B' } },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(1);
    expect(errors[0].severity).toBe('error');
    expect(errors[0].message).toMatch(/both an event and a condition/i);
  });

  it('reports one error per transition when two event-slot transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_event': 'e1', '@_target': 'B' },
            { '@_event': 'e2', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
    errors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.message).toMatch(/only one event-based transition/i);
    });
  });

  it('reports one error per transition when two cond-slot transitions target the same state', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'A',
          transition: [
            { '@_cond': 'x>1', '@_target': 'B' },
            { '@_cond': 'x<0', '@_target': 'B' },
          ],
        },
        { '@_id': 'B' },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
    errors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.message).toMatch(/only one condition-based transition/i);
    });
  });

  it('reports no errors for clean, non-conflicting transitions across multiple states', () => {
    const scxml: SCXMLElement = {
      state: [
        { '@_id': 'A', transition: { '@_event': 'e1', '@_target': 'B' } },
        { '@_id': 'B', transition: { '@_cond': 'x>1', '@_target': 'A' } },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors).toEqual([]);
  });

  it('recurses into nested state and parallel elements', () => {
    const scxml: SCXMLElement = {
      state: [
        {
          '@_id': 'Parent',
          state: [
            {
              '@_id': 'A',
              transition: [
                { '@_event': 'e1', '@_target': 'B' },
                { '@_event': 'e2', '@_target': 'B' },
              ],
            },
            { '@_id': 'B' },
          ],
        },
      ],
    } as any;
    const errors: ValidationError[] = [];
    validateTransitionSlotConflicts(scxml, undefined, errors);
    expect(errors.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/validators/transition-slot-validator.test.ts`
Expected: FAIL — `Cannot find module './transition-slot-validator'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/validators/transition-slot-validator.ts`:

```ts
import type { SCXMLElement, StateElement, ParallelElement, TransitionElement } from '@/types/scxml';
import type { ValidationError } from '@/types/common';
import { findTransitionPosition } from './validator-utils';
import { classifyTransitionSlot } from '@/lib/utils/transition-slot-rules';

/**
 * Flags, per (source state, target, type) family, any transition with both event and
 * cond set (always invalid), and any slot ('event' or 'cond') occupied by more than one
 * transition. This is the code-editor-visible counterpart to the live blocking already
 * done in the diagram connect gesture and the transition panel — it only ever fires on
 * violations introduced after load, since legacy duplicates are silently merged away by
 * transition-merge-utils.ts before this validator ever sees the content.
 */
export function validateTransitionSlotConflicts(
  scxml: SCXMLElement,
  xmlContent: string | undefined,
  errors: ValidationError[]
): void {
  const validateElement = (element: SCXMLElement | StateElement | ParallelElement) => {
    const sourceId = (element as any)['@_id'];
    if ((element as any).transition && sourceId) {
      const transitions: TransitionElement[] = Array.isArray((element as any).transition)
        ? (element as any).transition
        : [(element as any).transition];

      // Group by (target, type) so each slot family is checked independently.
      const groups = new Map<string, TransitionElement[]>();
      for (const t of transitions) {
        if (!t['@_target']) continue;
        const type = t['@_type'] || 'external';
        const key = `${t['@_target']}::${type}`;
        const list = groups.get(key) ?? [];
        list.push(t);
        groups.set(key, list);
      }

      for (const group of groups.values()) {
        const bySlot = new Map<'event' | 'cond', TransitionElement[]>();

        for (const t of group) {
          const slot = classifyTransitionSlot(t);
          if (slot === 'invalid-both') {
            const position = findTransitionPosition(sourceId, t['@_target']!, xmlContent, t['@_event'], t['@_cond']);
            errors.push({
              message: `Transition from '${sourceId}' to '${t['@_target']}' can't have both an event and a condition.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
            continue;
          }
          const list = bySlot.get(slot) ?? [];
          list.push(t);
          bySlot.set(slot, list);
        }

        for (const [slot, list] of bySlot) {
          if (list.length <= 1) continue;
          for (const t of list) {
            const position = findTransitionPosition(sourceId, t['@_target']!, xmlContent, t['@_event'], t['@_cond']);
            errors.push({
              message:
                slot === 'event'
                  ? `Only one event-based transition is allowed from '${sourceId}' to '${t['@_target']}'.`
                  : `Only one condition-based transition is allowed from '${sourceId}' to '${t['@_target']}'.`,
              severity: 'error',
              line: position?.line,
              column: position?.column,
            });
          }
        }
      }
    }

    if (element.state) {
      const states = Array.isArray(element.state) ? element.state : [element.state];
      states.forEach((s) => validateElement(s));
    }
    if (element.parallel) {
      const parallels = Array.isArray(element.parallel) ? element.parallel : [element.parallel];
      parallels.forEach((p) => validateElement(p));
    }
  };

  validateElement(scxml);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/validators/transition-slot-validator.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Register the validator in `SCXMLValidator.validate()`**

In `src/lib/validators/scxml-validator.ts`, find:

```ts
import {
  validateStateReferences,
  validateInitialStates,
  validateTransitionSemantics,
  validateCrossHierarchyTransitions,
} from './transition-validator';
import { validateInitialStateGroups } from './initial-group-validator';
```

Replace with:

```ts
import {
  validateStateReferences,
  validateInitialStates,
  validateTransitionSemantics,
  validateCrossHierarchyTransitions,
} from './transition-validator';
import { validateInitialStateGroups } from './initial-group-validator';
import { validateTransitionSlotConflicts } from './transition-slot-validator';
```

Find:

```ts
    this.validateStateMachineSemanticsInternal(scxml, stateIds, errors);
    validateTransitionSemantics(scxml, stateIds, errors);
    validateExecutableElements(scxml, errors);
```

Replace with:

```ts
    this.validateStateMachineSemanticsInternal(scxml, stateIds, errors);
    validateTransitionSemantics(scxml, stateIds, errors);
    validateTransitionSlotConflicts(scxml, this.xmlContent, errors);
    validateExecutableElements(scxml, errors);
```

- [ ] **Step 6: Export from the validators index**

In `src/lib/validators/index.ts`, find:

```ts
export * from './initial-group-validator';
```

Replace with:

```ts
export * from './initial-group-validator';
export * from './transition-slot-validator';
```

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests PASS, including the 6 new ones and everything pre-existing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validators/transition-slot-validator.ts src/lib/validators/transition-slot-validator.test.ts src/lib/validators/scxml-validator.ts src/lib/validators/index.ts
git commit -m "feat: validate transition slot conflicts in the SCXML validator pipeline"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

---

### Task 7: Live smoke test

**Files:** none (temporary local verification only — nothing here gets committed)

Follow the same approach used to verify the merge feature in the prior session: install Playwright locally without touching `package.json`/`package-lock.json` (`npm install --no-save playwright`), start the dev server, drive it, then clean up afterward (`npm dedupe` then `git checkout -- package-lock.json` to discard any lockfile drift the temporary install caused, matching the cleanup procedure already established in this repo's session history).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background), then poll `http://localhost:3000` until it responds.

- [ ] **Step 2: Verify connect-gesture blocking**

Load a fixture SCXML with one event-slot transition A→B. In the diagram, draw a second connection from A to B. Expected: no second edge is created, and a warning banner appears at the bottom of the canvas (e.g. "Only one event-based transition is allowed between these two states.").

- [ ] **Step 3: Verify panel-edit blocking**

Load a fixture SCXML with two transitions A→B: one event-slot (`event="e1"`), one cond-slot (`cond="x>1"`). Open the panel for the event-slot transition (`e1`). Clear the input field, then type a condition value (e.g. `x==5`) — per the panel's field-resolution logic this becomes a `cond` edit, which would switch this transition into the cond slot already occupied by the other one. Click Save. Expected: the SCXML is unchanged (both transitions keep their original `event`/`cond` values), the panel stays open, and an inline warning appears near the input (e.g. "Only one condition-based transition is allowed between these two states.").

- [ ] **Step 4: Verify code-editor validation**

Switch to the code view. Hand-edit a transition to add both `event="e1"` and `cond="x>1"` on the same `<transition>` tag. Expected: a red squiggle appears under/near the transition in the Monaco editor, and a corresponding entry appears in the Validation panel.

- [ ] **Step 5: Clean up**

Stop the dev server. Run `npm dedupe` if `package-lock.json` shows a diff afterward, then `git checkout -- package-lock.json` to discard any lockfile drift from the temporary Playwright install (matching the cleanup already performed earlier this session). Remove any temporary smoke-test script/fixture files created for this step. Confirm `git status --short` shows only the files intentionally changed by Tasks 1-5.

---

## Self-review notes (for whoever reads this plan before executing)

- Every task's code is copy-pasteable against the current file contents as read during planning; if a file has changed since, re-locate the `old_string` context before editing.
- Task 3 and Task 4 both touch `visual-diagram.tsx` but different regions — execute them in order (3 before 4) since Task 4's diff assumes Task 3's rename (`connectionBlockedMessage`) is already in place, though the two don't otherwise overlap.
- No task leaves `mergeDuplicateTransitionsInDocument`/`mergeDuplicateTransitionsByEventInDocument` imported-but-unused in `visual-diagram.tsx` — Task 4 Step 7 removes that import in the same commit that removes its last two call sites.
