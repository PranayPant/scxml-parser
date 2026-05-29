# Host Error Panel — Design Spec

**Date:** 2026-05-27  
**Branch:** dev-scxml-editor

## Problem

The LoopControl host (outer page) can encounter errors from background operations, system health checks, or other asynchronous events at any time. Currently there is no way for the host to push these errors into the SCXML editor frontend's UI in a persistent, visible manner. The existing `api.showFeedback()` produces auto-dismissing 4-second toasts — unsuitable for errors that the user must acknowledge.

## Goal

Add a persistent "Host Alerts" tab to the ValidationPanel that the host can populate via new `ScxmlEditorAPI` methods. Host errors stay visible until the user dismisses them.

---

## Data Model

### New type in `src/types/host-api.ts`

```ts
export interface HostErrorItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}
```

### `host-api-store.ts` additions

New state:
```ts
hostErrors: HostErrorItem[];
```

New actions:
```ts
showErrors: (errors: Array<{ message: string; level?: HostErrorItem['level'] }>) => void;
dismissHostError: (id: string) => void;
clearHostErrors: () => void;
```

- `showErrors()` assigns a `uuidv4()` id to each item and **appends** to `hostErrors`. Multiple async calls accumulate. Also sets `isValidationPanelVisible: true` and switches the panel to the "Host Alerts" tab automatically.
- `dismissHostError(id)` removes a single item by id.
- `clearHostErrors()` wipes all host errors. The host calls this before re-pushing a fresh error set if replace semantics are desired.

### `ScxmlEditorAPI` interface additions

```ts
showErrors: (errors: Array<{ message: string; level?: 'info' | 'warning' | 'error' }>) => void;
clearErrors: () => void;
```

---

## API Surface

### New methods exposed on `window.ScxmlEditorAPI`

| Method | Description |
|---|---|
| `showErrors(errors[])` | Push one or more persistent errors into the Host Alerts tab. Panel opens and switches to that tab automatically. |
| `clearErrors()` | Remove all host errors from the panel. |

### Usage in `scxml-editor-content.html`

```js
// Push errors at any time
api.showErrors([
  { message: 'Build failed: missing initial transition', level: 'error' },
  { message: 'Unused channel mapping detected', level: 'warning' },
]);

// Clear before re-pushing a fresh set
api.clearErrors();
api.showErrors([{ message: 'New error after retry', level: 'error' }]);
```

---

## UI Changes

### ValidationPanel — two-tab layout

The panel gains a tab bar with two tabs:

| Tab | Content | Badge |
|---|---|---|
| **Validation** | Existing SCXML parse/schema errors (unchanged) | Error + warning count from SCXML validation |
| **Host Alerts** | Host-pushed `HostErrorItem[]` | Error + warning count from host errors |

- Badge shows the count for that tab's items (e.g. `Validation (3)`, `Host Alerts (2)`).
- Both tabs are always shown regardless of count.
- Active tab indicated by blue underline (matching `TwoTabLayout` style).
- "Host Alerts" tab content: same card style as existing `ValidationErrorItem` — coloured by level, message text, per-item ✕ dismiss button, and a "Clear all" button in the tab header row.
- Tab state is local component state, reset to "Validation" when the panel is closed. Re-opening shows whichever tab was last active.

### Auto-switch behaviour

When `showErrors()` is called:
1. `isValidationPanelVisible` is set to `true` (panel opens if closed).
2. The ValidationPanel's active tab switches to "Host Alerts".

### Toolbar button

The "Valid / N errors, N warnings" button in `page.tsx` currently reads only from SCXML `errors[]`. It will additionally include `hostErrors` counts:

- `hasErrors` = SCXML errors with severity `'error'` **or** host errors with level `'error'`
- `hasWarnings` = SCXML warnings **or** host warnings (only when no errors)
- Button colour: driven by worst severity across both sources (red > yellow > green)
- Label: combined counts, e.g. `"2 errors, 1 warning"` from all sources

---

## Stub Queue

The pre-init stub lives in `src/app/layout.tsx` as an inline `<script dangerouslySetInnerHTML>`. It queues calls made by the host before React hydrates. The stub must be extended to queue `showErrors` and `clearErrors` calls so host calls made before the app is ready are not silently dropped.

The stub adds:
- `showErrors: function(errors) { q.hostErrors = (q.hostErrors || []); errors.forEach(function(e){ q.hostErrors.push(e); }); }`  
- `clearErrors: function() { q.clearErrors = true; q.hostErrors = []; }`

The real API wired up in `page.tsx` drains the queued calls on mount, same pattern as existing `registerCommand` / `showFeedback` / `setChannels`.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Host calls `showErrors()` before React is ready | Stub queues the call; drained on mount |
| Host calls `clearErrors()` before any errors exist | No-op (empty array stays empty) |
| Host pushes duplicate messages | Appended as separate items (no deduplication); host is responsible for calling `clearErrors()` first if replace semantics are needed |
| SCXML is valid and host has 0 errors | Button shows "Valid" in green; both tabs show empty state |
| Host errors exist, user opens panel | Panel opens on last active tab (no forced switch unless new errors just arrived) |

---

## Files Changed

| File | Change |
|---|---|
| `src/types/host-api.ts` | Add `HostErrorItem` type; add `showErrors`, `clearErrors` to `ScxmlEditorAPI` interface |
| `src/stores/host-api-store.ts` | Add `hostErrors` state, `showErrors`, `dismissHostError`, `clearHostErrors` actions |
| `src/components/ui/validation-panel.tsx` | Add two-tab layout; new "Host Alerts" tab content |
| `src/app/page.tsx` | Wire `showErrors`/`clearErrors` into real API; extend toolbar badge to include host errors; pass `hostErrors` props to ValidationPanel |
| `src/app/layout.tsx` | Extend inline pre-init stub to queue `showErrors` and `clearErrors` |
