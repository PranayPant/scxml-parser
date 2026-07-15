# Parallel States Phase 2 — Visual Editor Rendering Design

**Date:** 2026-07-14
**Status:** Approved

## Problem

Phase 1 ([docs/parallel-states-scxml-spec.md](../../parallel-states-scxml-spec.md)) established that `<parallel>` regions have no standard XML representation of "these are drawn side by side" — that's a purely visual concern. Today the editor's hierarchy navigation is flat and drill-down only (`use-hierarchy-navigation.ts`): clicking into any compound or parallel state replaces the whole canvas with just its direct children, one level at a time, via a breadcrumb trail. There is no inline nesting for any state type today.

For a `<parallel>` state, showing its regions only after an extra drill-down click hides the concurrency relationship that matters most: that N state machines are active at once. This design makes a `<parallel>` state's direct region children always visible inline, wherever the parallel appears, while leaving every other drill-down behavior — including drilling into a region, and into nested parallels — unchanged.

Target: first prototype by July 27 (per the original 5-phase plan's Milestone 5).

## Scope

**In scope:**
- Rendering: a `<parallel>` state always shows its direct region children (`<state>`/`<parallel>`) inline as side-by-side boxes, at whatever hierarchy level the parallel itself is visible.
- N-way regions (2, 3, 5, ...), including wrapping to additional rows past a width threshold.
- Nested parallel (a region that is itself a `<parallel>`) renders as a normal collapsed wrapper — auto-expansion is exactly one level deep and does not recurse. Drilling into it reveals its own regions inline, applying the same one-level rule again at that new level.
- Auto-layout only for arranging regions inside the wrapper (equal-width columns, wrap on overflow). No manual drag/resize of regions within the wrapper.
- No "Initial" badge on direct regions of a parallel (all are simultaneously active — the concept doesn't apply at that level). Each region keeps its own normal single-Initial-badge behavior one level deeper, among its own children.
- Creating a new `<parallel>` state (with 2 default regions) via a toolbar button, and adding additional regions to an existing parallel via a button on the wrapper. See §5.

**Out of scope (this pass):**
- Validation (cross-region transition legality, per-region initial-state requirement) — that's Phase 3, tracked separately in the Phase 1 doc §1.4/§4.
- Manual resize/reposition of regions within the wrapper.
- Converting an *existing* plain state into a parallel state in place (the generic state-type-change stub in `change-state-type-command.ts` stays as-is). Creating a parallel is only done via the new dedicated "Add Parallel State" action (§5), not via type conversion.

---

## Design

### 1. Rendering model

`useHierarchyNavigation`'s `filteredNodes` memo (`src/hooks/use-hierarchy-navigation.ts:43-88`) filters to `node.parentId === currentParentId` and strips `parentId` from every result, producing a flat, unparented list for ReactFlow. This gets one addition:

- For each node in the current level's visible set with `data.stateType === 'parallel'`, also pull in every node from `allNodes` whose `parentId` equals that parallel's id — and, unlike every other returned node, **keep** their real `parentId` instead of stripping it.
- This is exactly one level: if one of those region nodes is itself `stateType === 'parallel'`, its own children are *not* pulled in. They stay hidden until the user actually navigates into that nested parallel (at which point the same rule reapplies at the new level).

Keeping `parentId` on region nodes (instead of stripping it, as today) lets ReactFlow's native parent/child node support (`parentId` + `extent: 'parent'`) place them physically inside the parallel's bounding box — no custom absolute-positioning container needed.

Region nodes are ordinary `SCXMLStateNode`s (`stateType: 'compound'` or `'simple'` or `'parallel'` if nested) — they keep their existing drill-down arrow, dashed compound borders, delete button, etc. Clicking "navigate into" on a region calls the same `navigateIntoState` used everywhere else in the app; no new navigation mechanism.

### 2. Components

- **`SCXMLStateNode`** (`src/components/diagram/nodes/scxml-state-node.tsx`) — reused as-is for regions. No changes needed.
- **New: `ParallelWrapperNode`** — a thin node component whose only job is to size itself to fit its ReactFlow children and render the dashed boundary + `⚡` label. No interactive body of its own; the real states are its children.
- **`useHierarchyNavigation`** (`src/hooks/use-hierarchy-navigation.ts`) — the one-level pull-in logic described above.
- **`container-layout-manager.ts`** — replace the currently-dead `arrangeTwo`/`arrangeFew`/grid-fallback split with one generalized `arrangeRegions(regions)`: equal-width columns in a row, wrapping to additional rows once a column would drop below the existing minimum node width (160px, matching the `min-w-[160px]` already used for parallel-type nodes in `scxml-state-node.tsx`). N-agnostic by construction (no per-count branching).
- **`scxml-to-xstate.ts`** — no new traversal needed; `registerAllStates` already walks `parallel` recursively with correct `parentId` chains into `stateRegistry`. The wrapper sizing pass just consumes that existing data.

### 3. Edge cases

- **Zero-region parallel** (legal per spec): wrapper renders empty at a minimum placeholder size. No error.
- **Region with no reachable initial substate**: out of scope here (Phase 3's validator). The region still renders and is still drill-into-able; it just won't show an Initial badge among its own children.
- **Cross-region transition edges** (illegal per spec, per Phase 1 §1.4): not validated in Phase 2. Since both region nodes have real positions now, such an edge just renders across the wrapper boundary — visually odd, not crash-prone. Flagging it as invalid is Phase 3's job.

### 4. Creating parallel states & regions

There is currently no working path to create a `<parallel>` element at all: `createStateElement`/`addStateToDocument` (`src/lib/utils/scxml-manipulation-utils.ts`) only ever build/insert `<state>` tags regardless of the `stateType` argument passed in, and `ChangeStateTypeCommand`'s `newStateType === 'parallel'` branch is an explicit stub that just logs a warning and changes nothing. This design adds creation as new, dedicated commands rather than fixing that generic type-conversion path — converting an *existing* arbitrary state into a parallel in place would require recreating the DOM element and re-validating/migrating its existing children and transitions, which is a much larger and riskier change than just inserting a new, well-formed parallel state.

- **"Add Parallel State"** — new toolbar button next to the existing "Add State" (`handleAddRootState`, `visual-diagram.tsx:1933`). Builds a `<parallel id="...">` with two plain `<state>` children (`region_1`, `region_2` — no substates, so no `initial` attribute is required per spec). Follows the same auto-id and placement conventions `handleAddRootState` already uses (checks existing ids across the whole document, places at root or under `currentParentId` depending on hierarchy navigation state).
- **"+ Add Region"** — a small button rendered on `ParallelWrapperNode` (§2). Appends one more plain `<state id="region_N">` under that parallel, `N` picked the same way (first unused `region_N` id, checked document-wide since SCXML ids must be globally unique).
- **Region deletion** — no new code needed. `DeleteNodeCommand`'s element lookup (`base-command.ts:127-131`) already matches `state[id]`, `parallel[id]`, and `final[id]` generically, so removing a region works today exactly like removing any other state.
- Both new commands operate at the same DOM level as `ChangeStateTypeCommand`/`DeleteNodeCommand` (real `doc.createElement`/`querySelector`, not the JS-object-model helpers in `scxml-manipulation-utils.ts`), to stay consistent with how state mutation already works elsewhere in the codebase.

### 5. Testing approach

No automated test framework exists in this repo today (`CLAUDE.md` currently documents manual-testing-only). This work introduces one: **Vitest + React Testing Library**, chosen over Jest for native ESM/TS support and lower config overhead alongside Next.js 15 + Turbopack. Setup: `vitest.config.ts` (using `vite-tsconfig-paths` so `@/` imports resolve the same as in the app), `@testing-library/react` + `@testing-library/jest-dom`, a `test` script in `package.json`, and a `CLAUDE.md` update replacing the "no test framework" note with the real commands.

Automated coverage added alongside this feature (unit-level, no e2e/browser automation in this pass):
- **`useHierarchyNavigation` filtering** — a parallel's direct children appear with `parentId` preserved; nested-parallel grandchildren stay hidden until navigated into; non-parallel compound drill-down is unchanged (regression case).
- **`arrangeRegions` layout** — equal-width columns for 2/3/5 regions, wrapping once a column would drop below 160px, N-agnostic (no hardcoded region-count branch).
- **Create-parallel / add-region commands (§4)** — produce valid, re-parseable SCXML with correctly auto-generated unique ids; region deletion via the existing generic `DeleteNodeCommand` continues to work against a `<parallel>` parent.
- **`ParallelWrapperNode`** — a component-level test (React Testing Library) confirming it renders the boundary/label and sizes to its children, without needing a full ReactFlow canvas.

Manual verification against hand-authored fixtures (2-region, 3-region, 5-region wrapping, nested-parallel) remains the way to confirm the actual visual/interactive result in the dev server, same as the rest of this codebase's existing features.
