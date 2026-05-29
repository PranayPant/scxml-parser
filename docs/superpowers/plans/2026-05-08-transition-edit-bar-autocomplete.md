# Transition Edit Bar Autocomplete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add autocomplete suggestion dropdowns for `event` (host API channels) and `cond` (datamodel vars + channels + new-channel hint) to the visual diagram transition edit bar by extracting it into a dedicated `TransitionEditBar` component.

**Architecture:** Create `src/components/diagram/transition-edit-bar.tsx` owning all edit-bar UI state (`editingField`, `rawValue`, `suggestions`, `activeIndex`, `isOpen`). Simplify `selectedEdgeForEdit` in `visual-diagram.tsx` to identity-only (`id`, `source`, `target`, `event?`, `cond?`) and replace the inline edit bar block with `<TransitionEditBar />`.

**Tech Stack:** React 19, Zustand (`useHostAPIStore`), Tailwind CSS, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/diagram/transition-edit-bar.tsx` | Full edit bar UI, suggestion logic, keyboard nav |
| Modify | `src/components/diagram/visual-diagram.tsx` | Simplify state type, replace inline bar with component |

---

## Task 1: Create `TransitionEditBar` component

**Files:**
- Create: `src/components/diagram/transition-edit-bar.tsx`

- [ ] **Step 1: Create the file with the full component**

```tsx
'use client';

import React from 'react';
import { useHostAPIStore } from '@/stores/host-api-store';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';

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

type Suggestion = { label: string; kind: 'regular' | 'new-channel' };

export const TransitionEditBar: React.FC<TransitionEditBarProps> = ({
  edgeId,
  source,
  target,
  event,
  cond,
  scxmlContent,
  onCommit,
  onCancel,
}) => {
  const [editingField, setEditingField] = React.useState<'event' | 'cond'>(
    event ? 'event' : 'cond'
  );
  const [rawValue, setRawValue] = React.useState(event ?? cond ?? '');
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);

  const channels = useHostAPIStore((state) => state.channels);

  const suggestions: Suggestion[] = React.useMemo(() => {
    const prefix = rawValue.toLowerCase();

    if (editingField === 'event') {
      return channels
        .filter((ch) => ch.toLowerCase().startsWith(prefix))
        .map((ch) => ({ label: ch, kind: 'regular' as const }));
    }

    const vars = extractDatamodelVariables(scxmlContent);
    const combined = Array.from(new Set([...vars, ...channels]));
    const filtered = combined.filter((item) =>
      item.toLowerCase().startsWith(prefix)
    );

    if (filtered.length === 0 && rawValue.startsWith('this_')) {
      return [{ label: rawValue, kind: 'new-channel' as const }];
    }

    return filtered.map((item) => ({ label: item, kind: 'regular' as const }));
  }, [editingField, rawValue, channels, scxmlContent]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const commit = (value: string) => {
    if (value) {
      onCommit(source, target, event, cond, value, editingField, edgeId);
    }
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        return;
      }
      if (e.key === 'Tab' && activeIndex >= 0) {
        e.preventDefault();
        setRawValue(suggestions[activeIndex].label);
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(activeIndex >= 0 ? suggestions[activeIndex].label : rawValue);
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
    } else {
      if (e.key === 'Enter') {
        commit(rawValue);
        return;
      }
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
    }
  };

  const switchField = (field: 'event' | 'cond') => {
    setEditingField(field);
    setRawValue(field === 'cond' ? cond ?? '' : event ?? '');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b shadow-md'>
      <span className='text-sm font-medium text-gray-700'>Edit Transition:</span>
      <div className='flex rounded-md border border-blue-300 overflow-hidden text-sm'>
        {(['event', 'cond'] as const).map((field) => (
          <button
            key={field}
            type='button'
            onClick={() => switchField(field)}
            className={`px-3 py-1.5 font-mono transition-colors ${
              editingField === field
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-blue-50'
            }`}
          >
            {field}
          </button>
        ))}
      </div>
      <div className='relative flex-1'>
        <input
          type='text'
          value={rawValue}
          onChange={(e) => {
            setRawValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setIsOpen(false), 100)}
          className='w-full px-3 py-1.5 text-sm text-gray-800 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
          placeholder={editingField === 'cond' ? 'Enter condition' : 'Enter event'}
          autoFocus
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-blue-200 rounded-md shadow-lg max-h-48 overflow-y-auto'>
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.label}
                onMouseDown={() => commit(suggestion.label)}
                className={`px-3 py-1.5 text-sm cursor-pointer ${
                  suggestion.kind === 'new-channel'
                    ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
                    : index === activeIndex
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-blue-100 text-gray-800'
                }`}
              >
                {suggestion.label}
                {suggestion.kind === 'new-channel' && (
                  <span className='ml-2 text-xs text-amber-600'>(new channel)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onCancel}
        className='text-sm text-gray-600 hover:text-gray-900 px-2'
      >
        Cancel
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Type-check the new file**

Run: `npx tsc --noEmit`

Expected: no errors. If errors appear, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/components/diagram/transition-edit-bar.tsx
git commit -m "feat(diagram): add TransitionEditBar component with autocomplete suggestions"
```

---

## Task 2: Update `visual-diagram.tsx`

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

### Step 1: Add the import

- [ ] At the top of the file, alongside other local component imports (around line 47–49), add:

```tsx
import { TransitionEditBar } from './transition-edit-bar';
```

### Step 2: Simplify `selectedEdgeForEdit` state type

- [ ] Find this block (lines 188–196):

```tsx
  const [selectedEdgeForEdit, setSelectedEdgeForEdit] = React.useState<{
    id: string;
    source: string;
    target: string;
    event?: string;
    cond?: string;
    rawValue?: string;
    editingField: 'event' | 'cond';
  } | null>(null);
```

Replace with:

```tsx
  const [selectedEdgeForEdit, setSelectedEdgeForEdit] = React.useState<{
    id: string;
    source: string;
    target: string;
    event?: string;
    cond?: string;
  } | null>(null);
```

### Step 3: Simplify the edge-click setter

- [ ] Find this block (lines 1270–1284):

```tsx
          // Set the selected edge for editing
          const hasEvent = !!edge.data?.event;
          const hasCond = !!edge.data?.condition;
          const initialValue =
            (hasEvent ? edge.data.event : hasCond ? edge.data.condition : '') ||
            '';
          setSelectedEdgeForEdit({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            event: edge.data?.event,
            cond: edge.data?.condition,
            rawValue: initialValue,
            editingField: hasEvent ? 'event' : 'cond',
          });
```

Replace with:

```tsx
          // Set the selected edge for editing
          setSelectedEdgeForEdit({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            event: edge.data?.event,
            cond: edge.data?.condition,
          });
```

### Step 4: Replace the inline edit bar block with `<TransitionEditBar />`

- [ ] Find this entire block (lines 2106–2186):

```tsx
      {/* Transition Label Editor - Overlays the diagram */}
      {selectedEdgeForEdit && (
        <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b shadow-md'>
          <span className='text-sm font-medium text-gray-700'>
            Edit Transition:
          </span>
          <div className='flex rounded-md border border-blue-300 overflow-hidden text-sm'>
            {(['event', 'cond'] as const).map((field) => (
              <button
                key={field}
                type='button'
                onClick={() => {
                  setSelectedEdgeForEdit({
                    ...selectedEdgeForEdit,
                    editingField: field,
                    rawValue:
                      field === 'cond'
                        ? selectedEdgeForEdit.cond || ''
                        : selectedEdgeForEdit.event || '',
                  });
                }}
                className={`px-3 py-1.5 font-mono transition-colors ${
                  selectedEdgeForEdit.editingField === field
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-blue-50'
                }`}
              >
                {field}
              </button>
            ))}
          </div>
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

Replace with:

```tsx
      {/* Transition Label Editor - Overlays the diagram */}
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

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx
git commit -m "refactor(diagram): replace inline edit bar with TransitionEditBar component"
```

---

## Manual Verification Checklist

After both tasks are committed, verify in the browser (`npm run dev`):

- [ ] Click a transition edge → edit bar appears
- [ ] `event` field: typing a prefix that matches a host API channel shows a dropdown
- [ ] `event` field: selecting a suggestion with Enter commits it to the SCXML
- [ ] `event` field: clicking a suggestion commits it
- [ ] `cond` field: typing a prefix shows datamodel variables and channels
- [ ] `cond` field: typing `this_<unmatched>` shows the amber "new channel" entry
- [ ] Arrow keys cycle through suggestions; active row highlighted in blue
- [ ] Tab fills the input without committing
- [ ] Escape when dropdown open → closes dropdown only; Escape again → cancels editing
- [ ] Escape when dropdown closed → cancels editing (clears selection)
- [ ] Switching `event ↔ cond` tab resets input to stored value and closes dropdown
- [ ] Cancel button works as before
- [ ] Clicking elsewhere (blur) closes dropdown after 100 ms
