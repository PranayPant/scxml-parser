# State Actions Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `StateActionsEditBar` overlay with a `StateActionsPanel` side panel that manages multiple `onentry`/`onexit` assign actions per state using a tabbed layout and a docked edit form that writes directly to SCXML on Apply.

**Architecture:** A new `src/components/ui/state-actions-panel.tsx` follows the existing panel pattern (`isVisible`/`onClose` props, `w-80` width). It owns a local copy of action rows initialized from props when `stateId` changes — so SCXML reparsing between Applies doesn't disturb in-flight edits. Each Apply and row-delete calls `onApply` immediately, which routes through `handleNodeActionsChange` → `UpdateActionsCommand`. `VisualDiagramInner` is restructured to render the panel beside the diagram in a `flex` row. The old `StateActionsEditBar` is deleted entirely.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand (`useHostAPIStore`), `UpdateActionsCommand` (`src/lib/commands`), `extractDatamodelVariables` (`src/lib/utils/datamodel-extractor`), `BADGE_COLORS`/`EVENT_FALLBACK_VALUE` (`src/lib`)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `src/components/ui/state-actions-panel.tsx` | New side panel component |
| **Modify** | `src/components/diagram/visual-diagram.tsx` | Replace edit bar with panel, restructure render |
| **Delete** | `src/components/diagram/state-actions-edit-bar.tsx` | Removed entirely |

---

### Task 1: Create `src/components/ui/state-actions-panel.tsx`

**Files:**
- Create: `src/components/ui/state-actions-panel.tsx`

- [ ] **Step 1: Write the full component**

Create `src/components/ui/state-actions-panel.tsx` with this exact content:

```tsx
'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Plus, X } from 'lucide-react';
import React from 'react';

interface ActionRow {
  location: string;
  expr: string;
}

type Tab = 'onentry' | 'onexit';
type FormMode = 'idle' | 'editing' | 'adding';
type Suggestion = { label: string; kind: 'channel' | 'variable' };

interface StateActionsPanelProps {
  isVisible: boolean;
  onClose: () => void;
  stateId: string;
  entryActions: ActionRow[];
  exitActions: ActionRow[];
  scxmlContent: string;
  onApply: (entryActions: string[], exitActions: string[]) => void;
}

function toStrings(rows: ActionRow[]): string[] {
  return rows
    .filter((r) => r.location || r.expr)
    .map((r) => `assign|${r.location}|${r.expr}`);
}

export function StateActionsPanel({
  isVisible,
  onClose,
  stateId,
  entryActions: initialEntry,
  exitActions: initialExit,
  scxmlContent,
  onApply,
}: StateActionsPanelProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>('onentry');
  const [localEntry, setLocalEntry] = React.useState<ActionRow[]>(initialEntry);
  const [localExit, setLocalExit] = React.useState<ActionRow[]>(initialExit);

  // Form state
  const [formMode, setFormMode] = React.useState<FormMode>('idle');
  const [editingRowIndex, setEditingRowIndex] = React.useState<number | null>(null);
  const [formLocation, setFormLocation] = React.useState('');
  const [formExpr, setFormExpr] = React.useState('');

  // Autocomplete state
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = useHostAPIStore((s) => s.channels);
  const dataVars = React.useMemo(
    () => extractDatamodelVariables(scxmlContent),
    [scxmlContent],
  );

  const currentList = activeTab === 'onentry' ? localEntry : localExit;

  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Reset local lists and form when the selected state changes
  React.useEffect(() => {
    setLocalEntry(initialEntry);
    setLocalExit(initialExit);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  // Cleanup blur timer on unmount
  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const suggestions: Suggestion[] = React.useMemo(() => {
    if (formMode === 'idle') return [];
    const prefix = formLocation.toLowerCase();
    const vars = dataVars
      .filter((v) => v.toLowerCase().includes(prefix))
      .map((v): Suggestion => ({ label: v, kind: 'variable' }));
    const chans = channels
      .filter((c) => c.name.toLowerCase().includes(prefix))
      .map((c): Suggestion => ({ label: c.name, kind: 'channel' }));
    return [...vars, ...chans];
  }, [formLocation, dataVars, channels, formMode]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const selectSuggestion = (s: Suggestion) => {
    setFormLocation(s.label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleApply = () => {
    if (formMode === 'idle') return;
    const newRow: ActionRow = { location: formLocation, expr: formExpr };

    let updatedList: ActionRow[];
    if (formMode === 'adding') {
      updatedList = [...currentList, newRow];
    } else {
      updatedList = currentList.map((r, i) =>
        i === editingRowIndex ? newRow : r,
      );
    }

    if (activeTab === 'onentry') {
      setLocalEntry(updatedList);
      onApply(toStrings(updatedList), toStrings(localExit));
    } else {
      setLocalExit(updatedList);
      onApply(toStrings(localEntry), toStrings(updatedList));
    }

    resetForm();
  };

  const handleDelete = (index: number) => {
    const updated = currentList.filter((_, i) => i !== index);
    if (formMode === 'editing' && editingRowIndex === index) resetForm();

    if (activeTab === 'onentry') {
      setLocalEntry(updated);
      onApply(toStrings(updated), toStrings(localExit));
    } else {
      setLocalExit(updated);
      onApply(toStrings(localEntry), toStrings(updated));
    }
  };

  const handleRowClick = (row: ActionRow, index: number) => {
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleAddClick = () => {
    setFormMode('adding');
    setEditingRowIndex(null);
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((p) => (p < suggestions.length - 1 ? p + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((p) => (p > 0 ? p - 1 : suggestions.length - 1));
        return;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter') handleApply();
    if (e.key === 'Escape') resetForm();
  };

  if (!isVisible) return null;

  return (
    <div className='w-80 flex flex-col border-l bg-white shadow-sm h-full overflow-hidden flex-shrink-0'>
      {/* Header */}
      <div className='flex items-center justify-between px-3 py-2 border-b bg-gray-50'>
        <div>
          <span className='text-sm font-semibold text-gray-700'>State Actions</span>
          <p className='text-xs text-blue-500 mt-0.5'>{stateId}</p>
        </div>
        <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
          <X className='h-4 w-4' />
        </button>
      </div>

      {/* Tabs */}
      <div className='flex border-b'>
        {(['onentry', 'onexit'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              resetForm();
            }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'onentry' ? '⚡' : '🚪'} {tab} (
            {(tab === 'onentry' ? localEntry : localExit).length})
          </button>
        ))}
      </div>

      {/* Action list */}
      <div className='flex-1 overflow-y-auto p-2 space-y-1'>
        {currentList.length === 0 && formMode !== 'adding' && (
          <p className='text-xs text-gray-400 italic px-1 py-2'>No actions yet</p>
        )}
        {currentList.map((row, index) => (
          <div
            key={index}
            onClick={() => handleRowClick(row, index)}
            className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group ${
              formMode === 'editing' && editingRowIndex === index
                ? 'bg-blue-50 ring-1 ring-blue-400'
                : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <span className='font-mono truncate text-gray-700'>
              <span className='text-blue-600'>{row.location || '…'}</span>
              <span className='text-gray-400'> = </span>
              <span>{row.expr || '…'}</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(index);
              }}
              className='ml-2 flex-shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity'
            >
              <X className='h-3 w-3' />
            </button>
          </div>
        ))}

        <button
          onClick={handleAddClick}
          className='w-full flex items-center gap-1 px-2 py-1.5 text-xs text-blue-500 border border-dashed border-gray-200 rounded hover:border-blue-300 hover:bg-blue-50 transition-colors'
        >
          <Plus className='h-3 w-3' />
          Add action
        </button>
      </div>

      {/* Docked edit form */}
      <div className='border-t bg-gray-50 p-3 flex-shrink-0'>
        {formMode === 'idle' ? (
          <p className='text-xs text-gray-400 italic text-center py-1'>
            Click a row or + to edit
          </p>
        ) : (
          <div className='space-y-2'>
            <p className='text-[10px] text-gray-500 uppercase tracking-wide font-medium'>
              {formMode === 'adding'
                ? 'New action'
                : `Editing row ${(editingRowIndex ?? 0) + 1}`}
            </p>

            {/* Location field */}
            <div>
              <label className='text-[10px] text-gray-400 block mb-0.5'>
                Location
              </label>
              <div className='relative'>
                <input
                  autoFocus
                  type='text'
                  value={activeIndex >= 0 ? suggestions[activeIndex].label : formLocation}
                  onChange={(e) => {
                    setFormLocation(e.target.value);
                    setIsOpen(true);
                    setActiveIndex(-1);
                  }}
                  onFocus={() => setIsOpen(true)}
                  onBlur={() => {
                    blurTimerRef.current = setTimeout(
                      () => setIsOpen(false),
                      100,
                    );
                  }}
                  onKeyDown={handleLocationKeyDown}
                  placeholder='variable or channel'
                  className='w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400'
                />
                {showSuggestions && (
                  <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-white border rounded shadow-lg max-h-36 overflow-y-auto'>
                    {suggestions.map((s, i) => (
                      <div
                        key={s.label}
                        onMouseDown={() => selectSuggestion(s)}
                        className={`px-2 py-1 text-xs cursor-pointer flex items-center gap-2 ${
                          i === activeIndex
                            ? 'bg-blue-500 text-white'
                            : 'hover:bg-blue-50 text-gray-700'
                        }`}
                      >
                        <span
                          className='text-xs px-1 rounded font-mono text-black'
                          style={{
                            backgroundColor:
                              BADGE_COLORS[
                                channels.find((c) => c.name === s.label)
                                  ?.type ?? EVENT_FALLBACK_VALUE
                              ],
                          }}
                        >
                          {channels.find((c) => c.name === s.label)?.type ??
                            EVENT_FALLBACK_VALUE}
                        </span>
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Expression field */}
            <div>
              <label className='text-[10px] text-gray-400 block mb-0.5'>
                Expression
              </label>
              <input
                type='text'
                value={formExpr}
                onChange={(e) => setFormExpr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply();
                  if (e.key === 'Escape') resetForm();
                }}
                placeholder='expression'
                className='w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400'
              />
            </div>

            {/* Apply / Discard */}
            <div className='flex justify-end gap-2'>
              <button
                onClick={resetForm}
                className='text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100'
              >
                Discard
              </button>
              <button
                onClick={handleApply}
                className='text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600'
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file builds without errors**

Run:
```bash
cd d:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors referencing `state-actions-panel.tsx`. Any other pre-existing errors are acceptable.

- [ ] **Step 3: Commit**

```bash
cd d:/web-scxml-editor
git add src/components/ui/state-actions-panel.tsx
git commit -m "feat(ui): add StateActionsPanel side panel with tabbed onentry/onexit editing"
```

---

### Task 2: Wire `StateActionsPanel` into `visual-diagram.tsx`

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

This task replaces the `StateActionsEditBar` overlay with `StateActionsPanel` rendered beside the diagram in a flex row.

- [ ] **Step 1: Update the import at line 50**

Replace:
```ts
import { StateActionsEditBar } from './state-actions-edit-bar';
```
With:
```ts
import { StateActionsPanel } from '@/components/ui/state-actions-panel';
```

- [ ] **Step 2: Restructure the render return in `VisualDiagramInner`**

The current return (line 2108) is:
```tsx
return (
  <div className='h-full w-full bg-gray-50 flex flex-col relative'>
```

Replace the entire `return (...)` block (lines 2108–2324) with the following. The key changes are:
1. Outer wrapper becomes `flex` (row) instead of `flex-col`
2. Diagram area is wrapped in its own `flex-1` div
3. `StateActionsEditBar` block (lines 2173–2191) is removed
4. `StateActionsPanel` is added as a sibling of the diagram div

```tsx
  return (
    <div className='h-full w-full flex'>
      {/* Diagram area */}
      <div className='flex-1 bg-gray-50 flex flex-col relative overflow-hidden'>
        {/* Edge hover tooltip */}
        {hoveredEdge && (
          <div
            className='fixed z-[10000] pointer-events-none'
            style={{
              left: hoveredEdge.x + 10,
              top: hoveredEdge.y + 10,
            }}
          >
            <div className='bg-gray-900 text-white text-xs px-3 py-2 rounded-md shadow-lg max-w-xs break-words'>
              {hoveredEdge.fullLabel}
            </div>
          </div>
        )}

        {/* Hierarchy Navigation Controls — hidden; breadcrumb shown in main toolbar */}
        <div className='hidden'>
          <div className='flex items-center gap-1 flex-1'>
            {breadcrumbPath.map((path, index) => (
              <React.Fragment key={index}>
                <button
                  onClick={() => navigateToBreadcrumb(index)}
                  className={`px-2 py-1 text-sm hover:bg-gray-100 rounded transition-colors ${
                    index === breadcrumbPath.length - 1
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {path}
                </button>
                {index < breadcrumbPath.length - 1 && (
                  <ChevronRight className='h-3 w-3 text-gray-400' />
                )}
              </React.Fragment>
            ))}
          </div>

          {currentParentNode && (
            <div className='text-sm text-gray-600 ml-auto'>
              Level: {breadcrumbPath.length - 1}
            </div>
          )}
        </div>

        {/* Transition Label Editor - Overlays the diagram */}
        {selectedEdgeForEdit && (
          <TransitionEditBar
            key={selectedEdgeForEdit.id}
            edgeId={selectedEdgeForEdit.id}
            source={selectedEdgeForEdit.source}
            target={selectedEdgeForEdit.target}
            event={selectedEdgeForEdit.event}
            cond={selectedEdgeForEdit.cond}
            scxmlContent={scxmlContent}
            onCommit={handleTransitionLabelChange}
            onNewChannel={handleNewChannel}
            onCancel={() => {
              setSelectedEdgeForEdit(null);
              setSelectedTransitions(new Set());
            }}
          />
        )}

        <div className='flex-1'>
          <ReactFlow
            nodes={nodes}
            edges={displayFilteredEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={(event, node) => handleStateClick(node.id, event)}
            onNodeDoubleClick={(event, node) => {
              event.stopPropagation();
              const nodeElement = nodes.find((n) => n.id === node.id);
              if (nodeElement?.data?.onLabelChange) {
                setNodes((nds) =>
                  nds.map((n) => {
                    if (n.id === node.id) {
                      return {
                        ...n,
                        data: {
                          ...n.data,
                          isEditing: true,
                        },
                      };
                    }
                    return n;
                  })
                );
              }
            }}
            onEdgeClick={handleEdgeClick}
            onEdgeMouseEnter={handleEdgeMouseEnter}
            onEdgeMouseLeave={handleEdgeMouseLeave}
            onPaneClick={() => {
              setSelectedEdgeForEdit(null);
              setSelectedTransitions(new Set());
              setSelectedStateForActions(null);
              setActiveStates(new Set());
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView={true}
            fitViewOptions={{
              padding: 0.3,
              includeHiddenNodes: false,
              minZoom: 0.5,
              maxZoom: 2,
            }}
            attributionPosition='bottom-left'
            className='bg-gradient-to-br from-slate-50 to-slate-100'
            minZoom={0.2}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            deleteKeyCode={['Delete']}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={2}
            reconnectRadius={20}
            edgesUpdatable={true}
            edgesFocusable={true}
            elevateEdgesOnSelect={true}
            elevateNodesOnSelect={false}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false}
            panOnDrag={true}
            zoomOnDoubleClick={false}
          >
            {/* Global SVG definitions for arrows */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
              <defs>
                <marker
                  id='arrow-marker'
                  viewBox='0 0 20 20'
                  refX='20'
                  refY='10'
                  markerWidth='10'
                  markerHeight='10'
                  orient='auto'
                >
                  <path d='M 2 2 L 18 10 L 2 18 L 7 10 Z' fill='currentColor' />
                </marker>
                <marker
                  id='arrow-marker-selected'
                  viewBox='0 0 20 20'
                  refX='20'
                  refY='10'
                  markerWidth='12'
                  markerHeight='12'
                  orient='auto'
                >
                  <path d='M 2 2 L 18 10 L 2 18 L 7 10 Z' fill='#3b82f6' />
                </marker>
              </defs>
            </svg>
            <Background
              color='#cbd5e1'
              gap={20}
              size={1}
              variant={BackgroundVariant.Dots}
            />
            <Controls
              position='bottom-left'
              showZoom={true}
              showFitView={true}
              showInteractive={true}
            >
              <ControlButton
                onClick={handleAddRootState}
                title='Add State'
                aria-label='Add State'
                className='text-gray-600 hover:text-gray-900'
              >
                S
              </ControlButton>
            </Controls>
            <MiniMap
              position='bottom-right'
              nodeStrokeColor='#64748b'
              nodeColor='#f8fafc'
              nodeBorderRadius={12}
              maskColor='rgba(0, 0, 0, 0.05)'
              className='bg-white/90 border border-slate-200 rounded-lg shadow-sm'
            />
          </ReactFlow>
        </div>
      </div>

      {/* State Actions side panel */}
      <StateActionsPanel
        isVisible={selectedStateForActions !== null}
        onClose={() => {
          setSelectedStateForActions(null);
          setActiveStates(new Set());
        }}
        stateId={selectedStateForActions?.id ?? ''}
        entryActions={selectedStateForActions?.entryActions ?? []}
        exitActions={selectedStateForActions?.exitActions ?? []}
        scxmlContent={scxmlContent}
        onApply={(entryActions, exitActions) => {
          if (selectedStateForActions) {
            handleNodeActionsChange(
              selectedStateForActions.id,
              entryActions,
              exitActions,
            );
          }
        }}
      />
    </div>
  );
```

- [ ] **Step 3: Verify the build compiles**

Run:
```bash
cd d:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -40
```

Expected: No new type errors. Any pre-existing errors unrelated to the changed files are acceptable.

- [ ] **Step 4: Commit**

```bash
cd d:/web-scxml-editor
git add src/components/diagram/visual-diagram.tsx
git commit -m "feat(diagram): replace StateActionsEditBar with StateActionsPanel side panel"
```

---

### Task 3: Delete `state-actions-edit-bar.tsx`

**Files:**
- Delete: `src/components/diagram/state-actions-edit-bar.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run:
```bash
cd d:/web-scxml-editor && grep -r "state-actions-edit-bar\|StateActionsEditBar" src/ --include="*.tsx" --include="*.ts"
```

Expected: No output. If any file still imports `StateActionsEditBar`, fix that import before deleting.

- [ ] **Step 2: Delete the file**

```bash
cd d:/web-scxml-editor && rm src/components/diagram/state-actions-edit-bar.tsx
```

- [ ] **Step 3: Verify the build still compiles**

```bash
cd d:/web-scxml-editor && npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors referencing `state-actions-edit-bar`. 

- [ ] **Step 4: Commit**

```bash
cd d:/web-scxml-editor
git add -A
git commit -m "refactor(diagram): delete StateActionsEditBar, replaced by StateActionsPanel"
```

---

## Verification Checklist

After all tasks are complete, manually verify in the running app:

1. **Basic open**: Click a state node with existing `onentry`/`onexit` actions → panel opens on the right side, correct actions listed on the correct tab, counts shown in tab labels.
2. **Edit a row**: Click a row → docked form loads the location and expr values; location field shows autocomplete suggestions matching datamodel variables and channels.
3. **Apply saves**: Edit a value, click Apply → row updates in the list, SCXML source reflects the change, Ctrl+Z (undo) reverts it.
4. **Delete a row**: Click ✕ on a row → row disappears from the list and SCXML is updated immediately.
5. **Add a new action**: Click `+ Add action`, fill in location and expr, click Apply → new row appears at bottom of list and SCXML is updated.
6. **Discard**: Edit a value in the form without clicking Apply, click Discard → form clears, list unchanged, SCXML unchanged.
7. **State switch**: Open panel for StateA, type something in the form (don't Apply), click StateB → panel switches to StateB's actions, form is cleared silently with no prompt.
8. **Tab switch**: Add actions to both onentry and onexit for the same state → each tab independently shows its own list.
9. **Close panel**: Click ✕ on the panel header → panel closes, diagram fills full width again.
10. **No overlay**: Confirm the old `StateActionsEditBar` top-bar overlay no longer appears anywhere.
