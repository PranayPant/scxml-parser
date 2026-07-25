# Config Panel Host Bridge — Design Spec

**Date:** 2026-07-11
**Branch:** parallel-states (editor repo) / resolve-develop-conflicts (host repo, `D:/CS_Jobs/CA_LoopCode`)

## Problem

`config-panel.tsx` fetches its IO.conf override values with a raw `fetch('/scxml-editor/config')` call made directly from inside the iframe. Every other data type the editor needs (channels, events, channel-mappings, the SCXML program itself) is instead fetched by the Vue host page (`scxml.vue`) via `/api/v1/scxml-editor/*` and pushed into the iframe through the `ScxmlEditorAPI` bridge (`setChannels`, `setEvents`, `setChannelMappings`, `loadScxml`).

This is inconsistent, and the URL is actually wrong: the real backend route is `/api/v1/scxml-editor/config` (`ControlWebUI.cs` mounts it under `app.MapGroup("/api/v1")` → `.MapGroup("/scxml-editor")`), not `/scxml-editor/config`. The panel's fetch silently falls back to local-only state on failure, so the bug has gone unnoticed.

## Goal

Move config-value loading onto the same host-push pattern as the other data types. No backend changes — `GET /api/v1/scxml-editor/config` is already correct and unchanged. This is purely rewiring the two frontends (`D:/web-scxml-editor` and `D:/CS_Jobs/CA_LoopCode/Frontend`).

---

## Data Model

### New type in `src/types/host-api.ts`

```ts
export interface ConfigOverride {
  name: string;
  override: string;
}
```

Only `name`/`override` are needed — `type` and `defaultValue` for each field always come from live parsing of the currently-loaded SCXML (`extractConfigFields`), never from the server. The existing `ConfigValue` type (used by `getConfigValues()`, the panel→host direction for applying changes) is untouched.

### `ScxmlEditorAPI` interface addition

```ts
setConfigValues: (values: ConfigOverride[]) => void;
```

### `host-api-store.ts` additions

New state:
```ts
configOverrides: ConfigOverride[];
```

New action:
```ts
setConfigOverrides: (values: ConfigOverride[]) => void;
```

Plain replace, same as `setChannels`/`setEvents` — no merge logic in the store itself.

---

## API Surface

### `use-host-api-bridge.ts`

Wire the new method into `realApi`:
```ts
setConfigValues: (values: ConfigOverride[]) => useHostAPIStore.getState().setConfigOverrides(values),
```

No pre-init stub change needed in `layout.tsx`. The stub-queue mechanism exists to catch host calls made before React hydrates, but `scxml.vue` always calls `editor.onReady(() => bootstrap(editor))` before invoking any setter — by the time `bootstrap()` runs, the real API is already installed. This matches the existing (unqueued) handling of `setEvents`/`setChannelMappings`.

### `scxml.vue`

Add to the local `ScxmlEditorAPI` type:
```ts
setConfigValues: (values: ConfigValueDto[]) => void
```

`ConfigValueDto { name, override }` already exists and matches `ConfigOverride` structurally — reused as-is.

Add a fourth call into `bootstrap()`'s `Promise.all([...])`, alongside channels/events/channel-mappings:
```ts
api<ConfigValueDto[]>('/api/v1/scxml-editor/config')
  .then((values) => editor.setConfigValues(values))
  .catch(() => editor.showFeedback(t('scxml.load-config-error'), 'error'))
```

### `i18n/locales/en.json`

Add next to `load-channels-error`/`load-events-error`:
```json
"load-config-error": "Failed to load config overrides"
```

---

## UI Changes

### `config-panel.tsx`

Remove `fetchOverrides` and the `useEffect` that calls it on `scxmlContent` change, along with the `fetch('/scxml-editor/config')` call entirely.

Replace with:
```ts
const configOverrides = useHostAPIStore(state => state.configOverrides);
```

Rebuild `entries` from `extractConfigFields(scxmlContent)` merged with `configOverrides`, preserving the same precedence that exists today: an in-progress local edit for a field wins over the host-provided override; the host-provided override wins over blank. This still runs in a `useEffect` keyed on `scxmlContent` (so adding/removing/renaming `conf_` fields as the user edits the SCXML keeps working), but the override source is now the store instead of a fetch.

---

## Error Handling

A failed `/api/v1/scxml-editor/config` fetch shows a toast via `editor.showFeedback(..., 'error')`, matching channels/events — not swallowed silently like channel-mappings/program. Rationale: the backend returns `[]` for "no overrides saved yet" (a legitimate, common state), so a thrown error here specifically means a real failure (network/auth), not empty data.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| No `conf_` fields in the SCXML | `configOverrides` may be non-empty or empty; panel shows its existing empty state regardless, since `extractConfigFields` returns `[]` |
| Host config fetch fails | Toast shown; panel still renders fields extracted from SCXML with blank overrides (same as today's fetch-failure fallback) |
| User edits an override, then edits the SCXML elsewhere | In-progress override edit is preserved (local edit takes precedence over `configOverrides`), same merge behavior as today |
| User adds a new `conf_` field mid-session | Not present in `configOverrides` (fetched once at bootstrap) → override defaults to blank, same as today's behavior for new fields |
| IO.conf changes on the backend after bootstrap (e.g. another session applies a program) | Not reflected until next full page load. Acceptable: overrides in this app only change via this same session's `/program/apply`, which restarts the backend anyway |

---

## Files Changed

| Repo | File | Change |
|---|---|---|
| `web-scxml-editor` | `src/types/host-api.ts` | Add `ConfigOverride` type; add `setConfigValues` to `ScxmlEditorAPI` |
| `web-scxml-editor` | `src/stores/host-api-store.ts` | Add `configOverrides` state, `setConfigOverrides` action |
| `web-scxml-editor` | `src/app/_hooks/use-host-api-bridge.ts` | Wire `setConfigValues` into `realApi` |
| `web-scxml-editor` | `src/components/ui/config-panel.tsx` | Remove internal `fetch()`; read `configOverrides` from `useHostAPIStore` instead |
| `CS_Jobs_CA_LoopCode` | `Frontend/app/pages/scxml.vue` | Add `setConfigValues` to local `ScxmlEditorAPI` type; fetch `/api/v1/scxml-editor/config` in `bootstrap()` and push it |
| `CS_Jobs_CA_LoopCode` | `Frontend/i18n/locales/en.json` | Add `scxml.load-config-error` key |
