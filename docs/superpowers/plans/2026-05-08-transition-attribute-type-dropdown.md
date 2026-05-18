# Transition Attribute Type Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `<select>` dropdown to the "Edit Transition" overlay bar so users can switch a transition's attribute type between `event` and `cond` directly in the visual diagram.

**Architecture:** Single-file UI change in `visual-diagram.tsx`. A `<select>` is inserted between the "Edit Transition:" label and the text input. Changing its value updates `editingField` and pre-fills `rawValue` with the edge's existing value for the newly-selected field. The existing `handleTransitionLabelChange` / `UpdateTransitionCommand` pipeline handles writing to SCXML unchanged.

**Tech Stack:** React, TypeScript, Tailwind CSS, Next.js

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/diagram/visual-diagram.tsx` | Add `<select>` to edit bar UI and its `onChange` handler |

---

### Task 1: Add the attribute-type `<select>` to the edit bar

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx` — lines ~2107–2161 (the `{selectedEdgeForEdit && (...)}` block)

- [ ] **Step 1: Locate the edit bar block**

Open `src/components/diagram/visual-diagram.tsx`. Find the comment:
```tsx
{/* Transition Label Editor - Overlays the diagram */}
```
The block looks like this (condensed):
```tsx
{selectedEdgeForEdit && (
  <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b shadow-md'>
    <span className='text-sm font-medium text-gray-700'>
      Edit Transition:
    </span>
    <input ... />
    <button>Cancel</button>
  </div>
)}
```

- [ ] **Step 2: Insert the `<select>` between the label and the input**

Replace the `<span>` + `<input>` portion (keep `<button>Cancel</button>` unchanged) with the following. The `<select>` goes immediately after the `<span>`, before the `<input>`:

```tsx
{selectedEdgeForEdit && (
  <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b shadow-md'>
    <span className='text-sm font-medium text-gray-700'>
      Edit Transition:
    </span>
    <select
      value={selectedEdgeForEdit.editingField}
      onChange={(e) => {
        const newField = e.target.value as 'event' | 'cond';
        setSelectedEdgeForEdit({
          ...selectedEdgeForEdit,
          editingField: newField,
          rawValue:
            newField === 'cond'
              ? selectedEdgeForEdit.cond || ''
              : selectedEdgeForEdit.event || '',
        });
      }}
      className='px-2 py-1.5 text-sm text-gray-800 bg-white border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
    >
      <option value='event'>event</option>
      <option value='cond'>cond</option>
    </select>
    <input
      type='text'
      value={selectedEdgeForEdit.rawValue || ''}
      onChange={(e) => {
        const newValue = e.target.value;
        setSelectedEdgeForEdit({
          ...selectedEdgeForEdit,
          rawValue: newValue,
        });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const newLabel = selectedEdgeForEdit.rawValue || '';
          if (newLabel) {
            handleTransitionLabelChange(
              selectedEdgeForEdit.source,
              selectedEdgeForEdit.target,
              selectedEdgeForEdit.event,
              selectedEdgeForEdit.cond,
              newLabel,
              selectedEdgeForEdit.editingField,
              selectedEdgeForEdit.id
            );
          }
          setSelectedEdgeForEdit(null);
          setSelectedTransitions(new Set());
        } else if (e.key === 'Escape') {
          setSelectedEdgeForEdit(null);
          setSelectedTransitions(new Set());
        }
      }}
      className='flex-1 px-3 py-1.5 text-sm text-gray-800 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
      placeholder={
        selectedEdgeForEdit.editingField === 'cond'
          ? 'Enter condition'
          : 'Enter event'
      }
      autoFocus
    />
    <button
      onClick={() => {
        setSelectedEdgeForEdit(null);
        setSelectedTransitions(new Set());
      }}
      className='text-sm text-gray-600 hover:text-gray-900 px-2'
    >
      Cancel
    </button>
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
cd d:\web-scxml-editor
npx tsc --noEmit
```

Expected: no errors. If you see `"cond" | "event"` type errors on `e.target.value`, the cast `as 'event' | 'cond'` handles it — confirm it is present.

- [ ] **Step 4: Run the dev server and manually verify**

```powershell
npm run dev
```

Open the app in a browser at `http://localhost:3000`.

**Test case A — switch event → cond:**
1. Open a diagram that has a transition with `event="foo"` and no `cond`.
2. Click the transition edge. The edit bar appears with the select showing `event` and the input pre-filled with `foo`.
3. Change the select to `cond`. The input should clear to empty (no existing cond value).
4. Type `x > 0` in the input and press Enter.
5. Switch to the Code Editor tab. Verify the transition now has `cond="x > 0"` and the `event` attribute is gone.

**Test case B — switch cond → event:**
1. Open or create a transition with `cond="x > 0"` and no `event`.
2. Click the edge. The select shows `cond`, input shows `x > 0`.
3. Change the select to `event`. The input clears (no existing event value).
4. Type `my_event` and press Enter.
5. Verify in Code Editor: transition has `event="my_event"` and `cond` is gone.

**Test case C — switch event → cond when both exist (edge already has cond):**
1. Manually add a transition with both `event="foo"` and `cond="bar"` in the Code Editor (SCXML allows this).
2. Click the edge. Select shows `event`, input shows `foo`.
3. Change the select to `cond`. Input should pre-fill with `bar`.
4. Press Enter without typing. Verify `cond="bar"` is preserved and `event` is removed.

**Test case D — always/eventless transition:**
1. Use a transition with no `event` or `cond` (`<transition target="state_1"/>`).
2. Click the edge. Select shows `event`, input is empty.
3. Type `loaded` and press Enter.
4. Verify in Code Editor: transition now has `event="loaded"`.

**Test case E — Cancel clears the bar:**
1. Click any edge, change the select, then click Cancel.
2. The bar disappears. The SCXML is unchanged.

- [ ] **Step 5: Commit**

```powershell
cd d:\web-scxml-editor
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat(diagram): add event/cond type dropdown to transition edit bar"
```
