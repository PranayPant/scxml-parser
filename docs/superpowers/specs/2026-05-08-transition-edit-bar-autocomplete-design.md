# Transition Edit Bar Autocomplete — Design Spec

**Date:** 2026-05-08
**Branch:** feat/host-api

---

## Overview

Add autocomplete suggestion dropdowns to the visual diagram's transition edit bar for the `event` and `cond` fields. Currently both fields are plain `<input type="text">` with no suggestions. The Monaco XML editor already has this logic; this spec brings equivalent behaviour to the diagram view.

---

## Section 1 — Component Boundary

### New file: `src/components/diagram/transition-edit-bar.tsx`

Extract the entire edit bar out of `visual-diagram.tsx` (currently lines 2107–2186) into a dedicated component. The component owns all transient UI state.

**Internal state:**
- `editingField: 'event' | 'cond'`
- `rawValue: string`
- `suggestions: string[]`
- `activeIndex: number` (-1 = none selected)
- `showSuggestions: boolean`

**Props:**
```ts
interface TransitionEditBarProps {
  edgeId: string;
  source: string;
  target: string;
  event?: string;
  cond?: string;
  scxmlContent: string;
  onCommit: (
    source: string,
    target: string,
    originalEvent: string | undefined,
    originalCond: string | undefined,
    newValue: string,
    editingField: 'event' | 'cond',
    edgeId: string
  ) => void;
  onCancel: () => void;
}
```

**Initial `editingField`:** derived from props — `'event'` if `event` prop is non-empty, otherwise `'cond'`. Matches current behaviour in `visual-diagram.tsx`.

### Changes to `visual-diagram.tsx`

- `selectedEdgeForEdit` state shape simplifies to `{ id, source, target, event?, cond? } | null` (drops `rawValue` and `editingField`).
- The edit bar block (lines 2107–2186) is replaced with:
  ```tsx
  {selectedEdgeForEdit && (
    <TransitionEditBar
      edgeId={selectedEdgeForEdit.id}
      source={selectedEdgeForEdit.source}
      target={selectedEdgeForEdit.target}
      event={selectedEdgeForEdit.event}
      cond={selectedEdgeForEdit.cond}
      scxmlContent={scxmlContent}
      onCommit={handleTransitionLabelChange}
      onCancel={() => {
        setSelectedEdgeForEdit(null);
        setSelectedTransitions(new Set());
      }}
    />
  )}
  ```

---

## Section 2 — Suggestion Logic

Suggestions are recomputed on every `rawValue` change. Filtering is prefix-match, case-insensitive.

### `event` field

```
channels ← useHostAPIStore.getState().channels
filtered ← channels where channel.startsWith(rawValue) [case-insensitive]
suggestions = filtered
```

### `cond` field

```
vars     ← extractDatamodelVariables(scxmlContent)
channels ← useHostAPIStore.getState().channels
combined ← deduplicate([...vars, ...channels])
filtered ← combined where item.startsWith(rawValue) [case-insensitive]

if filtered is empty AND rawValue.startsWith('this_'):
  suggestions = [{ label: rawValue, kind: 'new-channel' }]
else:
  suggestions = filtered (kind: 'regular')
```

### Data sources

| Source | Import |
|--------|--------|
| Host API channels | `useHostAPIStore` from `@/stores/host-api-store` |
| Datamodel variables | `extractDatamodelVariables` from `@/lib/utils/datamodel-extractor` |

---

## Section 3 — Dropdown UI & Keyboard Navigation

### Dropdown element

- Renders as an absolute `<div>` directly below the input, same width, `z-50`
- `max-h-48 overflow-y-auto`
- Each row: `px-3 py-1.5 text-sm cursor-pointer`
- Hover state: `hover:bg-blue-100`
- Keyboard-active row: `bg-blue-500 text-white`
- "New channel" entry: amber background (`bg-amber-50 text-amber-800 border-l-2 border-amber-400`) to distinguish from regular suggestions

### Lifecycle

- **Opens:** when `rawValue` changes and `suggestions.length > 0`
- **Closes:** suggestion selected, `Escape` pressed, or input blurs (100 ms delay to allow click events to fire)

### Keyboard navigation

| Key | Dropdown open | Dropdown closed |
|-----|---------------|-----------------|
| `↓` | Move selection down (wraps) | Open dropdown |
| `↑` | Move selection up (wraps) | — |
| `Enter` | Selected row → fill + commit; no row → commit `rawValue` | Commit `rawValue` (existing behaviour) |
| `Tab` | Selected row → fill input, keep open; else default | Default |
| `Escape` | Close dropdown | `onCancel` (existing behaviour) |

---

## Out of Scope

- Suggestions in the Monaco XML editor (already implemented in `enhanced-scxml-completion.ts`)
- Fuzzy / substring matching (prefix-only, matching Monaco's approach)
- Async suggestion loading
