# Transition slot validation — design

## Context

The previous feature (branch `parallel-states`, commits `72134d7`, `003d1ef`) automatically merges duplicate A→B transitions — combining differing `cond` values with OR, or differing `event` values into a comma-joined list — both at file-load time and (as of last session) whenever a transition's `event`/`cond` was edited in the diagram's transition panel.

That auto-merge-on-edit turned out to be the wrong behavior for the live editor: it silently rewrites a user's own in-progress edit into a merged form they didn't ask for. The correct split, per this session's discussion:

- **Old/legacy files** (opened from disk, possibly hand-authored or from before this app enforced any structure) may already contain multiple transitions between the same two states. These should keep being **silently auto-merged on load** — no behavior change here.
- **New transitions**, created or edited going forward through this app (diagram connect gesture, transition panel, or the code editor), should never be allowed to *create* a duplicate in the first place. Instead of merging, the action should be **blocked with a warning**.

This document defines the exact rule and where it's enforced.

## The rule

Between any two states A (source) and B (target), scoped separately per `@_type` (internal/external — consistent with how the existing merge feature already treats internal/external as distinct families), a transition falls into exactly one of three classes:

Both `event` and `cond` are treated as **absent** if missing entirely or whitespace-only (consistent with how `condsAreEqual`/`combineConditions` already treat emptiness elsewhere in this codebase).

- **`event` slot** — `cond` is absent. Covers both an event-triggered transition (`event="click"`) and a bare, condition-less, event-less "always" transition. **At most one** transition in this slot is allowed per (source, target, type).
- **`cond` slot** — `cond` is present and `event` is absent. **At most one** transition in this slot is allowed per (source, target, type).
- **Invalid** — both `event` and `cond` are present on the same transition. **Never allowed**, regardless of how many other transitions exist between the same two states.

Violating this (attempting to create a 2nd transition in an already-occupied slot, or creating a transition with both `event` and `cond` set) is **blocked**, with a warning shown to the user, in all three places a transition can be created or edited: the diagram connect gesture, the transition panel, and the code editor.

Note on reachability: `UpdateTransitionCommand` (`src/lib/commands/update-transition-command.ts:66-74`) already clears the *opposite* attribute on every panel edit — setting `cond` always removes `event`, and vice versa — so the "both present" case can't actually be produced through the transition panel today. It remains reachable through hand-edited or legacy XML, which is exactly why the code-editor validator (integration point 3) matters: it's the only surface where "both present" can currently occur. The panel-edit check (integration point 2) still validates it defensively for correctness, and the duplicate-slot checks (2 transitions in the same slot) remain fully reachable through ordinary panel/diagram use.

## Architecture

### New module: `src/lib/utils/transition-slot-rules.ts`

A small, pure, framework-free module — deliberately separate from `transition-merge-utils.ts` (which remains exactly as-is: the silent, load-time-only auto-fix for legacy files). Keeping "auto-fix old files" and "block new violations" in separate modules keeps each easy to reason about independently.

```ts
export type TransitionSlot = 'event' | 'cond' | 'invalid-both';

/** cond absent -> 'event' (covers event-only and bare/always transitions).
 *  cond present + event absent -> 'cond'.
 *  both present -> 'invalid-both'. */
export function classifyTransitionSlot(t: TransitionElement): TransitionSlot;

/**
 * existingTransitionsToSameTarget: the OTHER transitions already on this source
 * state that target the same state + type as `candidate` (the transition being
 * edited/created must be excluded by the caller before calling this).
 */
export function findTransitionSlotConflict(
  existingTransitionsToSameTarget: TransitionElement[],
  candidate: TransitionElement
): { blocked: boolean; reason?: string };
```

`findTransitionSlotConflict` reasons in this order:
1. If `classifyTransitionSlot(candidate) === 'invalid-both'` → blocked, reason: "A transition can't have both an event and a condition."
2. Else if any existing transition shares the candidate's slot → blocked, reason depends on slot: "Only one event-based transition is allowed between these two states." / "Only one condition-based transition is allowed between these two states."
3. Else → not blocked.

Both `state` and `parallel` elements are in scope; `initial`/`history` transitions are excluded (same precedent as the merge feature — SCXML already restricts those to effectively one transition each).

### Integration point 1 — diagram connect gesture

`onConnect` and `isValidConnection` in `visual-diagram.tsx`, right where `wouldMergeDistinctGroups` already performs a similar live block for a different rule (Initial-State-group conflicts). A freshly-drawn connection is always constructed as an `event`-slot candidate (auto-generated event name, no cond), so this only ever needs to check the `event` slot.

- `isValidConnection` runs the check live while dragging (matches the existing dual live-check + commit-time-check pattern already used for the group-conflict rule).
- `onConnect` runs it again before mutating the SCXML, returning early (no edge created, no SCXML change) if blocked.
- UX: reuse the existing block+banner mechanism (`InitialGroupConflictBanner` or a structurally identical sibling banner) — dismissible, auto-clears after a few seconds, same visual treatment as the existing conflict banner so the two "connection blocked" cases feel consistent to the user.

### Integration point 2 — transition panel edits

`handleTransitionApply` in `visual-diagram.tsx`, before calling `UpdateTransitionCommand`:

1. Compute what the transition would look like *after* the edit: since `UpdateTransitionCommand` always clears the field not being edited, the candidate is simply `{ event: newValue }` (editing `event`) or `{ cond: newValue }` (editing `cond`) — never both.
2. Look up the other transitions on the same source state targeting the same state+type (excluding the transition currently being edited, identified by its transition index).
3. Run `findTransitionSlotConflict`. If blocked: do **not** run `UpdateTransitionCommand` or call `onSCXMLChange` — keep the panel open, surface the `reason` message.
4. If not blocked: proceed exactly as today.

`TransitionPanel` gets a new small piece of UI: an inline warning message (e.g. red text near the Save button) driven by a new prop from the parent, cleared when the input changes again. Save stays enabled (not disabled) so the user can immediately correct and retry — blocking silently disabling Save with no explanation would be worse UX than showing them why.

**Removed**: the merge-on-edit calls added last session (`mergeDuplicateTransitionsInDocument(content)` / `mergeDuplicateTransitionsByEventInDocument(content)` inside `handleTransitionApply`) are deleted — this blocking check replaces them entirely. The load-time calls in `use-file-operations.ts` (`handleFileLoad`, `handleFileInputChange`) are **not touched** — legacy-file auto-fix on load keeps working exactly as it does today.

### Integration point 3 — code editor

New validator function `validateTransitionSlotConflicts(scxml, xmlContent, errors)`, added into `SCXMLValidator.validate()` in `scxml-validator.ts`, following the same tree-walking shape as the existing `validateTransitionsInElement` (`transition-validator.ts`): for each state/parallel element, group its transitions by (target, type), classify each, and push a `ValidationError` (severity `'error'`) for any slot conflict or invalid-both transition, using `findTransitionPosition`/`parseElementPositions` (already used by `validateCrossHierarchyTransitions`) to attach line/column so it renders as both a Monaco squiggle and a `ValidationPanel` entry — no separate UI wiring needed, since `CodeEditorPane` already feeds the same `errors` array to both.

Because load-time merging runs *before* content ever reaches the validator, this validator only ever sees violations introduced after load (via hand-editing the code view, or in principle any future path that bypasses the live UI blocks) — it never fires on legacy duplicates, which are already gone by the time it runs.

## Testing

- `transition-slot-rules.ts`: unit tests (TDD, same style as `transition-merge-utils.test.ts`) covering all slot classifications, all three conflict scenarios, the "editing preserves the untouched field" scenario, and the type-scoping (internal vs external treated separately).
- `validateTransitionSlotConflicts`: fixture-based tests following `transition-validator.test.ts` conventions — SCXML string in, expected `ValidationError` entries out.
- `onConnect`/`isValidConnection`/`handleTransitionApply` wiring: glue code, verified via a live Playwright smoke test (same approach used to verify the merge feature last session) — confirm a blocked connect shows the banner and creates no edge, a blocked panel edit shows the inline warning and doesn't change the SCXML, and a hand-edited code-view violation shows a squiggle + Validation panel entry.

## Out of scope

- `ReconnectTransitionCommand` (retargeting an existing transition) is not touched — same deferral as noted in the merge-feature design; a duplicate/conflict could still be introduced through it, flagged as a possible follow-up, not designed here.
- No change to the load-time merge behavior (`transition-merge-utils.ts`, `use-file-operations.ts`) — legacy files keep auto-merging silently, as decided.
- `initial`/`history` transitions remain excluded from this rule, matching the merge feature's existing scope.
