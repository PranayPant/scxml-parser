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
