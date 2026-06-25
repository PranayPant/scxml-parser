# Time Transition "after X" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `_t_` event-name approach with an `after X` UX where the user types `after 2s`, `after 714ms`, or `after (expr) s`, and the editor auto-generates and maintains all required SCXML artifacts invisibly.

**Architecture:** Three files change. A new utility module (`src/lib/utils/time-transition.ts`) handles all parsing, formatting, and event-name generation. The transition panel (`src/components/diagram/transition-panel.tsx`) is rewritten to use that utility — removing the delay tabs and cancelSendId fields entirely, replacing them with a single `after X` string in the main input. `visual-diagram.tsx` enriches each edge with a `displayEvent` field so that time-transition edges show `after 2s` instead of `Idle_t_0_timeEvent_0` as their label. `scxml-transition-edge.tsx` uses `displayEvent` in `getLabelContent`. `update-actions-command.ts` is **unchanged** — the panel produces the same `TransitionApplyArgs` shape as before, just with auto-generated values.

**Tech Stack:** React (TypeScript), frontend at `D:\web-scxml-editor`

---

## Context

The previous approach exposed `_t_` event names to the user and had two extra tabs (onentry/onexit) for delay and cancel-ID. The new design hides all SCXML internals:

| User types | SCXML generated |
|---|---|
| `after 2s` | `delay="2s"` + auto event name |
| `after 714ms` | `delay="714ms"` + auto event name |
| `after (expr) s` | `delayexpr="expr"` + auto event name |
| `start` (plain event) | `<transition event="start">` |
| `temp > 100` (condition) | `<transition cond="temp > 100">` |

Auto-generated event name format: `{sourceStateId}_t_{N}_timeEvent_{N}` where N is the next available sequential index for that source state (scanning existing SCXML).

**All previously added `_t_` detection code** (onChange classifier, resolvedField fallback, tabs-visibility condition, sendEventNames filter, isTimeEvent gating) is removed and replaced by the `after` parsing approach.

---

## File Map

| File | Action |
|------|--------|
| `src/lib/utils/time-transition.ts` | **Create** — parsing, formatting, generation utilities |
| `src/components/diagram/transition-panel.tsx` | **Rewrite** relevant sections — remove tabs, add `after` logic |
| `src/components/diagram/edges/scxml-transition-edge.tsx` | **Modify** — use `displayEvent` in `getLabelContent` |
| `src/components/diagram/visual-diagram.tsx` | **Modify** — compute and attach `displayEvent` to `_t_` edges |

---

## Task 1: Create `src/lib/utils/time-transition.ts`

**Files:**
- Create: `src/lib/utils/time-transition.ts`

- [ ] **Step 1: Write the utility file**

Create `D:\web-scxml-editor\src\lib\utils\time-transition.ts` with this exact content:

```typescript
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse "after X" user input into a delay descriptor.
 * Returns null if the input does not match any supported format.
 *
 * Accepted formats:
 *   after 2s           → { type: 'delay',     value: '2s'   }
 *   after 714ms        → { type: 'delay',     value: '714ms'}
 *   after (expr) s     → { type: 'delayexpr', value: 'expr' }
 */
export function parseAfterSyntax(
  input: string
): { type: 'delay' | 'delayexpr'; value: string } | null {
  const t = input.trim();

  const ms = t.match(/^after\s+(\d+(?:\.\d+)?)ms$/);
  if (ms) return { type: 'delay', value: `${ms[1]}ms` };

  const sec = t.match(/^after\s+(\d+(?:\.\d+)?)s$/);
  if (sec) return { type: 'delay', value: `${sec[1]}s` };

  const expr = t.match(/^after\s+\((.+)\)\s*s$/);
  if (expr) return { type: 'delayexpr', value: expr[1].trim() };

  return null;
}

/**
 * Reconstruct the "after X" display string from a stored delay type + value.
 * Used when loading an existing time-transition edge.
 */
export function formatAfterSyntax(
  delayType: 'delay' | 'delayexpr',
  delayValue: string
): string {
  return delayType === 'delayexpr'
    ? `after (${delayValue}) s`
    : `after ${delayValue}`;
}

/**
 * Returns true when an event name follows the auto-generated pattern
 * {stateId}_t_{N}_timeEvent_{N}.
 */
export function isTimeEventName(name: string): boolean {
  return /_t_\d+_timeEvent_\d+/.test(name);
}

/**
 * Generate the next available time-event name for a source state.
 * Scans the SCXML string for existing {sourceId}_t_{N}_timeEvent_ occurrences
 * and uses max(N)+1 (starting from 0).
 */
export function generateTimeEventName(
  sourceId: string,
  scxmlContent: string
): string {
  const pattern = new RegExp(
    `${escapeRegExp(sourceId)}_t_(\\d+)_timeEvent_\\d+`,
    'g'
  );
  const indices = [...scxmlContent.matchAll(pattern)].map((m) =>
    parseInt(m[1], 10)
  );
  const next = indices.length === 0 ? 0 : Math.max(...indices) + 1;
  return `${sourceId}_t_${next}_timeEvent_${next}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors on the new file.

- [ ] **Step 3: Commit**

```bash
git -C D:/web-scxml-editor add src/lib/utils/time-transition.ts
git -C D:/web-scxml-editor commit -m "feat: add time-transition utility (parse/format/generate after-syntax)"
```

---

## Task 2: Rewrite `transition-panel.tsx` for the `after X` flow

**Files:**
- Modify: `src/components/diagram/transition-panel.tsx`

This task replaces sections of the file in logical chunks. Read the current file before each step.

### Step 1 — Add import for new utilities

- [ ] At the top of the file, after the existing imports, add:

```typescript
import { parseAfterSyntax, formatAfterSyntax, isTimeEventName, generateTimeEventName } from '@/lib/utils/time-transition';
```

### Step 2 — Replace the init block (rawValue, selectionMode, delay state, cancelSendId)

- [ ] Find the block from `// ── event/cond search state` through `const editingField` (~lines 58–96). Replace the entire block with:

```typescript
  // ── event/cond search state ──
  // For time events the stored event name (e.g. Idle_t_0_timeEvent_0) is invisible to the user;
  // we reconstruct the "after X" display string from the source state's send action.
  const initRawValue = (() => {
    if (event && isTimeEventName(event)) {
      const sendStr = (entryActions ?? []).find((a) => a.startsWith(`send|${event}|`));
      if (sendStr) {
        const parts = sendStr.split('|');
        const dt = (parts[2] as 'delay' | 'delayexpr' | undefined) ?? 'delay';
        const dv = parts.slice(3).join('|');
        return formatAfterSyntax(dt, dv);
      }
    }
    return event ?? cond ?? '';
  })();

  const initSelectionMode = (() => {
    if (event && isTimeEventName(event)) return 'undecided' as const; // shown as "after X"
    if (event) return 'event' as const;
    if (cond) return 'cond' as const;
    return 'undecided' as const;
  })();

  const [selectionMode, setSelectionMode] = React.useState<'undecided' | 'event' | 'cond'>(initSelectionMode);
  const [rawValue, setRawValue] = React.useState(initRawValue);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── originalCancelSendId — needed for cleanup when switching away from a time transition ──
  const initCancelStr = (exitActions ?? []).find((a) => a.startsWith('cancel|'));
  const initCancelId = initCancelStr ? (initCancelStr.split('|')[1] ?? '') : '';

  const editingField: 'event' | 'cond' = selectionMode === 'event' ? 'event' : 'cond';
```

> All delay state (`delayType`, `delayNumber`, `delayUnit`, `delayExpr`), tab state (`activeTab`), and cancelSendId state are removed — the `after X` string in `rawValue` carries all needed information.

### Step 3 — Remove the sendEventNames and sendIdSuggestions memos

- [ ] Delete the entire block from `// ── Send ID suggestions` through the `sendIdSuggestions` memo. It is no longer needed.

### Step 4 — Replace the `handleApply` function

- [ ] Find the `const handleApply = () => {` function and replace it entirely:

```typescript
  const handleApply = () => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const timeParsed = parseAfterSyntax(trimmed);

    if (timeParsed) {
      // Time transition — auto-generate or preserve the _t_ event name
      const existingName = event && isTimeEventName(event) ? event : null;
      const eventName = existingName ?? generateTimeEventName(source, scxmlContent);
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

    // Regular event or condition
    const resolvedField: 'event' | 'cond' =
      selectionMode !== 'undecided' ? editingField :
      events.some((e) => e.name === trimmed) ? 'event' : 'cond';

    const isNewChannel = suggestions.length === 1 && suggestions[0].kind === 'new-channel';
    if (isNewChannel && onNewChannel) {
      onNewChannel(trimmed, source, target, event, cond, resolvedField, edgeId);
      return;
    }

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

### Step 5 — Update `onChange` (remove old `_t_` detection)

- [ ] Find the `onChange` handler on the main search input. Replace with the clean version:

```typescript
            onChange={(e) => {
              const v = e.target.value;
              setRawValue(v);
              if (v === '') setSelectionMode('undecided');
              setIsOpen(true);
              setActiveIndex(-1);
            }}
```

### Step 6 — Update `hintMessage` useMemo

- [ ] Find the `hintMessage` useMemo and replace it:

```typescript
  const hintMessage = React.useMemo(() => {
    if (!isOpen || rawValue.length === 0) return null;
    // Guide user if they've started typing "after" but format isn't valid yet
    if (rawValue.trimStart().startsWith('after') && parseAfterSyntax(rawValue.trim()) === null) {
      return 'Time transition format: after 2s  ·  after 714ms  ·  after (expression) s';
    }
    if (selectionMode === 'event' || suggestions.length > 0) return null;
    return 'No match — type "this_" to create a new channel, or "after Xs" for a time transition';
  }, [isOpen, rawValue, selectionMode, suggestions]);
```

### Step 7 — Update placeholder text

- [ ] Find the `placeholder` prop on the main input and replace:

```typescript
placeholder={selectionMode === 'event' ? 'Enter event' : selectionMode === 'cond' ? 'Enter condition' : 'Search events, channels, or type "after Xs"...'}
```

### Step 8 — Remove the entire onentry/onexit tabs section from JSX

- [ ] Find and delete the block starting at:

```typescript
        {/* onentry/onexit tabs — only shown for time transition events (_t_) */}
        {selectionMode === 'event' && rawValue.includes('_t_') && (
```

...through the closing `)}` of that conditional block (the entire tabs + tab content JSX). The panel now has no tabs.

### Step 9 — Compile and verify

- [ ] Run TypeScript check:

```bash
cd D:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] Check for any remaining references to removed state:

```bash
grep -n "delayNumber\|delayUnit\|delayExpr\|activeTab\|cancelSendId\|sendIdOpen\|activeSendIdIndex" D:/web-scxml-editor/src/components/diagram/transition-panel.tsx
```

Expected: no matches.

### Step 10 — Commit

```bash
git -C D:/web-scxml-editor add src/components/diagram/transition-panel.tsx
git -C D:/web-scxml-editor commit -m "feat(transition-panel): replace _t_ manual UX with after-X time transition syntax"
```

---

## Task 3: Show `after X` as the edge label on the diagram

**Files:**
- Modify: `src/components/diagram/edges/scxml-transition-edge.tsx`
- Modify: `src/components/diagram/visual-diagram.tsx`

### Background

Edge labels are derived in `getLabelContent()` in `scxml-transition-edge.tsx` (line ~249) directly from the `event` prop — the raw SCXML event name (e.g. `Idle_t_0_timeEvent_0`). The delay information needed to reconstruct `after 2s` lives on the source node's `entryActions` array, which is available in `visual-diagram.tsx` during edge enrichment (lines ~1615–1638). The fix stores a pre-computed `displayEvent` field on the edge data and uses it in `getLabelContent`.

### Step 1 — Add `displayEvent` to the edge data interface

- [ ] In `src/components/diagram/edges/scxml-transition-edge.tsx`, find the `SCXMLTransitionEdgeData` interface (line ~17). Add the optional field:

```typescript
  displayEvent?: string;  // "after 2s" / "after 714ms" / "after (expr) s" for _t_ edges
```

### Step 2 — Destructure and use `displayEvent` in `getLabelContent`

- [ ] In the same file, find where `event`, `condition`, `actions` are destructured from `data` at the top of the component. Add `displayEvent` to that destructure.

- [ ] Find `getLabelContent` (line ~249) and replace it:

```typescript
const getLabelContent = () => {
  const parts: string[] = [];
  if (displayEvent ?? event) parts.push(`${displayEvent ?? event}`);
  if (condition) parts.push(`${condition}`);
  if (actions.length > 0)
    parts.push(`/ ${actions.length} action${actions.length > 1 ? 's' : ''}`);
  return parts.join(' ');
};
```

### Step 3 — Compute `displayEvent` during edge enrichment in `visual-diagram.tsx`

- [ ] At the top of `visual-diagram.tsx`, add the import:

```typescript
import { isTimeEventName, formatAfterSyntax } from '@/lib/utils/time-transition';
```

- [ ] Find the edge enrichment block (~lines 1615–1638) where `fullLabel` is computed. Add `displayEvent` computation immediately before `fullLabel`:

```typescript
// For time-transition edges, reconstruct the "after X" display string from the source node's send action
const edgeEventName = edge.data?.event;
const displayEvent = (() => {
  if (!edgeEventName || !isTimeEventName(edgeEventName)) return undefined;
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const sendAction = (sourceNode?.data.entryActions ?? []).find((a: string) =>
    a.startsWith(`send|${edgeEventName}|`)
  );
  if (!sendAction) return undefined;
  const parts = sendAction.split('|');
  const dt = (parts[2] as 'delay' | 'delayexpr' | undefined) ?? 'delay';
  const dv = parts.slice(3).join('|');
  return formatAfterSyntax(dt, dv);
})();
```

- [ ] In the `fullLabel` construction, replace `edge.data?.event` with `displayEvent ?? edge.data?.event`:

```typescript
const fullLabel = [
  displayEvent ?? edge.data?.event,
  edge.data?.condition,
  edge.data?.actions?.length > 0
    ? `/ ${edge.data.actions.length} action${edge.data.actions.length > 1 ? 's' : ''}`
    : null,
]
  .filter(Boolean)
  .join(' ');
```

- [ ] In the `data` spread that follows, add `displayEvent`:

```typescript
data: {
  ...edge.data,
  fullLabel,
  displayEvent,
  offset: pathOptions.offset,
  labelOffsetY: pathOptions.labelOffsetY,
  // ... rest of existing fields
}
```

### Step 4 — Compile and verify

```bash
cd D:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

### Step 5 — Commit

```bash
git -C D:/web-scxml-editor add src/components/diagram/edges/scxml-transition-edge.tsx src/components/diagram/visual-diagram.tsx
git -C D:/web-scxml-editor commit -m "feat(diagram): show 'after X' label on time transition edges"
```

---

## Verification

End-to-end manual tests after all tasks complete:

**1. New time transition (seconds):**
- Open transition panel on an edge. Type `after 2s`. Press Apply.
- Expected SCXML on source state:
  ```xml
  <onentry><send event="Idle_t_0_timeEvent_0" delay="2s"/></onentry>
  <onexit><cancel sendid="Idle_t_0_timeEvent_0"/></onexit>
  ```
- Expected transition: `<transition event="Idle_t_0_timeEvent_0" target="..."/>`

**2. New time transition (milliseconds):**
- Type `after 714ms`. Apply. Confirm `delay="714ms"` in SCXML.

**3. New time transition (expression):**
- Type `after (conf_a > 1 ? conf_b : conf_c) s`. Apply.
- Confirm `delayexpr="conf_a > 1 ? conf_b : conf_c"` in SCXML (no `delay` attribute).

**4. Second time transition from same state:**
- Add a second `after 5s` transition from the same source. Confirm event name becomes `Idle_t_1_timeEvent_1`.

**5. Edit existing time transition:**
- Reopen the panel on the edge created in test 1. Confirm input shows `after 2s` (reconstructed).
- Change to `after 10s`. Apply. Confirm delay updates, event name stays `Idle_t_0_timeEvent_0`.

**6. Change time → plain event:**
- Open a `_t_` edge. Type `start`. Apply.
- Confirm send/cancel removed from source state. Transition has `event="start"`.

**7. Plain event — no tabs:**
- Select a regular event from suggestions. Confirm no onentry/onexit tab section appears.

**8. Edge label display:**
- Create a time transition with `after 2s`. Confirm the arrow on the diagram shows `after 2s` (not `Idle_t_0_timeEvent_0`).
- Create one with `after (conf_x) s`. Confirm label shows `after (conf_x) s`.
- Reload the page. Confirm labels still show `after X` (reconstructed from saved SCXML).

**9. Hint text:**
- Type `after` (incomplete). Confirm format hint appears.
- Type `xyz` (no match). Confirm "No match — …after Xs…" hint appears.
