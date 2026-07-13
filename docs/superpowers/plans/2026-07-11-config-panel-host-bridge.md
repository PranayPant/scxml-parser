# Config Panel Host Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `config-panel.tsx`'s direct (and wrongly-pathed) `fetch('/scxml-editor/config')` call with the same host-push bridge pattern already used for channels/events/channel-mappings, so the Vue host fetches `/api/v1/scxml-editor/config` and pushes it into the iframe via a new `setConfigValues` API method.

**Architecture:** Two repos change together. `web-scxml-editor` (the iframe app) gains a `ConfigOverride` type, a `configOverrides` store slot fed by a new `setConfigValues` bridge method, and a pure `mergeConfigEntries` helper (extracted from the panel's current inline merge logic) that combines host-provided overrides with any in-progress local edits. `CS_Jobs_CA_LoopCode/Frontend` (the Vue host, `scxml.vue`) fetches `/api/v1/scxml-editor/config` in its existing `bootstrap()` `Promise.all` and calls the new `editor.setConfigValues(...)`. No backend changes — `GET /api/v1/scxml-editor/config` in `ControlWebUI.cs` is already correct.

**Tech Stack:** Next.js 15 / React 19 / Zustand (editor repo, no test runner — ad-hoc `node:assert` scripts run via `npx tsx`, see `src/lib/layout/__tests__/adaptive-spacing.test.ts` for the convention); Nuxt 4 / Vue 3 / TypeScript (host repo, no automated tests — verified via `nuxt typecheck` + manual smoke test).

**Spec:** `docs/superpowers/specs/2026-07-11-config-panel-host-bridge-design.md`

---

### Task 1: Add `ConfigOverride` type and `setConfigValues` to the host API contract

**Repo:** `D:/web-scxml-editor`

**Files:**
- Modify: `src/types/host-api.ts`

- [ ] **Step 1: Add the `ConfigOverride` type and extend `ScxmlEditorAPI`**

In `src/types/host-api.ts`, add a new interface directly after the existing `ConfigValue` interface (currently lines 29-34):

```ts
export interface ConfigOverride {
  name: string;
  override: string;
}
```

Then add a new method to the `ScxmlEditorAPI` interface, directly after the `getConfigValues` line (currently line 61):

```ts
  getConfigValues: () => ConfigValue[];
  setConfigValues: (values: ConfigOverride[]) => void;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (the new method isn't implemented on any object literal yet, so nothing type-checks against it yet — this step just confirms the type file itself is syntactically valid).

- [ ] **Step 3: Commit**

```bash
git add src/types/host-api.ts
git commit -m "Add ConfigOverride type and setConfigValues to ScxmlEditorAPI"
```

---

### Task 2: Add `configOverrides` state to the host API store

**Repo:** `D:/web-scxml-editor`

**Files:**
- Modify: `src/stores/host-api-store.ts`

- [ ] **Step 1: Add the import, state field, and action**

In `src/stores/host-api-store.ts`, update the type import (currently line 3):

```ts
import type { ChannelInfo, ChannelMapping, CommandOptions, ConfigOverride, EventEntry, FeedbackItem, HostErrorItem, RegisteredCommand } from '@/types/host-api';
```

Add `configOverrides` to the `HostAPIState` interface, after `events: EventEntry[];` (currently line 12):

```ts
  events: EventEntry[];
  configOverrides: ConfigOverride[];
```

Add `setConfigOverrides` to the `HostAPIActions` interface, after `setEvents: (events: EventEntry[]) => void;` (currently line 28):

```ts
  setEvents: (events: EventEntry[]) => void;
  setConfigOverrides: (values: ConfigOverride[]) => void;
```

Add the initial state value, after `events: [],` (currently line 43):

```ts
  events: [],
  configOverrides: [],
```

Add the action implementation, after the `setEvents` action (currently line 116):

```ts
  setEvents: (events: EventEntry[]) => set({ events }),

  setConfigOverrides: (values: ConfigOverride[]) => set({ configOverrides: values }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/host-api-store.ts
git commit -m "Add configOverrides state to host API store"
```

**Amendment (found during Task 5's code quality review):** this task's original scope (above) did not include a `configOverridesLoaded` flag. One was added after the fact to close a race condition — see the amendment note under Task 5 for the full explanation. The final state of this file also has:
```ts
  configOverridesLoaded: boolean;   // in HostAPIState, after configOverrides
```
```ts
  configOverridesLoaded: false,     // in the initial state object, after configOverrides: [],
```
```ts
  setConfigOverrides: (values: ConfigOverride[]) => set({ configOverrides: values, configOverridesLoaded: true }),
```

---

### Task 3: Wire `setConfigValues` into the real API bridge

**Repo:** `D:/web-scxml-editor`

**Files:**
- Modify: `src/app/_hooks/use-host-api-bridge.ts`

- [ ] **Step 1: Update the type import and add the method to `realApi`**

Update the type import (currently line 10):

```ts
import type { ChannelInfo, ChannelMapping, ConfigOverride, ConfigValue, EventEntry, ScxmlEditorAPI } from '@/types/host-api';
```

Add `setConfigValues` to the `realApi` object, directly after `getConfigValues: () => configValuesRef.current,` (currently line 51):

```ts
      getConfigValues: () => configValuesRef.current,
      setConfigValues: (values: ConfigOverride[]) => useHostAPIStore.getState().setConfigOverrides(values),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_hooks/use-host-api-bridge.ts
git commit -m "Wire setConfigValues into the host API bridge"
```

---

### Task 4: Extract the config-override merge logic into a tested pure function

This is the one piece of behavior worth unit-testing in isolation (the precedence rule: local edit > host override > blank). Everything else in this change is direct state wiring with no independent behavior to assert on, consistent with how the rest of this repo is tested (only `src/lib/layout/` has test files; they're pure-function algorithms).

**Repo:** `D:/web-scxml-editor`

**Files:**
- Create: `src/lib/utils/config-overrides.ts`
- Create: `src/lib/utils/__tests__/config-overrides.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/__tests__/config-overrides.test.ts`:

```ts
/**
 * Tests for mergeConfigEntries — combines host-pushed IO.conf override values
 * with any in-progress local edits, applied over the current SCXML's conf_
 * fields. No test runner configured; run directly:
 *
 *   npx tsx src/lib/utils/__tests__/config-overrides.test.ts
 */
import assert from 'node:assert/strict';
import { mergeConfigEntries, type OverrideEntry } from '../config-overrides';
import type { ConfigField } from '../datamodel-extractor';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

function field(name: string, defaultValue = '0'): ConfigField {
  return { name, type: 'int', defaultValue };
}

test('returns an empty array when there are no fields', () => {
  const result = mergeConfigEntries([field('a')].slice(0, 0), [{ name: 'a', override: '5' }], []);
  assert.deepEqual(result, []);
});

test('uses the host override when there is no local edit', () => {
  const result = mergeConfigEntries([field('threshold')], [{ name: 'threshold', override: '42' }], []);
  assert.deepEqual(result, [{ field: field('threshold'), override: '42' }]);
});

test('defaults to a blank override when the field has no host override and no local edit', () => {
  const result = mergeConfigEntries([field('threshold')], [], []);
  assert.deepEqual(result, [{ field: field('threshold'), override: '' }]);
});

test('an in-progress local edit takes precedence over the host override', () => {
  const previous: OverrideEntry[] = [{ field: field('threshold'), override: '99' }];
  const result = mergeConfigEntries([field('threshold')], [{ name: 'threshold', override: '42' }], previous);
  assert.deepEqual(result, [{ field: field('threshold'), override: '99' }]);
});

test('a field removed from the SCXML is dropped even if it was in previous entries', () => {
  const previous: OverrideEntry[] = [{ field: field('gone'), override: '1' }];
  const result = mergeConfigEntries([field('kept')], [{ name: 'kept', override: '7' }], previous);
  assert.deepEqual(result, [{ field: field('kept'), override: '7' }]);
});

test('a null override value from the host is treated as blank', () => {
  const result = mergeConfigEntries(
    [field('threshold')],
    [{ name: 'threshold', override: null as unknown as string }],
    [],
  );
  assert.deepEqual(result, [{ field: field('threshold'), override: '' }]);
});

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/utils/__tests__/config-overrides.test.ts`
Expected: FAIL — module not found, `../config-overrides` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/config-overrides.ts`:

```ts
import type { ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigOverride } from '@/types/host-api';

export interface OverrideEntry {
  field: ConfigField;
  override: string;
}

/**
 * Combines the current SCXML's conf_ fields with host-pushed IO.conf overrides,
 * preserving any override the user is actively editing in this session (previous)
 * over what the host most recently pushed, and falling back to blank.
 */
export function mergeConfigEntries(
  fields: ConfigField[],
  overrides: ConfigOverride[],
  previous: OverrideEntry[],
): OverrideEntry[] {
  const overrideMap = Object.fromEntries(overrides.map(o => [o.name, o.override ?? '']));
  const localOverrideMap = Object.fromEntries(previous.map(e => [e.field.name, e.override]));
  return fields.map(f => ({
    field: f,
    override: localOverrideMap[f.name] ?? overrideMap[f.name] ?? '',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/utils/__tests__/config-overrides.test.ts`
Expected: PASS — `7 tests passed` (all `ok -` lines print, no assertion errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/config-overrides.ts src/lib/utils/__tests__/config-overrides.test.ts
git commit -m "Extract mergeConfigEntries with tests"
```

---

### Task 5: Wire `config-panel.tsx` to the store instead of fetching directly

**Repo:** `D:/web-scxml-editor`

**Files:**
- Modify: `src/components/ui/config-panel.tsx`

- [ ] **Step 1: Update imports**

Replace the import block (currently lines 1-8):

```tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigValue } from '@/types/host-api';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';
```

with:

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import { mergeConfigEntries, type OverrideEntry } from '@/lib/utils/config-overrides';
import type { ConfigValue } from '@/types/host-api';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';
```

(`useCallback` is dropped — it was only used by the fetch logic being removed. `useRef` stays — `TypeSelect` still uses it.)

- [ ] **Step 2: Remove the local `OverrideEntry` interface**

Delete the now-redundant local definition (currently lines 83-86):

```tsx
interface OverrideEntry {
  field: ConfigField;
  override: string;
}

```

(It's now imported from `@/lib/utils/config-overrides` instead.)

- [ ] **Step 3: Replace the fetch-based effect with the store-based merge**

Replace this block (currently lines 88-122, from the function signature through the closing of the `useEffect`):

```tsx
export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onEntriesChange }: ConfigPanelProps) {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const [newOverride, setNewOverride] = useState('');
  const fetchOverrides = useCallback(async (fields: ConfigField[]) => {
    if (fields.length === 0) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch('/scxml-editor/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { name: string; override: string | null }[] = await res.json();
      const serverOverrideMap = Object.fromEntries(data.map(d => [d.name, d.override ?? '']));
      setEntries(prev => {
        const localOverrideMap = Object.fromEntries(prev.map(e => [e.field.name, e.override]));
        return fields.map(f => ({
          field: f,
          override: localOverrideMap[f.name] ?? serverOverrideMap[f.name] ?? '',
        }));
      });
    } catch {
      setEntries(prev => {
        const localOverrideMap = Object.fromEntries(prev.map(e => [e.field.name, e.override]));
        return fields.map(f => ({ field: f, override: localOverrideMap[f.name] ?? '' }));
      });
    }
  }, []);

  useEffect(() => {
    const fields = extractConfigFields(scxmlContent);
    fetchOverrides(fields);
  }, [scxmlContent, fetchOverrides]);
```

with:

```tsx
export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onEntriesChange }: ConfigPanelProps) {
  const configOverrides = useHostAPIStore(state => state.configOverrides);
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const [newOverride, setNewOverride] = useState('');

  useEffect(() => {
    const fields = extractConfigFields(scxmlContent);
    setEntries(prev => mergeConfigEntries(fields, configOverrides, prev));
  }, [scxmlContent, configOverrides]);
```

**Amendment (found during this task's code quality review):** the effect above has a race condition. `scxmlContent` and `configOverrides` are populated by two independently-resolving async pushes from the host, with no ordering guarantee. If `scxmlContent` arrives first, the effect runs once with `configOverrides` still `[]` (the store's default before the host has pushed anything), which synchronously commits `override: ''` into `entries` for every real field. Because `mergeConfigEntries` treats a `''` in `previous` as an authoritative local edit (nullish coalescing doesn't distinguish "genuinely blank" from "not loaded yet"), that seeded blank permanently shadows the real override value when it arrives moments later — the panel silently and durably drops real IO.conf overrides. This is worse than the pre-refactor behavior, where fetch+merge were atomic per `scxmlContent` change and this race window didn't exist.

**Fix:** gate the merge on a `configOverridesLoaded` flag (added to the store — see the amendment note under Task 2) so `entries` stays empty until the host has pushed config data at least once, closing the window where a stale blank could be committed:

```tsx
export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onTypeChange, onEntriesChange }: ConfigPanelProps) {
  const configOverrides = useHostAPIStore(state => state.configOverrides);
  const configOverridesLoaded = useHostAPIStore(state => state.configOverridesLoaded);
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const [newOverride, setNewOverride] = useState('');

  useEffect(() => {
    if (!configOverridesLoaded) return;
    const fields = extractConfigFields(scxmlContent);
    setEntries(prev => mergeConfigEntries(fields, configOverrides, prev));
  }, [scxmlContent, configOverrides, configOverridesLoaded]);
```

This is why Task 7's `.catch()` handler for the config fetch must also call `editor.setConfigValues([])` (not just show a toast) — otherwise a failed fetch would leave `configOverridesLoaded` permanently `false` and the panel permanently gated. See Task 7's final code block, which already reflects this.

Also fix a stale comment left over from the pre-refactor code, in `handleConfirmAdd` (unrelated to the race, just a leftover reference to the removed `fetchOverrides` function):
```tsx
    // Optimistically seed the override into entries so mergeConfigEntries preserves it
    // via previous/localOverrideMap when it rebuilds after the SCXML update.
```
(replacing the old comment that named `fetchOverrides`/`localOverrideMap` alone).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. `ConfigField` should still resolve — it's used later in the file by `CONF_TYPES` and `TypeSelect`'s props.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors (confirms no unused imports were left behind).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/config-panel.tsx
git commit -m "Read config overrides from host API store instead of fetching directly"
```

---

### Task 6: Full build check for the editor repo

**Repo:** `D:/web-scxml-editor`

**Files:** none (verification only)

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors. This exercises the whole chain (types → store → bridge → panel) together, not just each file in isolation.

---

### Task 7: Fetch and push config values from the Vue host

**Repo:** `D:/CS_Jobs/CA_LoopCode/Frontend`

**Files:**
- Modify: `app/pages/scxml.vue`

- [ ] **Step 1: Add `setConfigValues` to the local `ScxmlEditorAPI` type**

In `app/pages/scxml.vue`, add a new line to the `ScxmlEditorAPI` type, directly after `getConfigValues: () => ConfigValueDto[]` (currently line 59):

```ts
  getConfigValues: () => ConfigValueDto[]
  setConfigValues: (values: ConfigValueDto[]) => void
```

- [ ] **Step 2: Fetch and push config overrides during bootstrap**

In the `bootstrap` function's `Promise.all([...])` (currently lines 104-123), add a new entry directly after the `channel-mappings` call and before the `program` call:

```ts
  await Promise.all([
    api<string[]>('/api/v1/scxml-editor/channels')
      .then((channels) => editor.setChannels(channels))
      .catch(() =>
        editor.showFeedback(t('scxml.load-channels-error'), 'error')
      ),
    api<EventDto[]>('/api/v1/scxml-editor/events')
      .then((events) => editor.setEvents(events))
      .catch(() => editor.showFeedback(t('scxml.load-events-error'), 'error')),
    api<ChannelMappingDto[]>('/api/v1/scxml-editor/channel-mappings')
      .then((mappings) => editor.setChannelMappings(mappings))
      // No mappings saved yet is a valid state — swallow silently.
      .catch(() => {}),
    api<ConfigValueDto[]>('/api/v1/scxml-editor/config')
      .then((values) => editor.setConfigValues(values))
      .catch(() => {
        // Push an empty set so the editor's Config panel un-gates (it waits for
        // at least one setConfigValues call before rendering fields — see the
        // amendment note on Task 5) instead of staying blocked forever on a
        // failed fetch. The toast still surfaces the failure to the user.
        editor.setConfigValues([])
        editor.showFeedback(t('scxml.load-config-error'), 'error')
      }),
    api<string>('/api/v1/scxml-editor/program', { responseType: 'text' })
      .then((xml) => {
        if (xml) editor.loadScxml(xml)
      })
      // No program saved yet is a valid state — swallow silently.
      .catch(() => {})
  ])
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/pages/scxml.vue
git commit -m "Fetch and push config overrides to the SCXML editor on bootstrap"
```

---

### Task 8: Add the missing translation key

**Repo:** `D:/CS_Jobs/CA_LoopCode/Frontend`

**Files:**
- Modify: `i18n/locales/en.json`

- [ ] **Step 1: Add `load-config-error`**

In `i18n/locales/en.json`, add a new key directly after `"load-events-error": "Failed to load events",` (currently line 294):

```json
    "load-channels-error": "Failed to load channels",
    "load-events-error": "Failed to load events",
    "load-config-error": "Failed to load config overrides",
    "apply-error": "Failed applying program changes",
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add i18n/locales/en.json
git commit -m "Add load-config-error translation key"
```

---

### Task 9: Manual end-to-end verification

Neither repo has browser-level automated tests for this flow, so this is a manual pass. Requires both repos built/running together (the Vue host serving the iframe from ControlWebUI, or your usual local dev setup for this).

**Files:** none (verification only)

- [ ] **Step 1: Verify the network call moved**

Open the SCXML editor page in a browser with devtools open on the Network tab. Confirm:
- `/api/v1/scxml-editor/config` is requested once (by the top-level page, not the iframe) during initial load.
- `/scxml-editor/config` (the old, wrong path) is never requested.

- [ ] **Step 2: Verify existing overrides load correctly**

With an IO.conf that has at least one `main;<name>;<value>` line matching a `conf_<name>` field in the loaded SCXML, open the Config panel (toolbar → Config). Confirm the "IO.Conf" column shows the existing override value.

- [ ] **Step 3: Verify local edits survive further SCXML edits**

In the Config panel, change an override value. Without applying/reloading, make an unrelated edit to the SCXML (e.g. add a state). Reopen the Config panel and confirm the edited override value is still there (not reverted to the original server value).

- [ ] **Step 4: Verify a new conf_ field defaults to blank**

Add a new `conf_` field via the Config panel's "Add config" button, or by editing the datamodel directly. Confirm its IO.Conf override starts blank.

- [ ] **Step 5: Verify failure handling**

Temporarily block or 500 the `/api/v1/scxml-editor/config` request (e.g. via devtools request blocking) and reload. Confirm a "Failed to load config overrides" toast appears, and the Config panel still renders fields (with blank overrides) instead of crashing.

---

## Self-Review Notes

- **Spec coverage:** Data Model (Task 1, 2), API Surface (Task 1, 3, 7), UI Changes (Task 4, 5), Error Handling (Task 7, verified in Task 9 Step 5), all Edge Cases from the spec table are exercised by Task 4's unit tests (empty fields, blank override, local-edit precedence, removed field, null override) plus Task 9's manual pass (new field, fetch failure). i18n key covered by Task 8. All "Files Changed" rows in the spec map to a task.
- **Type consistency:** `ConfigOverride { name, override }` is defined once in `src/types/host-api.ts` (Task 1) and reused by name in `config-overrides.ts` (Task 4), `host-api-store.ts` (Task 2), and `use-host-api-bridge.ts` (Task 3) — no redefinition drift. `ConfigValueDto` on the Vue side (already existing, unchanged) has the same shape and is structurally compatible.
- **No placeholders:** all code blocks are complete and copy-pasteable; no TBD/TODO markers.
