# State Actions Side Panel — Design

**Date:** 2026-06-05
**Status:** Approved

## Context

The current `state-actions-edit-bar.tsx` is an absolutely-positioned overlay bar that appears on the diagram canvas when a state node is clicked. It only supports one action at a time (one `location` + `expr` pair) and must be dismissed before interacting with the diagram again. This makes editing multiple `onentry` or `onexit` actions awkward.

The goal is to replace it with a proper side panel — consistent with the existing `ConfigPanel`, `EventsPanel`, `ValidationPanel`, and `ChannelMappingPanel` pattern — that supports creating, editing, and removing multiple actions under both `onentry` and `onexit`.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | Click state node | Same UX as today — no new toolbar buttons needed |
| Panel layout | Tabbed: onentry / onexit | See both action counts at once; switch freely between lists |
| Row editing | Docked edit form at panel bottom | Clean separation between list and form; matches IDE-style editors |
| Save granularity | Apply → immediate SCXML write | No staging layer; each Apply calls `UpdateActionsCommand` and pushes undo history |
| State switch with dirty form | Silent discard | Zero friction; SCXML was never mutated so nothing is lost |
| Delete row | Immediate SCXML write | Consistent with Apply semantics |
| Footer buttons | None | Apply/Discard on the form are sufficient; no panel-level Save/Cancel |
| Implementation approach | New component, props-controlled | Matches existing panel pattern exactly |

## Architecture

### New file: `src/components/ui/state-actions-panel.tsx`

Follows the same structure as `config-panel.tsx`:

```
StateActionsPanel
  props:
    isVisible: boolean
    onClose: () => void
    stateId: string | null
    entryActions: ActionRow[]
    exitActions: ActionRow[]
    scxmlContent: string
    onApply: (entryActions: string[], exitActions: string[]) => void
```

Internal state (local only, never persisted):
- `activeTab: 'onentry' | 'onexit'`
- `selectedRowIndex: number | null` — which row is loaded into the docked form
- `formLocation: string` — current value of the location input
- `formExpr: string` — current value of the expr input
- `suggestions: string[]` — autocomplete list for location field

When `stateId` changes (user clicked a different state): reset `selectedRowIndex`, `formLocation`, `formExpr`. Tab stays on whatever tab was active.

### Modified file: `src/components/diagram/visual-diagram.tsx`

- Remove rendering of `StateActionsEditBar`
- Add local state: `actionsPanel: { isVisible: boolean; stateId: string | null }`
- On state node click → set `actionsPanel = { isVisible: true, stateId: node.id }` and derive `entryActions`/`exitActions` from parsed SCXML
- Render `<StateActionsPanel ... />` alongside other panels
- `onApply` callback calls existing `handleNodeActionsChange(stateId, entryActions, exitActions)` which routes through `UpdateActionsCommand`

### Deleted file: `src/components/diagram/state-actions-edit-bar.tsx`

Removed entirely. Autocomplete / suggestion logic is ported directly into `StateActionsPanel`.

## UI Behaviour

### Panel header
- Title: "State Actions"
- Subtitle: state ID (e.g. "StateA") in accent colour
- ✕ close button — closes panel, no prompt

### Tabs
- `⚡ onentry (N)` / `🚪 onexit (N)` — count updates as rows are added/removed
- Active tab has bottom border highlight

### Action list (per tab)
- Each row: compact summary `location = expr` with a ✕ delete button
- Clicking a row loads it into the docked form and highlights the row (blue border)
- `+ Add action` button at bottom of list — clears form and focuses location input
- Row delete (✕): calls `onApply` immediately with that row removed

### Docked edit form
- Always rendered at panel bottom as a fixed region
- **Idle state** (nothing selected): shows a muted hint — "Click a row or + to edit"
- **Active state** (row selected or + clicked): shows Location + Expression fields with Apply / Discard buttons
- Fields: **Location** (with autocomplete) + **Expression**
- Autocomplete: merges datamodel variables from SCXML + channels from `useHostAPIStore` — same logic as current edit bar
- **Apply**: serialises `location`/`expr` as `"assign|location|expr"`, updates the action list, calls `onApply` → `UpdateActionsCommand` → SCXML written → undo entry pushed
- **Discard**: clears form, deselects row — no SCXML change
- When stateId changes: form silently resets (location, expr cleared, selectedRowIndex = null)

### State switching
- `VisualDiagram` updates `stateId` prop when a new node is clicked
- Panel reacts to the new `stateId` and re-derives entry/exit actions from SCXML
- Any text in the form that wasn't Applied is silently discarded — SCXML for the previous state is untouched

## Data Flow

```
User clicks state node
  → VisualDiagram sets actionsPanel.stateId
  → Parses SCXML to extract ActionRow[] for onentry/onexit
  → Passes to StateActionsPanel as props

User edits form + clicks Apply
  → StateActionsPanel calls onApply(serialisedEntryActions, serialisedExitActions)
  → VisualDiagram.handleNodeActionsChange(stateId, entry, exit)
  → new UpdateActionsCommand(nodeId, entry, exit).execute(scxmlContent)
  → UpdateActionsCommand mutates <onentry>/<onexit> elements in XML
  → onSCXMLChange(newContent, 'property') fires
  → useHistoryStore.pushEntry(newContent)
```

## Reused Utilities

- `UpdateActionsCommand` — `src/lib/commands/update-actions-command.ts` (unchanged)
- Autocomplete/suggestion logic — ported from `state-actions-edit-bar.tsx`
- `useHostAPIStore` channels — `src/stores/host-api-store.ts`
- Panel CSS pattern — `w-80`, flex-col, header + tabs + scroll body + docked form

## Verification

1. Click a state node with existing `onentry`/`onexit` actions → panel opens, correct actions listed on correct tab, correct counts in tab labels
2. Click a row → form loads location and expr; location field shows autocomplete suggestions
3. Edit and click Apply → row updates in list, SCXML reflects change, undo (Ctrl+Z) reverts it
4. Click ✕ on a row → row removed, SCXML updated immediately
5. Click `+ Add action`, fill form, Apply → new row appears and SCXML updated
6. With form partially filled, click a different state → panel switches to new state, form is cleared silently
7. Switch tabs while rows exist in both → each tab preserves its own list
8. Close panel (✕) → panel disappears, diagram behaves normally; no edit bar overlay
9. Old `state-actions-edit-bar.tsx` is absent from the file tree
