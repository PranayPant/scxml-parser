'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass } from '@/components/ui/primitives';

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
type FormMode = 'idle' | 'editing' | 'adding';
type Suggestion = { label: string; kind: 'channel' | 'variable' };

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

function toStrings(rows: ActionRow[]): string[] {
  return rows
    .filter((r) => r.location && r.expr)
    .map((r) => `assign|${r.location}|${r.expr}`);
}

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
    setFormEvent('');
    setFormLocation('');
    setFormExpr('');
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Reset local lists and form when the selected state changes
  React.useEffect(() => {
    setLocalEntry(initialEntry);
    setLocalExit(initialExit);
    setLocalReactions(initialReactions);
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

  const handleRowClick = (row: ActionRow, index: number) => {
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleReactionsRowClick = (row: InternalEventActionRow, index: number) => {
    setFormMode('editing');
    setEditingRowIndex(index);
    setFormEvent(row.event);
    setFormLocation(row.location);
    setFormExpr(row.expr);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleAddClick = () => {
    setFormMode('adding');
    setEditingRowIndex(null);
    setFormEvent(activeTab === 'reactions' ? 'vector' : '');
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

  // Inline form shared between expanded rows and the new-action form
  const inlineForm = (
    <div className='bg-primary-muted ring-1 ring-primary rounded p-2 space-y-1.5'>
      {/* Event field — reactions tab only */}
      {activeTab === 'reactions' && (
        <div>
          <label className='text-[10px] text-muted block mb-0.5'>Event</label>
          <input
            type='text'
            value={formEvent}
            onChange={(e) => setFormEvent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply();
              if (e.key === 'Escape') resetForm();
            }}
            placeholder='vector'
            className={inputClass}
          />
        </div>
      )}
      {/* Location field */}
      <div className='relative'>
        <label className='text-[10px] text-muted block mb-0.5'>Location</label>
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
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 100);
          }}
          onKeyDown={handleLocationKeyDown}
          placeholder='variable or channel'
          className={inputClass}
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto'>
            {suggestions.map((s, i) => (
              <div
                key={s.label}
                onMouseDown={() => selectSuggestion(s)}
                className={`px-2 py-1 text-xs cursor-pointer flex items-center gap-2 ${
                  i === activeIndex
                    ? 'bg-primary text-primary-fg'
                    : 'hover:bg-primary-muted text-default'
                }`}
              >
                <span
                  className='text-xs px-1 rounded font-mono text-black'
                  style={{
                    backgroundColor:
                      BADGE_COLORS[
                        channels.find((c) => c.name === s.label)?.type ??
                          EVENT_FALLBACK_VALUE
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

      {/* Expression field */}
      <div>
        <label className='text-[10px] text-muted block mb-0.5'>Expression</label>
        <input
          type='text'
          value={formExpr}
          onChange={(e) => setFormExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          className={inputClass}
        />
      </div>

      {/* Apply / Discard */}
      <div className='flex justify-end gap-1.5'>
        <button
          onClick={resetForm}
          className='text-xs px-2.5 py-1 rounded border border-default text-muted hover:bg-muted'
        >
          Discard
        </button>
        <button
          onClick={handleApply}
          disabled={!formLocation || !formExpr || (activeTab === 'reactions' && !formEvent)}
          className='text-xs px-2.5 py-1 rounded bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed'
        >
          Apply
        </button>
      </div>
    </div>
  );

  if (!isVisible) return null;

  return (
    <Panel title='State Actions' onClose={onClose}>
      {/*
        Panel's body is already flex-1 overflow-y-auto, but we need the
        sub-header and tabs to be sticky while only the action list scrolls.
        Wrap everything in a flex-col h-full so the inner list gets its own
        overflow-y-auto region.
      */}
      <div className='flex flex-col h-full'>
        {/* Sub-header: stateId + add button */}
        <div className='flex items-center justify-between px-3 py-1.5 border-b border-default bg-muted flex-shrink-0'>
          <p className='text-xs text-primary'>{stateId}</p>
          <button
            onClick={handleAddClick}
            title='Add action'
            className='text-dimmed hover:text-primary p-0.5 rounded hover:bg-primary-muted transition-colors'
          >
            <Plus className='h-4 w-4' />
          </button>
        </div>

        {/* Tabs */}
        <div className='flex border-b border-default flex-shrink-0'>
          {(['onentry', 'onexit', 'reactions'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                resetForm();
              }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary bg-primary-muted'
                  : 'text-muted hover:text-default'
              }`}
            >
              {tab === 'reactions'
              ? `event reactions (${localReactions.length})`
              : `${tab} (${(tab === 'onentry' ? localEntry : localExit).length})`}
            </button>
          ))}
        </div>

      {/* Action list — scrolls independently */}
      <div className='flex-1 overflow-y-auto p-2 space-y-1'>
        {activeTab === 'reactions' ? (
          <>
            {localReactions.length === 0 && formMode !== 'adding' && (
              <p className='text-xs text-dimmed italic px-1 py-2'>No reactions yet</p>
            )}
            {localReactions.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleReactionsRowClick(row, index)}
                  className='flex items-start justify-between px-2 py-1.5 rounded text-xs cursor-pointer group bg-muted hover:bg-elevated'
                >
                  <div className='flex flex-col min-w-0'>
                    <span className='text-primary text-[10px] font-medium'>{row.event}</span>
                    <span className='font-mono text-xs text-default pl-2 break-all'>
                      <span className='text-primary'>{row.location || '…'}</span>
                      <span className='text-dimmed'> = </span>
                      <span>{row.expr || '…'}</span>
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 mt-0.5 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
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
              <p className='text-xs text-dimmed italic px-1 py-2'>No actions yet</p>
            )}

            {currentList.map((row, index) =>
              formMode === 'editing' && editingRowIndex === index ? (
                <div key={index}>{inlineForm}</div>
              ) : (
                <div
                  key={index}
                  onClick={() => handleRowClick(row, index)}
                  className='flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer group bg-muted hover:bg-elevated'
                >
                  <span className='font-mono truncate text-default'>
                    <span className='text-primary'>{row.location || '…'}</span>
                    <span className='text-dimmed'> = </span>
                    <span className='text-default'>{row.expr || '…'}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    className='ml-2 flex-shrink-0 text-dimmed hover:text-error opacity-0 group-hover:opacity-100 transition-opacity'
                  >
                    <X className='h-3 w-3' />
                  </button>
                </div>
              ),
            )}
            
            {/* New action form appended at bottom when adding */}
            {formMode === 'adding' && <div>{inlineForm}</div>}
          </>
        )}
      </div>
    </div>
  </Panel>
  );
}
