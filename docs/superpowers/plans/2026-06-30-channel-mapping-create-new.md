# Channel Mapping — Create New Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add new SCXML ref → physical channel mappings from the Channel Mapping Panel; new refs appear immediately in the transition panel autocomplete.

**Architecture:** All changes are confined to `src/components/ui/channel-mapping-panel.tsx`. "Manual" rows are inferred: any `channelMappings` entry whose `scxmlRef` is not in the current `unresolvedRefs` list. The store is unchanged — `updateChannelMapping(ref, '')` already removes an entry.

**Tech Stack:** React 19, Zustand, Tailwind CSS, lucide-react, Next.js 15.

---

## File Changed

- Modify: `src/components/ui/channel-mapping-panel.tsx` — add state, manual-row derivation, updated table, inline add row, footer button

---

### Task 1: Update imports and add component state

**Files:**
- Modify: `src/components/ui/channel-mapping-panel.tsx`

- [ ] **Step 1: Replace the import block**

Open `src/components/ui/channel-mapping-panel.tsx`. Replace the top of the file (lines 1–8) with:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { extractDatamodelVariables, extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel, inputClass } from '@/components/ui/primitives';
```

Changes from the original:
- Added `useState` to the React import
- Added `Check`, `Plus`, `Trash2`, `X` from lucide-react
- Added `inputClass` to the primitives import

- [ ] **Step 2: Add state variables and derived values inside the component**

Inside `ChannelMappingPanel`, after the existing `updateChannelMapping` line, add:

```tsx
  const [isAdding, setIsAdding] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newChannel, setNewChannel] = useState('');
```

Then, after the existing `availableOptions` memo, add two new memos:

```tsx
  const manualRows = useMemo(
    () => channelMappings.filter(m => !unresolvedRefs.includes(m.scxmlRef)),
    [channelMappings, unresolvedRefs],
  );

  const existingRefs = useMemo(
    () => new Set([...unresolvedRefs, ...channelMappings.map(m => m.scxmlRef)]),
    [unresolvedRefs, channelMappings],
  );
```

- [ ] **Step 3: Add confirm/cancel handlers**

After the `getMapped` helper, add:

```tsx
  const handleConfirmAdd = () => {
    const trimmed = newRef.trim();
    if (!trimmed || existingRefs.has(trimmed)) return;
    updateChannelMapping(trimmed, newChannel);
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };
```

---

### Task 2: Update table structure — 3rd column and manual rows

**Files:**
- Modify: `src/components/ui/channel-mapping-panel.tsx`

- [ ] **Step 1: Update the empty-state condition and add a derived variable**

Replace the `if (!isVisible) return null;` early return and the opening of the JSX with:

```tsx
  if (!isVisible) return null;

  const isEmpty = unresolvedRefs.length === 0 && manualRows.length === 0;
```

- [ ] **Step 2: Replace the entire return statement**

Replace everything from `return (` to the end of the file with the complete updated JSX below. Read the full block carefully — it covers all three tasks (table, manual rows, add row, footer).

```tsx
  return (
    <Panel
      title='Channel Mapping'
      onClose={onClose}
      footer={
        !isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add mapping
          </button>
        ) : undefined
      }
    >
      {isEmpty && !isAdding ? (
        <div className='p-4 text-xs text-muted space-y-2'>
          <p>No unresolved channel references found in this SCXML.</p>
          <p>
            Channel references are variable names used in conditions or expressions that are not
            declared in the{' '}
            <code className='bg-muted px-1 rounded'>&lt;datamodel&gt;</code> and do not use
            the <code className='bg-muted px-1 rounded'>this_</code> or{' '}
            <code className='bg-muted px-1 rounded'>conf_</code> prefixes.
          </p>
        </div>
      ) : (
        <table className='w-full text-xs table-fixed'>
          <thead>
            <tr className='bg-muted border-b border-default'>
              <th className='text-left px-3 py-2 text-muted font-medium w-2/5'>SCXML Ref</th>
              <th className='text-left px-3 py-2 text-muted font-medium'>Physical Channel</th>
              <th className='w-8' />
            </tr>
          </thead>
          <tbody>
            {unresolvedRefs.map(ref => (
              <tr key={ref} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-mono text-default truncate max-w-0' title={ref}>{ref}</td>
                <td className='px-3 py-2'>
                  {availableOptions.length === 0 ? (
                    <span className='text-dimmed italic'>No channels available</span>
                  ) : (
                    <SearchableSelect
                      value={getMapped(ref)}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(ref, v)}
                    />
                  )}
                </td>
                <td />
              </tr>
            ))}
            {manualRows.map(({ scxmlRef }) => (
              <tr key={scxmlRef} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-mono text-default truncate max-w-0' title={scxmlRef}>{scxmlRef}</td>
                <td className='px-3 py-2'>
                  {availableOptions.length === 0 ? (
                    <span className='text-dimmed italic'>No channels available</span>
                  ) : (
                    <SearchableSelect
                      value={getMapped(scxmlRef)}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(scxmlRef, v)}
                    />
                  )}
                </td>
                <td className='px-3 py-2'>
                  <button
                    onClick={() => updateChannelMapping(scxmlRef, '')}
                    className='p-1 rounded text-dimmed hover:text-error hover:bg-muted transition-colors'
                    title='Remove mapping'
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                </td>
              </tr>
            ))}
            {isAdding && (
              <tr className='border-b border-default bg-primary-muted'>
                <td className='px-3 py-2'>
                  <input
                    autoFocus
                    type='text'
                    value={newRef}
                    onChange={e => setNewRef(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmAdd();
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    placeholder='ref_name'
                    className={inputClass}
                  />
                </td>
                <td className='px-3 py-2'>
                  <SearchableSelect
                    value={newChannel}
                    options={availableOptions}
                    onChange={setNewChannel}
                  />
                </td>
                <td className='px-3 py-2'>
                  <div className='flex gap-1'>
                    <button
                      onClick={handleConfirmAdd}
                      disabled={!newRef.trim() || existingRefs.has(newRef.trim())}
                      className='p-1 rounded text-success hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed'
                      title='Confirm'
                    >
                      <Check className='h-3 w-3' />
                    </button>
                    <button
                      onClick={handleCancelAdd}
                      className='p-1 rounded text-dimmed hover:bg-muted'
                      title='Cancel'
                    >
                      <X className='h-3 w-3' />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
```

---

### Task 3: Verify and commit

**Files:**
- Modify: `src/components/ui/channel-mapping-panel.tsx`

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors, fix them before continuing.

- [ ] **Step 2: Verify the complete file looks correct**

The final `src/components/ui/channel-mapping-panel.tsx` should be exactly:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { extractDatamodelVariables, extractUnresolvedChannelRefs } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel, inputClass } from '@/components/ui/primitives';

interface ChannelMappingPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
}

export function ChannelMappingPanel({ isVisible, onClose, scxmlContent }: ChannelMappingPanelProps) {
  const channels = useHostAPIStore(state => state.channels);
  const channelMappings = useHostAPIStore(state => state.channelMappings);
  const updateChannelMapping = useHostAPIStore(state => state.updateChannelMapping);

  const [isAdding, setIsAdding] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const channelNames = useMemo(() => channels.map(c => c.name), [channels]);

  const unresolvedRefs = useMemo(() => extractUnresolvedChannelRefs(scxmlContent, channelNames), [scxmlContent, channelNames]);

  const availableOptions = useMemo(() => {
    const datamodelVars = extractDatamodelVariables(scxmlContent).filter(v => !v.startsWith('this_'));
    return Array.from(new Set([...channelNames, ...datamodelVars])).sort();
  }, [scxmlContent, channelNames]);

  const manualRows = useMemo(
    () => channelMappings.filter(m => !unresolvedRefs.includes(m.scxmlRef)),
    [channelMappings, unresolvedRefs],
  );

  const existingRefs = useMemo(
    () => new Set([...unresolvedRefs, ...channelMappings.map(m => m.scxmlRef)]),
    [unresolvedRefs, channelMappings],
  );

  const getMapped = (scxmlRef: string) =>
    channelMappings.find(m => m.scxmlRef === scxmlRef)?.mappedChannel ?? '';

  const handleConfirmAdd = () => {
    const trimmed = newRef.trim();
    if (!trimmed || existingRefs.has(trimmed)) return;
    updateChannelMapping(trimmed, newChannel);
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewRef('');
    setNewChannel('');
    setIsAdding(false);
  };

  if (!isVisible) return null;

  const isEmpty = unresolvedRefs.length === 0 && manualRows.length === 0;

  return (
    <Panel
      title='Channel Mapping'
      onClose={onClose}
      footer={
        !isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add mapping
          </button>
        ) : undefined
      }
    >
      {isEmpty && !isAdding ? (
        <div className='p-4 text-xs text-muted space-y-2'>
          <p>No unresolved channel references found in this SCXML.</p>
          <p>
            Channel references are variable names used in conditions or expressions that are not
            declared in the{' '}
            <code className='bg-muted px-1 rounded'>&lt;datamodel&gt;</code> and do not use
            the <code className='bg-muted px-1 rounded'>this_</code> or{' '}
            <code className='bg-muted px-1 rounded'>conf_</code> prefixes.
          </p>
        </div>
      ) : (
        <table className='w-full text-xs table-fixed'>
          <thead>
            <tr className='bg-muted border-b border-default'>
              <th className='text-left px-3 py-2 text-muted font-medium w-2/5'>SCXML Ref</th>
              <th className='text-left px-3 py-2 text-muted font-medium'>Physical Channel</th>
              <th className='w-8' />
            </tr>
          </thead>
          <tbody>
            {unresolvedRefs.map(ref => (
              <tr key={ref} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-mono text-default truncate max-w-0' title={ref}>{ref}</td>
                <td className='px-3 py-2'>
                  {availableOptions.length === 0 ? (
                    <span className='text-dimmed italic'>No channels available</span>
                  ) : (
                    <SearchableSelect
                      value={getMapped(ref)}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(ref, v)}
                    />
                  )}
                </td>
                <td />
              </tr>
            ))}
            {manualRows.map(({ scxmlRef }) => (
              <tr key={scxmlRef} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-mono text-default truncate max-w-0' title={scxmlRef}>{scxmlRef}</td>
                <td className='px-3 py-2'>
                  {availableOptions.length === 0 ? (
                    <span className='text-dimmed italic'>No channels available</span>
                  ) : (
                    <SearchableSelect
                      value={getMapped(scxmlRef)}
                      options={availableOptions}
                      onChange={v => updateChannelMapping(scxmlRef, v)}
                    />
                  )}
                </td>
                <td className='px-3 py-2'>
                  <button
                    onClick={() => updateChannelMapping(scxmlRef, '')}
                    className='p-1 rounded text-dimmed hover:text-error hover:bg-muted transition-colors'
                    title='Remove mapping'
                  >
                    <Trash2 className='h-3 w-3' />
                  </button>
                </td>
              </tr>
            ))}
            {isAdding && (
              <tr className='border-b border-default bg-primary-muted'>
                <td className='px-3 py-2'>
                  <input
                    autoFocus
                    type='text'
                    value={newRef}
                    onChange={e => setNewRef(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmAdd();
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    placeholder='ref_name'
                    className={inputClass}
                  />
                </td>
                <td className='px-3 py-2'>
                  <SearchableSelect
                    value={newChannel}
                    options={availableOptions}
                    onChange={setNewChannel}
                  />
                </td>
                <td className='px-3 py-2'>
                  <div className='flex gap-1'>
                    <button
                      onClick={handleConfirmAdd}
                      disabled={!newRef.trim() || existingRefs.has(newRef.trim())}
                      className='p-1 rounded text-success hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed'
                      title='Confirm'
                    >
                      <Check className='h-3 w-3' />
                    </button>
                    <button
                      onClick={handleCancelAdd}
                      className='p-1 rounded text-dimmed hover:bg-muted'
                      title='Cancel'
                    >
                      <X className='h-3 w-3' />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/channel-mapping-panel.tsx
git commit -m "feat(channel-mapping): allow creating new ref→channel mappings from panel"
```
