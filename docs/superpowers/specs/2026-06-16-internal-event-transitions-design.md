# Internal Event Transitions — Visual Editor Design

**Date:** 2026-06-16
**Revised:** 2026-06-17
**Status:** Approved

## Problem

The SCXML code generator already supports `<transition event="X" type="internal">` (within-state, targetless transitions). These run actions every time the named event fires while the machine stays in the same state. The most common case is `event="vector"`, which fires every data cycle:

```xml
<transition event="vector" type="internal">
  <assign location="this_index" expr="0"/>
</transition>
```

The visual editor currently has no way to see, create, or edit these transitions — users must edit raw XML. This spec adds full visual support.

## Scope

**In scope:**
- Display, add, edit, and delete `type="internal"` targetless transitions via a new `reactions` tab in the existing `StateActionsPanel`
- Support any event name (not just `vector`)
- Support multiple internal event transitions per state

**Out of scope:**
- `<script>` actions (assign only, matching existing tabs)
- Condition (`cond`) attribute on internal event transitions
- Special handling for `_foreach` events (they work as generic event names)
- Badges or any visual changes to the state node in the diagram
- Self-loop arrows in the diagram

---

## Design

### 1. User Flow (unchanged)

The existing flow stays exactly the same:

```
Click state node in diagram
  → StateActionsPanel opens on the right
    → now has 3 tabs: onentry | onexit | reactions
```

No new panels, no badges, no hover affordances. No changes to the diagram.

---

### 2. Third Tab: `reactions`

The existing `StateActionsPanel` gains a third tab following the exact same pattern as `onentry` and `onexit`:

```
┌────────────┬────────────┬─────────────┐
│ onentry (1)│ onexit (0) │ reactions (3)│  ← new tab
└────────────┴────────────┴─────────────┘
```

- Tab label: **`reactions (N)`** where N = total count of assign actions across all internal event transitions on that state
- Tab styling: identical to `onentry` / `onexit` tabs
- The existing `+` button in the panel header is **tab-aware**: when `reactions` is active it opens the new-action form (pre-filled event = `vector`); when `onentry`/`onexit` is active it behaves as today

---

### 3. Flat Action List (same as onentry/onexit)

Inside the `reactions` tab, the list is a **flat list of assign actions**. Each row is **two lines** — event name on the first line, assign action on the second — so long event names never overflow.

```
┌──────────────────────────────────────────┐
│ ⚡ vector                           [✕] │  ← line 1: event name
│   this_index = 0                        │  ← line 2: location = expr
├──────────────────────────────────────────┤
│ ⚡ vector                           [✕] │
│   this_check_error = false               │
├──────────────────────────────────────────┤
│ ⚡ fieldlist.Heaters_foreach        [✕] │
│   this_index = this_index + 1           │
└──────────────────────────────────────────┘
```

- Row style: `bg-gray-50 hover:bg-gray-100 rounded px-2 py-1.5` — same as existing rows
- Line 1: event name in `text-violet-600 text-[10px] font-medium` with `⚡` prefix
- Line 2: `location = expr` in `font-mono text-xs text-gray-700` with slight left indent (`pl-2`)
- `✕` floats top-right on hover: deletes that single action (and removes the parent `<transition>` element if it was the last action under that event)
- Click anywhere on the row: opens the inline edit form for that action

---

### 4. Inline Form (same as onentry/onexit + one extra field)

The same `bg-blue-50 ring-1 ring-blue-400` inline form, with one extra field added at the top:

```
┌─ bg-blue-50 ────────────────────────────┐
│ Event                                    │
│ [vector                              ]   │  ← new field, pre-filled
│ Location                                 │
│ [this_index                          ]   │  ← autocomplete (same as today)
│ Expression                               │
│ [0                                   ]   │
│                      [Discard] [Apply]   │
└──────────────────────────────────────────┘
```

- **Event field:** free text input, pre-filled with `vector` for new actions, or the existing event name when editing. No autocomplete needed.
- **Location field:** autocomplete from datamodel variables + host API channels — identical to existing tabs
- **Expression field:** plain text input — identical to existing tabs
- **Apply / Discard:** same behaviour as existing tabs

---

### 5. SCXML Grouping (invisible to user)

The flat list is a user-facing simplification. On every save, rows are regrouped by event name into `<transition>` elements:

```xml
<!-- rows 1 & 2 both have event="vector" → one <transition> -->
<transition event="vector" type="internal">
  <assign location="this_index" expr="0"/>
  <assign location="this_check_error" expr="false"/>
</transition>

<!-- row 3 has event="fieldlist.Heaters_foreach" → separate <transition> -->
<transition event="fieldlist.Heaters_foreach" type="internal">
  <assign location="this_index" expr="this_index + 1"/>
</transition>
```

Row order within the same event is preserved. The `<transition type="internal">` elements are inserted before any cross-state transitions in the state.

---

### 6. SCXML Mutations

All changes go through the existing command pattern (like `UpdateTransitionCommand`). All mutations are undoable via the existing history store.

| Action | SCXML change |
|---|---|
| Add action | Append `<assign>` to the matching `<transition event="X" type="internal">`, creating the `<transition>` if it doesn't exist |
| Edit action (location/expr) | Update `<assign>` attributes in place |
| Edit action (event name changed) | Move `<assign>` to the matching `<transition>` for the new event name; create or remove `<transition>` elements as needed |
| Delete action | Remove `<assign>`; remove parent `<transition>` if it becomes empty |

---

### 7. Converter / Parser Changes

**`edge-conversion.ts`:**
- Internal targetless transitions (`@_type === 'internal'`, no `@_target`, has `@_event`) must be **excluded from the React Flow edge list** — they must not become edges
- Extract them into a flat list on node data:
  ```ts
  internalEventActions: { event: string; location: string; expr: string }[]
  ```
  Rows are ordered: all assigns for the first `<transition>` first, then the second, etc.

**No changes to `SCXMLStateNode` rendering** — the diagram node itself is untouched.

---

### 8. Files Changed

| File | Change |
|---|---|
| `src/components/ui/state-actions-panel.tsx` | Add `reactions` tab; accept `internalEventActions` prop; render flat list with event pill; extend inline form with Event field |
| `src/lib/converters/converter-modules/edge-conversion.ts` | Exclude internal targetless transitions from edges; extract into `internalEventActions` on node data |
| `src/types/scxml/index.ts` | Confirm `@_type` exists on `TransitionElement` (already present) |
| `src/types/scxml/index.ts` and/or the React Flow node data type (wherever `SCXMLStateNode` data is typed) | Add `internalEventActions: { event: string; location: string; expr: string }[]` |
| `src/lib/commands/update-internal-event-command.ts` | **New file:** command for add/edit/delete, handles grouping into `<transition>` elements |
| `src/components/diagram/visual-diagram.tsx` | Pass `internalEventActions` from node data into `StateActionsPanel` props |
