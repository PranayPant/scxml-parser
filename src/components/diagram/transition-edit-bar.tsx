'use client';

import React from 'react';
import { Save, X } from 'lucide-react';
import { useHostAPIStore } from '@/stores/host-api-store';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { BADGE_COLORS } from '@/lib';

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
  onNewChannel?: (
    channelName: string,
    source: string,
    target: string,
    originalEvent: string | undefined,
    originalCond: string | undefined,
    editingField: 'event' | 'cond',
    edgeId: string
  ) => void;
  onCancel: () => void;
}

type Suggestion = { label: string; kind: 'channel' | 'event' | 'variable' | 'new-channel' };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||'];
const OPERATOR_SET = new Set([...OPERATORS, '!']);

export const TransitionEditBar: React.FC<TransitionEditBarProps> = ({
  edgeId,
  source,
  target,
  event,
  cond,
  scxmlContent,
  onCommit,
  onNewChannel,
  onCancel,
}) => {
  const [editingField, setEditingField] = React.useState<'event' | 'cond'>(
    event ? 'event' : 'cond'
  );
  const [rawValue, setRawValue] = React.useState(event ?? cond ?? '');
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const channels = useHostAPIStore((state) => state.channels);
  const events = useHostAPIStore((state) => state.events);

  const suggestions: Suggestion[] = React.useMemo(() => {
    const vars = extractDatamodelVariables(scxmlContent);
    const channelSet = new Set(channels.map(c => c.name));
    const eventSet = new Set(editingField === 'event' ? events.map(e => e.name) : []);

    const kindOf = (item: string): Suggestion['kind'] =>
      channelSet.has(item) ? 'channel' : eventSet.has(item) ? 'event' : 'variable';

    const allNames = Array.from(new Set([...vars, ...channelSet, ...eventSet]));

    if (editingField !== 'cond') {
      const prefix = rawValue.toLowerCase();
      const filtered = allNames.filter((item) => item.toLowerCase().includes(prefix));
      if (filtered.length === 0 && rawValue.startsWith('this_')) {
        return [{ label: rawValue, kind: 'new-channel' }];
      }
      return filtered.map((item) => ({ label: item, kind: kindOf(item) }));
    }

    // Cond field: token-aware suggestions
    const endsWithSpace = rawValue.endsWith(' ');
    const tokens = rawValue.trimEnd().split(/\s+/);
    const lastToken = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
    const prevToken = endsWithSpace ? (tokens[tokens.length - 1] ?? '') : (tokens[tokens.length - 2] ?? '');

    if (endsWithSpace) {
      if (OPERATOR_SET.has(prevToken)) {
        return allNames.map((item) => ({ label: item, kind: kindOf(item) }));
      }
      return OPERATORS.map((op) => ({ label: op, kind: 'variable' as const }));
    }

    const prefix = lastToken.toLowerCase();
    const filtered = allNames.filter((item) => item.toLowerCase().includes(prefix));
    if (filtered.length === 0 && lastToken.startsWith('this_')) {
      return [{ label: lastToken, kind: 'new-channel' }];
    }
    return filtered.map((item) => ({ label: item, kind: kindOf(item) }));
  }, [rawValue, channels, events, scxmlContent, editingField]);

  const showSuggestions = isOpen && suggestions.length > 0;

  const buildCondValue = (label: string): string => {
    const endsWithSpace = rawValue.endsWith(' ');
    if (endsWithSpace) return rawValue + label;
    const tokens = rawValue.split(/\s+/);
    tokens[tokens.length - 1] = label;
    return tokens.join(' ');
  };

  const acceptSuggestion = (label: string) => {
    setRawValue(editingField === 'cond' ? buildCondValue(label) : label);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const commit = (value: string, kind: Suggestion['kind'] = 'variable') => {
    const trimmed = value.trim();
    if (kind === 'new-channel' && onNewChannel) {
      onNewChannel(trimmed, source, target, event, cond, editingField, edgeId);
    } else if (trimmed) {
      onCommit(source, target, event, cond, trimmed, editingField, edgeId);
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
        acceptSuggestion(suggestions[activeIndex].label);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        let enterIndex = -1;
        if(rawValue.startsWith('this_')){
          enterIndex = 0;
        }else{
          enterIndex = activeIndex
        }
        if (enterIndex >= 0 && suggestions[enterIndex]) {
          acceptSuggestion(suggestions[enterIndex].label);
        } else {
          commit(rawValue);
        }
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
    <div className='absolute top-[0px] left-0 right-0 z-10 flex items-center gap-2 px-4 py-2 bg-white border-b shadow-sm'>
      <div className='flex rounded-md border border-gray-200 overflow-hidden text-sm'>
        {(["event", "cond"] as const).map((field) => (
          <button
            key={field}
            type='button'
            onClick={() => switchField(field)}
            className={`px-3 py-1.5 font-mono transition-colors ${
              editingField === field
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {field === "cond" ? "condition" : field}
          </button>
        ))}
      </div>
      <div className='relative flex-1'>
        <input
          type='text'
          value={
            activeIndex >= 0 && suggestions[activeIndex]
              ? editingField === "cond"
                ? buildCondValue(suggestions[activeIndex].label)
                : suggestions[activeIndex].label
              : rawValue
          }
          onChange={(e) => {
            setRawValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 100);
          }}
          className='w-full px-3 py-1.5 text-sm text-gray-800 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
          placeholder={
            editingField === "cond" ? "Enter condition" : "Enter event"
          }
        />
        {showSuggestions && (
          <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto'>
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.label}
                onMouseDown={() => acceptSuggestion(suggestion.label)}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                  suggestion.kind === "new-channel"
                    ? "bg-amber-50 text-amber-800 border-l-2 border-amber-400"
                    : index === activeIndex
                      ? "bg-blue-500 text-white"
                      : "hover:bg-blue-100 text-gray-800"
                }`}
              >
                {suggestion.kind === "new-channel" && (
                  <span className='text-xs text-amber-600'>(new channel)</span>
                )}

                {(suggestion.kind === 'channel' || suggestion.kind === 'event') && (() => {
                  const type = channels.find(c => c.name === suggestion.label)?.type ?? events.find(e => e.name === suggestion.label)?.type;
                  return type ? (
                    <span
                      className='text-xs px-1 py-0.5 rounded font-mono text-black'
                      style={{ backgroundColor: BADGE_COLORS[type] }}
                    >
                      {type}
                    </span>
                  ) : null;
                })()}
                <span>{suggestion.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => commit(rawValue)}
        title='Save'
        className='p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors'
      >
        <Save className='h-4 w-4' />
      </button>
      <button
        onClick={onCancel}
        title='Cancel'
        className='p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
};
