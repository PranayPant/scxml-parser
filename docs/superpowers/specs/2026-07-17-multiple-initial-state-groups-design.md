# Multiple Independent Initial State Groups — Design

**Date:** 2026-07-17
**Status:** Approved

## Context

Today a page can contain multiple disconnected groups of states, but there is no way for a
user to explicitly mark a state as an "Initial State," and nothing stops a transition from
merging two groups that should stay independent. Marking a state's *first child* as initial
already happens implicitly when a new child is added under a compound parent
(`visual-diagram.tsx:2024-2029`), but that is a single, automatic, one-shot assignment — there
is no user-facing toggle, and no concept of *multiple* initial roots coexisting under the same
parent.

We want users to be able to explicitly mark any state as an "Initial State." Each Initial
State becomes the root of its own independent connected component among its siblings. Once a
state is transitively connected to an Initial State's component, it can never be connected to
a different Initial State's component — directly or indirectly, regardless of transition
direction.

Two facts about the existing codebase materially simplify this feature:

1. **Cross-hierarchy transitions are already rejected.** `validateCrossHierarchyTransitions`
   (`src/lib/validators/transition-validator.ts:208-294`) already errors on any transition
   between states that don't share the same parent. This means the "must not merge two Initial
   groups" question only ever needs to be evaluated **within one parent's set of direct
   children** — root-level siblings (parent = the `<scxml>` document) or the children of any
   single compound `<state>`. Grouping never needs to reason across parents, because a
   transition across parents is already impossible.
2. **Multi-value `initial` parsing already exists.** `parseStateIdList`
   (`src/lib/validators/validator-utils.ts:206-243`) already parses a space-separated list of
   IDs out of an `initial` attribute, and is already used by `validateStateReferences` (root)
   and `validateInitialStates` (nested compound states). This was built for a different,
   reverted feature, but it means the parsing side of "an `initial` attribute can list more
   than one ID" is already in place — only the write side and the group-consistency checks are
   missing.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Any level of nesting (root and any compound `<state>`'s children) | Requested scope; also the natural consequence of the per-parent algorithm below |
| SCXML representation | Space-separated list in the existing `initial` attribute (`initial="A B"`) | Reuses `parseStateIdList`; no new namespace/attribute; standard SCXML attribute syntax |
| Group storage | Derived on demand, never persisted | Recomputed from the document (initial markers + transitions) every time a check is needed — no risk of stale group data drifting from the actual document |
| Marking a state Initial | Toggle in the `StateActionsPanel` sub-header | Reuses existing selection/panel infrastructure; no new context-menu system needed |
| Markable state types | `simple` and `compound` only | Entering a `final` or `history` state as a default start doesn't make sense |
| Blocking invalid connections | `isValidConnection` (drag feedback) + authoritative re-check inside `onConnect` (actually gates the mutation) + transient banner | `isValidConnection` alone is UX polish (ReactFlow may call it opportunistically); the real gate must live where the SCXML mutation happens |
| Already-invalid documents (hand-edited/pasted XML) | New persistent validator surfaced in the existing Errors panel | Real-time blocking only covers diagram drag-to-connect; the XML text editor and file loading bypass it entirely |

## Section 1: Graph analysis algorithm

New module: **`src/lib/utils/initial-group-utils.ts`** — pure functions, no React/UI/XML-DOM
dependencies (operates on the parsed `SCXMLDocument` object model, same as the existing
validators).

```
computeGroups(childIds: string[], initialIds: Set<string>, edges: [string, string][])
  -> Map<stateId, groupRootId | null>   // null = unassigned

wouldMergeDistinctGroups(scxmlDoc: SCXMLDocument, sourceId: string, targetId: string)
  -> { blocked: boolean; reason?: string }
```

**`computeGroups`** treats `edges` as undirected and runs union-find (or equivalent BFS) over
`childIds`. After union-find settles, any component containing more than one ID from
`initialIds` is a contradiction (should never arise if writes are always validated, but the
persistent validator in Section 4 checks for it in hand-edited documents). Components with
exactly one initial-marked member are "assigned" to that root; components with zero are
"unassigned."

**`wouldMergeDistinctGroups`** is the check used before creating any new transition:
1. Find S and T's shared parent P (must be the same parent — cross-parent transitions are
   already rejected elsewhere, but this function defensively no-ops/allows if parents differ,
   since that case is `validateCrossHierarchyTransitions`'s job, not this one's).
2. Collect P's direct children, P's `initial` list, and the current edges among P's children
   (including the proposed new S→T edge).
3. Run `computeGroups` with the proposed edge included. If the resulting component containing
   S (== the component containing T, since they'd now be merged) has more than one
   initial-marked member, `blocked: true`.

This single function correctly allows: siblings within the same existing group; two
still-unassigned states joining into one (still-unassigned) island; an unassigned island
merging onto an existing group's component (island permanently joins that group). It correctly
blocks: two different Initial States connecting directly; two states from different established
groups connecting; a chain that transitively bridges two different groups. Direction of the
edge does not matter to any of this, since grouping is inherently an undirected-connectivity
question.

## Section 2: SCXML representation & required bug fixes

Multiple Initial States on the same parent are written as a space-separated list in that
parent's `initial` attribute (`<scxml initial="A B">` or `<state id="P" initial="A B">`).

**Rendering fix required:** `isInitialState()` in
`src/lib/converters/converter-modules/layout-positioning.ts:298-341` currently does a raw
`stateId === rootInitial` / `stateId === parentInitial` equality check against the *whole*
attribute string. This already silently returns `false` for every state once the attribute
holds more than one ID (a latent gap in the current single-value assumption). It must be
changed to split the attribute (via `parseStateIdList`, consistent with how the validators
already read it) and check membership, or the "Initial" badge will simply stop appearing.

**Mutation-site fixes required:** three existing places mutate an `initial` attribute by
wholesale overwrite, which is safe only when there is exactly one value. Each would silently
drop every other ID in the list once multi-value `initial` becomes normal:

| Location | Current behavior | Fix |
|---|---|---|
| `RenameStateCommand` (`src/lib/commands/rename-state-command.ts:52-55`) | `parent.setAttribute('initial', newId)` replaces the entire attribute | Replace only the renamed token within the space-separated list, preserving the rest |
| `updateTransitionTargets` (`src/lib/utils/scxml-manipulation-utils.ts:80-82`) | `scxmlDoc.scxml['@_initial'] = newStateId` on exact full-string match, root only | Token-level replace, and must handle non-root parents too (walk the tree, not just `scxmlDoc.scxml`) |
| `removeStateFromDocument` (`src/lib/utils/scxml-manipulation-utils.ts:264-269`) | Only clears/reassigns `@_initial` on exact full-string match, root only | Remove just the deleted state's token from whichever parent's list contains it, at any nesting level |

These are pre-existing latent bugs that only matter once multi-value `initial` becomes a
normal, user-facing state (rather than a niche parsing allowance built for a different,
reverted feature). Fixing them is in scope: without the fix, renaming or deleting a state
that's a co-member of a multi-initial parent would corrupt its siblings' initial markers.

## Section 3: UI

**Marking a state Initial.** `StateActionsPanel` (`src/components/ui/state-actions-panel.tsx`)
gets a new toggle/switch in its sub-header (next to the existing `stateId` label and "Add
action" button), labeled "Initial State." Only rendered for `simple`/`compound` state types.

Toggling calls a new command, **`ToggleInitialStateCommand`**
(`src/lib/commands/toggle-initial-state-command.ts`), following the existing `Command`
interface (`execute`/`undo`/`getDescription`, same shape as `RenameStateCommand`):
- **Turning on:** adds the state's ID to its direct parent's `initial` attribute list (creating
  the attribute if absent), no-op if already present. Refused (checkbox disabled, with an
  explanatory tooltip) when the state is already transitively connected — via existing
  transitions among its siblings — to another Initial-marked sibling: marking it too would
  merge two Initial State groups into one chain with two markers, which the invariant forbids.
  This is the "mark" counterpart to `wouldMergeDistinctGroups`'s "connect" check, backed by the
  same `analyzeGroups` union-find (`wouldConflictIfMarkedInitial` in `initial-group-utils.ts`).
- **Turning off:** removes the ID from the list, always — including when it's the sole Initial
  marker of its chain, or of a nested compound parent. This was originally going to be blocked
  in that case (requiring another sibling to already be marked Initial first), but that creates
  an unresolvable deadlock: reassigning a chain's Initial marker to a *different* sibling
  requires marking that sibling first, which `wouldConflictIfMarkedInitial` correctly refuses
  (it's already connected to the current marker) — so the only marker could never be moved. A
  chain (or a nested compound state) temporarily having zero Initial markers is a normal,
  transient editing state, not an error to prevent at the UI layer; a nested compound state that
  ends up with none is instead caught by the pre-existing `validateCompoundStates` persistent
  validator (Section 4), surfaced in the Errors panel exactly like any other required-attribute
  gap, resolved once the user marks a new one.

**Blocking invalid connections.** Two layers, both backed by `wouldMergeDistinctGroups`:
1. `<ReactFlow isValidConnection={...}>` (`visual-diagram.tsx:2401` area) — a side-effect-free
   callback used for live drag feedback (ReactFlow's built-in invalid-connection styling).
2. The authoritative check lives inside the existing `onConnect` handler
   (`visual-diagram.tsx:775`), run before any edge/SCXML mutation. If blocked: skip
   `addEdge`/the SCXML write entirely, and show a transient banner — new component
   `src/components/diagram/initial-group-conflict-banner.tsx` — reading *"Cannot connect states
   that belong to different Initial State groups."*, auto-dismissing after ~4s.

No changes needed to the "Initial" badge rendering itself (`scxml-state-node.tsx`) beyond the
`isInitialState` fix in Section 2 — it already renders per-node off a boolean, so multiple
badges under one parent work once that boolean is computed correctly for multi-value lists.

## Section 4: Persistent validation

Real-time blocking in `onConnect` only covers edits made by dragging in the diagram. It cannot
stop someone from pasting or typing XML directly in the text editor, or loading a file that
already violates the invariant. New module **`src/lib/validators/initial-group-validator.ts`**,
following the existing validator pattern (`state-validator.ts`, `transition-validator.ts`):
for every parent container in the document, recompute its groups via `computeGroups`
(Section 1), and for any transition whose source/target both resolve into a component
containing more than one initial-marked state, emit a `ValidationError`, e.g.:

> "Transition from 'State2' to 'State5' connects two different Initial State groups (rooted at
> 'A' and 'B')."

Wired into `scxml-validator.ts`'s existing validation pipeline alongside
`validateCrossHierarchyTransitions`. Surfaced through the existing `validation-panel.tsx` — no
new panel UI needed.

## Testing (vitest, matching existing `*.test.ts` convention)

- `initial-group-utils.test.ts` — pure algorithm coverage: State1→State2 allowed; State4→State6
  allowed; State2→State5 rejected; direct Initial-to-Initial rejected in either direction;
  unassigned-to-unassigned allowed; unassigned island permanently joins a group on first
  connection; multi-level nesting where a root group and a nested compound state's group are
  independent of each other.
- `toggle-initial-state-command.test.ts` — execute/undo; appending vs. removing from a
  multi-value list; no-op when already in the desired state; undo restores the exact prior list
  (including ordering).
- Regression tests for the three Section 2 bug fixes — rename/delete preserving sibling entries
  in a multi-value `initial` list, including at nested (non-root) levels.
- `initial-group-validator.test.ts` — document-level detection of an already-invalid,
  hand-edited document (two initial-marked states transitively connected).

## Out of scope

- `<parallel>`/region semantics — the prior parallel-states feature was reverted; this design
  does not reintroduce it.
- ~~The `<initial>` child-element form~~ — originally out of scope, but existing hand-authored
  documents use it, so it's now fully supported: `getInitialIds` (`initial-group-utils.ts`)
  reads both the `initial` attribute and a container's `<initial>` child element and unions
  them, so grouping/conflict checks, `isMarkedInitial`, and the persistent validator all see
  states named either way. `ToggleInitialStateCommand` reads both forms too, and normalizes to
  the attribute form the first time a container's Initial designation is touched (removing any
  pre-existing `<initial>` element) — the attribute is the only form that supports more than one
  Initial id, so once a container has multiple, there's no other consistent representation.
  Undo restores the original `<initial>` element verbatim (the same DOM node, re-imported) if
  one existed.
- Any visual color-coding or grouping indicator beyond the existing "Initial" badge — not
  requested.
