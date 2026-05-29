# Design: LoopControl Init Behavior

**Date:** 2026-05-21  
**Scope:** `D:\web-scxml-editor` — changes only affect behavior when running inside LoopControl

---

## Problem

When the editor loads inside LoopControl, there is a visible flash of the "Create new Editor UI" (welcome/upload screen) before the auto-loaded SCXML content appears. Additionally, the editor defaults to the Code Editor tab, but the Visual Diagram tab is more useful as the default in the LoopControl context.

---

## Solution

### 1. Suppress the welcome screen flash

Add two state variables to `page.tsx`:

- `isInitializing: boolean` — initialized to `true`; set to `false` in the `finally` block of the existing auto-load `useEffect`
- `isLoopControl: boolean` — initialized to `false`; set to `true` only when the auto-load fetch returns `r.ok` with content

Render gate: if `isInitializing`, return `null`. After init, the existing `!content ? <welcome> : <editor>` branch is unchanged.

### 2. Default to Visual Diagram tab inside LoopControl

Add `initialTab?: TabType` prop to `TwoTabLayout` (default: `"code"`).  
Change internal `useState` to `useState<TabType>(initialTab ?? "code")`.  
In `page.tsx`, pass `initialTab={isLoopControl ? "visual" : "code"}`.

Because `TwoTabLayout` only mounts after `isInitializing` is false — and `isLoopControl` is already set by then — the initial tab is always correct on first mount.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/page.tsx` | Add `isInitializing`, `isLoopControl` state; update auto-load `useEffect`; update render gate; pass `initialTab` prop |
| `src/components/layout/two-tab-layout.tsx` | Add `initialTab?: TabType` prop; use it in `useState` |

---

## Invariants

- Standalone usage (no `/scxml-editor/program` endpoint): fetch fails → `isLoopControl = false` → welcome screen shown with Code Editor as default. Behavior identical to today.
- LoopControl usage: fetch succeeds → `isLoopControl = true`, `isInitializing = false` → editor shown directly on Visual Diagram tab. No flash.
- `isInitializing` is always set to `false` (in `finally`), so the UI never stays blank if the network is slow or the fetch errors.
