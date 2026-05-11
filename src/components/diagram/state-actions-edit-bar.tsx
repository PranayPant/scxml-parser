'use client';

import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import React from 'react';

interface ActionRow {
  location: string;
  expr: string;
}

interface StateActionsEditBarProps {
  stateId: string;
  entryActions: ActionRow[];
  exitActions: ActionRow[];
  scxmlContent: string;
  onSave: (entryActions: string[], exitActions: string[]) => void;
  onCancel: () => void;
}

export const StateActionsEditBar: React.FC<StateActionsEditBarProps> = ({
  stateId,
  entryActions: initialEntry,
  exitActions: initialExit,
  scxmlContent,
  onSave,
  onCancel,
}) => {
  const [editingField, setEditingField] = React.useState<'onentry' | 'onexit'>('onentry');
  const [entryActions, setEntryActions] = React.useState<ActionRow[]>(
    initialEntry.length > 0 ? initialEntry : [{ location: '', expr: '' }]
  );
  const [exitActions, setExitActions] = React.useState<ActionRow[]>(
    initialExit.length > 0 ? initialExit : [{ location: '', expr: '' }]
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const actions = editingField === 'onentry' ? entryActions : exitActions;
  const setActions = editingField === 'onentry' ? setEntryActions : setExitActions;

  const dataVars = React.useMemo(
    () => extractDatamodelVariables(scxmlContent),
    [scxmlContent]
  );

  const locationValue = actions[0]?.location ?? '';

  const suggestions = React.useMemo(() => {
    const prefix = locationValue.toLowerCase();
    if (!prefix) return dataVars;
    return dataVars.filter((v) => v.toLowerCase().startsWith(prefix));
  }, [locationValue, dataVars]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const selectSuggestion = (value: string) => {
    const updated = actions.length > 0 ? [...actions] : [{ location: '', expr: '' }];
    updated[0] = { ...updated[0], location: value };
    setActions(updated);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const saveAll = () => {
    const toStrings = (rows: ActionRow[]) =>
      rows.filter((a) => a.location || a.expr).map((a) => `assign|${a.location}|${a.expr}`);
    onSave(toStrings(entryActions), toStrings(exitActions));
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        selectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0) selectSuggestion(suggestions[activeIndex]);
        else saveAll();
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
    } else {
      if (e.key === 'Enter') { saveAll(); return; }
      if (e.key === 'Escape') { onCancel(); return; }
    }
  };

  return (
    <div className='absolute top-[49px] left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 bg-green-50 border-b shadow-md'>
      <span className='text-sm font-medium text-gray-700'>Edit {stateId}:</span>

      {/* onentry / onexit switch */}
      <div className='flex rounded-md border border-green-300 overflow-hidden text-sm'>
        {(['onentry', 'onexit'] as const).map((field) => (
          <button
            key={field}
            type='button'
            onClick={() => { setEditingField(field); setIsOpen(false); setActiveIndex(-1); }}
            className={`px-3 py-1.5 font-mono transition-colors ${
              editingField === field
                ? 'bg-green-500 text-white'
                : 'bg-white text-gray-600 hover:bg-green-50'
            }`}
          >
            {field}
          </button>
        ))}
      </div>

      {/* location input with autocomplete */}
      <div className='relative w-40'>
        <input
          type='text'
          value={activeIndex >= 0 ? suggestions[activeIndex] : locationValue}
          onChange={(e) => {
            const updated = actions.length > 0 ? [...actions] : [{ location: '', expr: '' }];
            updated[0] = { ...updated[0], location: e.target.value };
            setActions(updated);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => { blurTimerRef.current = setTimeout(() => setIsOpen(false), 100); }}
          onKeyDown={handleLocationKeyDown}
          className='w-full px-3 py-1.5 text-sm text-gray-800 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
          placeholder='location'
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-green-200 rounded-md shadow-lg max-h-48 overflow-y-auto'>
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion}
                onMouseDown={() => selectSuggestion(suggestion)}
                className={`px-3 py-1.5 text-sm cursor-pointer ${
                  index === activeIndex ? 'bg-green-500 text-white' : 'hover:bg-green-100 text-gray-800'
                }`}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* expr input */}
      <input
        type='text'
        value={actions[0]?.expr ?? ''}
        onChange={(e) => {
          const updated = actions.length > 0 ? [...actions] : [{ location: '', expr: '' }];
          updated[0] = { ...updated[0], expr: e.target.value };
          setActions(updated);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveAll();
          else if (e.key === 'Escape') onCancel();
        }}
        className='flex-1 px-3 py-1.5 text-sm text-gray-800 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
        placeholder='expr'
      />

      <button
        onClick={saveAll}
        className='px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700'
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className='text-sm text-gray-600 hover:text-gray-900 px-2'
      >
        Cancel
      </button>
    </div>
  );
};
