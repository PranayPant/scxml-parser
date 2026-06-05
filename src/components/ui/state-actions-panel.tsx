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
    .filter((r) => r.location && r.expr)
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

  // Inline form shared between expanded rows and the new-action form
  const inlineForm = (
    <div className='bg-blue-50 ring-1 ring-blue-400 rounded p-2 space-y-1.5'>
      {/* Location field */}
      <div className='relative'>
        <label className='text-[10px] text-gray-500 block mb-0.5'>Location</label>
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
          className='w-full text-xs text-gray-900 border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'
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
        <label className='text-[10px] text-gray-500 block mb-0.5'>Expression</label>
        <input
          type='text'
          value={formExpr}
          onChange={(e) => setFormExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
            if (e.key === 'Escape') resetForm();
          }}
          placeholder='expression'
          className='w-full text-xs text-gray-900 border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'
        />
      </div>

      {/* Apply / Discard */}
      <div className='flex justify-end gap-1.5'>
        <button
          onClick={resetForm}
          className='text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100'
        >
          Discard
        </button>
        <button
          onClick={handleApply}
          disabled={!formLocation || !formExpr}
          className='text-xs px-2.5 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed'
        >
          Apply
        </button>
      </div>
    </div>
  );

  if (!isVisible) return null;

  return (
    <div className='w-80 flex flex-col border-l bg-white shadow-sm h-full overflow-hidden flex-shrink-0'>
      {/* Header */}
      <div className='flex items-center justify-between px-3 py-2 border-b bg-gray-50'>
        <div>
          <span className='text-sm font-semibold text-gray-700'>State Actions</span>
          <p className='text-xs text-blue-500 mt-0.5'>{stateId}</p>
        </div>
        <div className='flex items-center gap-1'>
          <button
            onClick={handleAddClick}
            title='Add action'
            className='text-gray-400 hover:text-blue-500 p-0.5 rounded hover:bg-blue-50 transition-colors'
          >
            <Plus className='h-4 w-4' />
          </button>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 transition-colors'>
            <X className='h-4 w-4' />
          </button>
        </div>
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
            {tab} ({(tab === 'onentry' ? localEntry : localExit).length})
          </button>
        ))}
      </div>

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
    </div>
  );
}
