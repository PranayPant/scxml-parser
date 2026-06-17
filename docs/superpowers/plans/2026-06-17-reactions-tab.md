# Reactions Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `reactions` tab to the existing `StateActionsPanel` that lets users view, add, edit, and delete `<transition event="X" type="internal">` (within-state, targetless) transitions via the same flat-list UI as `onentry`/`onexit`.

**Architecture:** Parse internal event transitions during SCXML→ReactFlow conversion and store them on node data. Edits flow through a new `UpdateInternalEventsCommand` (same BaseCommand pattern). The panel component gains a third tab with a 2-line row renderer and an extra Event field in the inline form.

**Tech Stack:** React 18, TypeScript, Zustand, ReactFlow 11.11.4, DOMParser/XMLSerializer (browser built-ins), Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/diagram/nodes/scxml-state-node.tsx` | Modify | Add `internalEventActions` to `SCXMLStateNodeData` interface |
| `src/lib/converters/scxml-to-xstate.ts` | Modify | Extract internal event actions and populate `baseNodeData` |
| `src/lib/commands/update-internal-events-command.ts` | Create | Command: accept flat action list → group by event → write SCXML |
| `src/lib/commands/index.ts` | Modify | Re-export new command |
| `src/components/ui/state-actions-panel.tsx` | Modify | Add reactions tab, 2-line rows, Event field in inline form |
| `src/components/diagram/visual-diagram.tsx` | Modify | Pass `internalEventActions` into panel, add reactions change handler |

---

### Task 1: Add `internalEventActions` to `SCXMLStateNodeData`

**Files:**
- Modify: `src/components/diagram/nodes/scxml-state-node.tsx`

- [ ] **Step 1: Open the file and find the interface**

  Open `src/components/diagram/nodes/scxml-state-node.tsx`. The `SCXMLStateNodeData` interface is at the top of the file. It currently ends with:
  ```typescript
  isCompound?: boolean;
  onNavigateInto?: () => void;
  onResize?: (x: number, y: number, width: number, height: number) => void;
  ```

- [ ] **Step 2: Add the new field**

  Add the following field after `exitActions?: string[];` (keep it near the other action fields):
  ```typescript
  internalEventActions?: { event: string; location: string; expr: string }[];
  ```

- [ ] **Step 3: Type-check**

  Run: `cd D:\web-scxml-editor && npx tsc --noEmit`

  Expected: No errors related to `SCXMLStateNodeData`.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/diagram/nodes/scxml-state-node.tsx
  git commit -m "feat(types): add internalEventActions to SCXMLStateNodeData"
  ```

---

### Task 2: Extract internal event actions in the converter

**Files:**
- Modify: `src/lib/converters/scxml-to-xstate.ts` (lines ~324–372)

The `createHierarchicalNode` method already extracts `entryActions` and `exitActions` from `<onentry>`/`<onexit>` elements (lines 324–332). We add the same pattern for targetless internal transitions.

- [ ] **Step 1: Locate the extraction block**

  In `createHierarchicalNode`, find this block (around line 324):
  ```typescript
  // Extract actions
  const onentry = this.getElements(state, 'onentry');
  const onexit = this.getElements(state, 'onexit');
  const entryActions = onentry
    ? extractActionsText(onentry, getAttribute, getElements)
    : [];
  const exitActions = onexit
    ? extractActionsText(onexit, getAttribute, getElements)
    : [];
  ```

- [ ] **Step 2: Add internal event action extraction immediately after that block**

  Insert after the `exitActions` assignment:
  ```typescript
  // Extract internal event actions (targetless transitions with type="internal")
  const rawTransitions = this.getElements(state, 'transition');
  const internalEventActions: { event: string; location: string; expr: string }[] = [];
  if (rawTransitions) {
    const transArray = Array.isArray(rawTransitions) ? rawTransitions : [rawTransitions];
    for (const tr of transArray) {
      const trEvent = getAttribute(tr, 'event');
      const trType = getAttribute(tr, 'type');
      const trTarget = getAttribute(tr, 'target');
      if (trEvent && trType === 'internal' && !trTarget) {
        const assigns = getElements(tr, 'assign');
        if (assigns) {
          const assignsArray = Array.isArray(assigns) ? assigns : [assigns];
          for (const assign of assignsArray) {
            internalEventActions.push({
              event: trEvent,
              location: getAttribute(assign, 'location') || '',
              expr: getAttribute(assign, 'expr') || '',
            });
          }
        }
      }
    }
  }
  ```

- [ ] **Step 3: Add `internalEventActions` to `baseNodeData`**

  Find the `baseNodeData` object (around line 366):
  ```typescript
  const baseNodeData: SCXMLStateNodeData = {
    label: stateId,
    stateType,
    isInitial,
    entryActions,
    exitActions,
  };
  ```

  Change it to:
  ```typescript
  const baseNodeData: SCXMLStateNodeData = {
    label: stateId,
    stateType,
    isInitial,
    entryActions,
    exitActions,
    internalEventActions,
  };
  ```

- [ ] **Step 4: Type-check**

  Run: `npx tsc --noEmit`

  Expected: No errors.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/converters/scxml-to-xstate.ts
  git commit -m "feat(converter): extract internalEventActions from targetless internal transitions"
  ```

---

### Task 3: Create `UpdateInternalEventsCommand`

**Files:**
- Create: `src/lib/commands/update-internal-events-command.ts`

Pattern: identical to `UpdateActionsCommand` — parseXML → findStateElement → DOM mutation → serializeXML. The grouping logic (flat list → `<transition>` elements keyed by event name) lives here.

- [ ] **Step 1: Create the file**

  Create `src/lib/commands/update-internal-events-command.ts` with the following content:

  ```typescript
  import { BaseCommand, type CommandResult } from './base-command';

  export interface InternalEventAction {
    event: string;
    location: string;
    expr: string;
  }

  export class UpdateInternalEventsCommand extends BaseCommand {
    private oldActions?: InternalEventAction[];

    constructor(
      private nodeId: string,
      private actions: InternalEventAction[]
    ) {
      super();
    }

    execute(scxmlContent: string): CommandResult {
      const { doc, error } = this.parseXML(scxmlContent);
      if (!doc) {
        return this.createFailureResult(error || 'Failed to parse XML', scxmlContent);
      }

      const stateElement = this.findStateElement(doc, this.nodeId);
      if (!stateElement) {
        return this.createFailureResult(
          `State element not found: ${this.nodeId}`,
          scxmlContent
        );
      }

      // Snapshot existing internal transitions for undo
      this.oldActions = this.extractCurrentActions(stateElement);

      // Remove all existing targetless internal transitions
      const toRemove = Array.from(stateElement.children).filter(
        (child) =>
          child.tagName.toLowerCase() === 'transition' &&
          child.getAttribute('type') === 'internal' &&
          !child.getAttribute('target')
      );
      toRemove.forEach((el) => stateElement.removeChild(el));

      if (this.actions.length > 0) {
        const scxmlNS =
          doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';

        // Group rows by event name, preserving insertion order
        const grouped = new Map<string, InternalEventAction[]>();
        for (const action of this.actions) {
          if (!grouped.has(action.event)) grouped.set(action.event, []);
          grouped.get(action.event)!.push(action);
        }

        // Insert before the first cross-state (targeted) transition
        const firstCrossTransition =
          Array.from(stateElement.children).find(
            (child) =>
              child.tagName.toLowerCase() === 'transition' &&
              child.getAttribute('target')
          ) || null;

        for (const [eventName, rows] of grouped) {
          const transEl = doc.createElementNS(scxmlNS, 'transition');
          transEl.setAttribute('event', eventName);
          transEl.setAttribute('type', 'internal');
          for (const row of rows) {
            const assignEl = doc.createElementNS(scxmlNS, 'assign');
            assignEl.setAttribute('location', row.location);
            assignEl.setAttribute('expr', row.expr);
            transEl.appendChild(assignEl);
          }
          stateElement.insertBefore(transEl, firstCrossTransition);
        }
      }

      const newContent = this.serializeXML(doc);
      return this.createSuccessResult(newContent, [this.nodeId]);
    }

    undo(scxmlContent: string): CommandResult {
      if (!this.oldActions) {
        return this.createFailureResult(
          'No previous actions to restore',
          scxmlContent
        );
      }
      return new UpdateInternalEventsCommand(
        this.nodeId,
        this.oldActions
      ).execute(scxmlContent);
    }

    getDescription(): string {
      return `Update internal event reactions: ${this.actions.length} action(s)`;
    }

    private extractCurrentActions(stateElement: Element): InternalEventAction[] {
      const result: InternalEventAction[] = [];
      for (const child of Array.from(stateElement.children)) {
        if (
          child.tagName.toLowerCase() === 'transition' &&
          child.getAttribute('type') === 'internal' &&
          !child.getAttribute('target')
        ) {
          const eventName = child.getAttribute('event') || '';
          for (const assign of Array.from(child.children)) {
            if (assign.tagName.toLowerCase() === 'assign') {
              result.push({
                event: eventName,
                location: assign.getAttribute('location') || '',
                expr: assign.getAttribute('expr') || '',
              });
            }
          }
        }
      }
      return result;
    }
  }
  ```

- [ ] **Step 2: Type-check**

  Run: `npx tsc --noEmit`

  Expected: No errors.

- [ ] **Step 3: Commit**
  ```bash
  git add src/lib/commands/update-internal-events-command.ts
  git commit -m "feat(commands): add UpdateInternalEventsCommand for internal event transitions"
  ```

---

### Task 4: Export new command from index

**Files:**
- Modify: `src/lib/commands/index.ts`

- [ ] **Step 1: Add the export**

  In `src/lib/commands/index.ts`, append after the last export line:
  ```typescript
  export { UpdateInternalEventsCommand, type InternalEventAction } from './update-internal-events-command';
  ```

- [ ] **Step 2: Type-check**

  Run: `npx tsc --noEmit`

  Expected: No errors.

- [ ] **Step 3: Commit**
  ```bash
  git add src/lib/commands/index.ts
  git commit -m "feat(commands): export UpdateInternalEventsCommand"
  ```

---

### Task 5: Add reactions tab to `StateActionsPanel`

**Files:**
- Modify: `src/components/ui/state-actions-panel.tsx`

This is the largest change. Follow the existing patterns exactly — new state, new tab, new row renderer, extended inline form. Read the full current file before editing.

- [ ] **Step 1: Update the type definitions at the top of the file**

  Current (line 9–14):
  ```typescript
  interface ActionRow {
    location: string;
    expr: string;
  }

  type Tab = 'onentry' | 'onexit';
  ```

  Replace with:
  ```typescript
  interface ActionRow {
    location: string;
    expr: string;
  }

  interface InternalEventActionRow {
    event: string;
    location: string;
    expr: string;
  }

  type Tab = 'onentry' | 'onexit' | 'reactions';
  ```

- [ ] **Step 2: Extend `StateActionsPanelProps`**

  Current (line 18–26):
  ```typescript
  interface StateActionsPanelProps {
    isVisible: boolean;
    onClose: () => void;
    stateId: string;
    entryActions: ActionRow[];
    exitActions: ActionRow[];
    scxmlContent: string;
    onApply: (entryActions: string[], exitActions: string[]) => void;
  }
  ```

  Replace with:
  ```typescript
  interface StateActionsPanelProps {
    isVisible: boolean;
    onClose: () => void;
    stateId: string;
    entryActions: ActionRow[];
    exitActions: ActionRow[];
    internalEventActions: InternalEventActionRow[];
    scxmlContent: string;
    onApply: (entryActions: string[], exitActions: string[]) => void;
    onApplyReactions: (actions: InternalEventActionRow[]) => void;
  }
  ```

- [ ] **Step 3: Update the destructured props and add new state**

  Current function signature (line 34–42):
  ```typescript
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
  ```

  Replace with:
  ```typescript
  export function StateActionsPanel({
    isVisible,
    onClose,
    stateId,
    entryActions: initialEntry,
    exitActions: initialExit,
    internalEventActions: initialReactions,
    scxmlContent,
    onApply,
    onApplyReactions,
  }: StateActionsPanelProps) {
    const [activeTab, setActiveTab] = React.useState<Tab>('onentry');
    const [localEntry, setLocalEntry] = React.useState<ActionRow[]>(initialEntry);
    const [localExit, setLocalExit] = React.useState<ActionRow[]>(initialExit);
    const [localReactions, setLocalReactions] = React.useState<InternalEventActionRow[]>(initialReactions);

    // Form state
    const [formMode, setFormMode] = React.useState<FormMode>('idle');
    const [editingRowIndex, setEditingRowIndex] = React.useState<number | null>(null);
    const [formEvent, setFormEvent] = React.useState('');
    const [formLocation, setFormLocation] = React.useState('');
    const [formExpr, setFormExpr] = React.useState('');
  ```

- [ ] **Step 4: Update `resetForm` to clear `formEvent`**

  Current (line 66–73):
  ```typescript
  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);
  ```

  Replace with:
  ```typescript
  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormEvent('');
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);
  ```

- [ ] **Step 5: Update the `stateId` effect to also reset `localReactions`**

  Current (line 76–81):
  ```typescript
  React.useEffect(() => {
    setLocalEntry(initialEntry);
    setLocalExit(initialExit);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);
  ```

  Replace with:
  ```typescript
  React.useEffect(() => {
    setLocalEntry(initialEntry);
    setLocalExit(initialExit);
    setLocalReactions(initialReactions);
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);
  ```

- [ ] **Step 6: Update `handleApply` to handle reactions tab**

  Current (line 110–132):
  ```typescript
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
  ```

  Replace with:
  ```typescript
  const handleApply = () => {
    if (formMode === 'idle') return;

    if (activeTab === 'reactions') {
      const newRow: InternalEventActionRow = { event: formEvent, location: formLocation, expr: formExpr };
      const updatedList: InternalEventActionRow[] =
        formMode === 'adding'
          ? [...localReactions, newRow]
          : localReactions.map((r, i) => (i === editingRowIndex ? newRow : r));
      setLocalReactions(updatedList);
      onApplyReactions(updatedList);
      resetForm();
      return;
    }

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
  ```

- [ ] **Step 7: Update `handleDelete` to handle reactions tab**

  Current (line 134–145):
  ```typescript
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
  ```

  Replace with:
  ```typescript
  const handleDelete = (index: number) => {
    if (formMode === 'editing' && editingRowIndex === index) resetForm();

    if (activeTab === 'reactions') {
      const updated = localReactions.filter((_, i) => i !== index);
      setLocalReactions(updated);
      onApplyReactions(updated);
      return;
    }

    const updated = currentList.filter((_, i) => i !== index);
    if (activeTab === 'onentry') {
      setLocalEntry(updated);
      onApply(toStrings(updated), toStrings(localExit));
    } else {
      setLocalExit(updated);
      onApply(toStrings(localEntry), toStrings(updated));
    }
  };
  ```

- [ ] **Step 8: Update `handleAddClick` to pre-fill event for reactions tab**

  Current (line 156–163):
  ```typescript
  const handleAddClick = () => {
    setFormMode('adding');
    setEditingRowIndex(null);
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  };
  ```

  Replace with:
  ```typescript
  const handleAddClick = () => {
    setFormMode('adding');
    setEditingRowIndex(null);
    setFormEvent(activeTab === 'reactions' ? 'vector' : '');
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  };
  ```

- [ ] **Step 9: Add `handleReactionsRowClick` after `handleRowClick`**

  After `handleRowClick` (line 147–154), add:
  ```typescript
  const handleReactionsRowClick = (row: InternalEventActionRow, index: number) => {
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormEvent(row.event);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setIsOpen(false);
    setActiveIndex(-1);
  };
  ```

- [ ] **Step 10: Update the `inlineForm` to include the Event field for reactions tab**

  The `inlineForm` const starts at line 193 with:
  ```typescript
  const inlineForm = (
    <div className='bg-blue-50 ring-1 ring-blue-400 rounded p-2 space-y-1.5'>
      {/* Location field */}
      <div className='relative'>
        <label className='text-[10px] text-gray-500 block mb-0.5'>Location</label>
  ```

  Replace the opening of `inlineForm` to insert the Event field before Location:
  ```typescript
  const inlineForm = (
    <div className='bg-blue-50 ring-1 ring-blue-400 rounded p-2 space-y-1.5'>
      {/* Event field — reactions tab only */}
      {activeTab === 'reactions' && (
        <div>
          <label className='text-[10px] text-gray-500 block mb-0.5'>Event</label>
          <input
            type='text'
            value={formEvent}
            onChange={(e) => setFormEvent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply();
              if (e.key === 'Escape') resetForm();
            }}
            placeholder='vector'
            className='w-full text-xs text-gray-900 border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'
          />
        </div>
      )}
      {/* Location field */}
      <div className='relative'>
        <label className='text-[10px] text-gray-500 block mb-0.5'>Location</label>
  ```

  Also update the Apply button's `disabled` condition to require `formEvent` when on the reactions tab:
  ```typescript
  disabled={!formLocation || !formExpr || (activeTab === 'reactions' && !formEvent)}
  ```

- [ ] **Step 11: Update the tab strip to render all three tabs**

  Current (line 308–323):
  ```typescript
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
        {tab} ({(tab === 'onentry' ? localEntry : localExit).length})
      </button>
    ))}
  </div>
  ```

  Replace with:
  ```typescript
  {/* Tabs */}
  <div className='flex border-b'>
    {(['onentry', 'onexit', 'reactions'] as Tab[]).map((tab) => (
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
        {tab === 'reactions'
          ? `reactions (${localReactions.length})`
          : `${tab} (${(tab === 'onentry' ? localEntry : localExit).length})`}
      </button>
    ))}
  </div>
  ```

- [ ] **Step 12: Replace the action list section to handle the reactions tab**

  Current (line 327–361):
  ```typescript
  {/* Action list */}
  <div className='flex-1 overflow-y-auto p-2 space-y-1'>
    {currentList.length === 0 && formMode !== 'adding' && (
      <p className='text-xs text-gray-400 italic px-1 py-2'>No actions yet</p>
    )}

    {currentList.map((row, index) =>
      formMode === 'editing' && editingRowIndex === index ? (
        <div key={index}>{inlineForm}</div>
      ) : (
        <div
          key={index}
          onClick={() => handleRowClick(row, index)}
          className='flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group bg-gray-50 hover:bg-gray-100'
        >
          <span className='font-mono truncate text-gray-700'>
            <span className='text-blue-600'>{row.location || '…'}</span>
            <span className='text-gray-400'> = </span>
            <span className='text-gray-700'>{row.expr || '…'}</span>
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
      ),
    )}

    {/* New action form appended at bottom when adding */}
    {formMode === 'adding' && <div>{inlineForm}</div>}
  </div>
  ```

  Replace with:
  ```typescript
  {/* Action list */}
  <div className='flex-1 overflow-y-auto p-2 space-y-1'>
    {activeTab === 'reactions' ? (
      <>
        {localReactions.length === 0 && formMode !== 'adding' && (
          <p className='text-xs text-gray-400 italic px-1 py-2'>No reactions yet</p>
        )}
        {localReactions.map((row, index) =>
          formMode === 'editing' && editingRowIndex === index ? (
            <div key={index}>{inlineForm}</div>
          ) : (
            <div
              key={index}
              onClick={() => handleReactionsRowClick(row, index)}
              className='flex items-start justify-between px-2 py-1.5 rounded text-xs cursor-pointer group bg-gray-50 hover:bg-gray-100'
            >
              <div className='flex flex-col min-w-0'>
                <span className='text-violet-600 text-[10px] font-medium'>⚡ {row.event}</span>
                <span className='font-mono text-xs text-gray-700 pl-2'>
                  <span className='text-blue-600'>{row.location || '…'}</span>
                  <span className='text-gray-400'> = </span>
                  <span>{row.expr || '…'}</span>
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(index);
                }}
                className='ml-2 mt-0.5 flex-shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity'
              >
                <X className='h-3 w-3' />
              </button>
            </div>
          )
        )}
        {formMode === 'adding' && <div>{inlineForm}</div>}
      </>
    ) : (
      <>
        {currentList.length === 0 && formMode !== 'adding' && (
          <p className='text-xs text-gray-400 italic px-1 py-2'>No actions yet</p>
        )}
        {currentList.map((row, index) =>
          formMode === 'editing' && editingRowIndex === index ? (
            <div key={index}>{inlineForm}</div>
          ) : (
            <div
              key={index}
              onClick={() => handleRowClick(row, index)}
              className='flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group bg-gray-50 hover:bg-gray-100'
            >
              <span className='font-mono truncate text-gray-700'>
                <span className='text-blue-600'>{row.location || '…'}</span>
                <span className='text-gray-400'> = </span>
                <span className='text-gray-700'>{row.expr || '…'}</span>
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
          )
        )}
        {formMode === 'adding' && <div>{inlineForm}</div>}
      </>
    )}
  </div>
  ```

- [ ] **Step 13: Type-check**

  Run: `npx tsc --noEmit`

  Expected: No errors.

- [ ] **Step 14: Commit**
  ```bash
  git add src/components/ui/state-actions-panel.tsx
  git commit -m "feat(ui): add reactions tab to StateActionsPanel with 2-line rows and Event field"
  ```

---

### Task 6: Wire `visual-diagram.tsx`

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

Three changes: (1) extend the `selectedStateForActions` state type, (2) populate `internalEventActions` when a node is clicked, (3) add handler and pass new props to `StateActionsPanel`.

- [ ] **Step 1: Extend the `selectedStateForActions` type (line 199–203)**

  Current:
  ```typescript
  const [selectedStateForActions, setSelectedStateForActions] = React.useState<{
    id: string;
    entryActions: Array<{ location: string; expr: string }>;
    exitActions: Array<{ location: string; expr: string }>;
  } | null>(null);
  ```

  Replace with:
  ```typescript
  const [selectedStateForActions, setSelectedStateForActions] = React.useState<{
    id: string;
    entryActions: Array<{ location: string; expr: string }>;
    exitActions: Array<{ location: string; expr: string }>;
    internalEventActions: Array<{ event: string; location: string; expr: string }>;
  } | null>(null);
  ```

- [ ] **Step 2: Populate `internalEventActions` when opening the panel (lines 800–804)**

  Current:
  ```typescript
  setSelectedStateForActions({
    id: stateId,
    entryActions: parseActions(node.data.entryActions || []),
    exitActions: parseActions(node.data.exitActions || []),
  });
  ```

  Replace with:
  ```typescript
  setSelectedStateForActions({
    id: stateId,
    entryActions: parseActions(node.data.entryActions || []),
    exitActions: parseActions(node.data.exitActions || []),
    internalEventActions: node.data.internalEventActions || [],
  });
  ```

- [ ] **Step 3: Add `handleNodeInternalEventsChange` after `handleNodeActionsChange` (around line 280)**

  After `handleNodeActionsChange` closes, add:
  ```typescript
  const handleNodeInternalEventsChange = React.useCallback(
    (nodeId: string, actions: Array<{ event: string; location: string; expr: string }>) => {
      if (!onSCXMLChange || !scxmlContent) return;
      try {
        const { UpdateInternalEventsCommand } = require('@/lib/commands');
        const command = new UpdateInternalEventsCommand(nodeId, actions);
        const result = command.execute(scxmlContent);
        if (result.success) {
          onSCXMLChange(result.scxmlContent);
        } else {
          console.error('Failed to update internal event reactions:', result.error);
        }
      } catch (error) {
        console.error('Failed to update internal event reactions:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );
  ```

- [ ] **Step 4: Update `StateActionsPanel` props (lines 2306–2325)**

  Current:
  ```typescript
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
  ```

  Replace with:
  ```typescript
  <StateActionsPanel
    isVisible={selectedStateForActions !== null}
    onClose={() => {
      setSelectedStateForActions(null);
      setActiveStates(new Set());
    }}
    stateId={selectedStateForActions?.id ?? ''}
    entryActions={selectedStateForActions?.entryActions ?? []}
    exitActions={selectedStateForActions?.exitActions ?? []}
    internalEventActions={selectedStateForActions?.internalEventActions ?? []}
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
    onApplyReactions={(actions) => {
      if (selectedStateForActions) {
        handleNodeInternalEventsChange(selectedStateForActions.id, actions);
      }
    }}
  />
  ```

- [ ] **Step 5: Type-check**

  Run: `npx tsc --noEmit`

  Expected: No errors.

- [ ] **Step 6: Commit**
  ```bash
  git add src/components/diagram/visual-diagram.tsx
  git commit -m "feat(diagram): wire reactions tab into visual diagram — pass internalEventActions and handler"
  ```

---

## Manual Smoke Test

After all tasks are complete, load `testDemo.scxml` in the editor and verify:

1. Click a state that has `<transition event="vector" type="internal">` (e.g. `waiting`, `turn_on_heater`) → panel opens with 3 tabs
2. `reactions` tab shows the existing `vector` actions as 2-line rows with `⚡ vector` on line 1
3. Click a row → inline form appears with Event pre-filled to `vector`
4. Change location/expr and click Apply → SCXML updates (check raw XML panel)
5. Click `+` while on `reactions` tab → form appears with Event pre-filled as `vector`
6. Enter a new event name, location, expr → Apply → new row appears
7. Delete a row → `✕` removes it; if last row for that event, the `<transition>` element is removed from XML
8. Click `onentry` / `onexit` tabs → existing behaviour unchanged
9. Reload the SCXML → reactions survive round-trip (parsed back from XML)
