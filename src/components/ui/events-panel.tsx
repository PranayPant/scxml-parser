'use client';

import React, { useState } from 'react';
import { Check, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { useHostAPIStore } from '@/stores/host-api-store';
import type { EventEntry } from '@/types/host-api';
import { SearchableSelect } from './searchable-select';
import { EVENT_FALLBACK_VALUE } from '@/lib/utils/common-utils';
import { Panel, inputClass } from '@/components/ui/primitives';

const UNITS = ['V', 'A', 'l/min', '% rh', 'g/m3', 'Hz', 'rpm', 'Vdc', 'Vac', 'ppm', 'Ohm', 'bar', 'mbar', '°C', 's', 'g/day', 'on/off', 'state'];

interface EventsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export function EventsPanel({ isVisible, onClose }: EventsPanelProps) {
  const events = useHostAPIStore(state => state.events);
  const setEvents = useHostAPIStore(state => state.setEvents);
  const [isAdding, setIsAdding] = useState<false | 'plain' | 'arg'>(false);
  const [newName, setNewName] = useState('');
  const [newDefaultValue, setNewDefaultValue] = useState('0');
  const [newMin, setNewMin] = useState('');
  const [newMax, setNewMax] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newHidden, setNewHidden] = useState(false);

  const update = (index: number, patch: Partial<EventEntry>) =>
    setEvents(events.map((e, i) => i === index ? { ...e, ...patch } : e));

  const handleDelete = (index: number) =>
    setEvents(events.filter((_, i) => i !== index));

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const hasArgument = isAdding === 'arg';
    setEvents([...events, {
      name: trimmed,
      type: EVENT_FALLBACK_VALUE,
      hasArgument,
      defaultValue: hasArgument ? newDefaultValue : undefined,
      min: hasArgument && newMin.trim() ? newMin.trim() : undefined,
      max: hasArgument && newMax.trim() ? newMax.trim() : undefined,
      unit: hasArgument && newUnit.trim() ? newUnit.trim() : undefined,
      hidden: newHidden || undefined,
    }]);
    resetForm();
  };

  const resetForm = () => {
    setNewName('');
    setNewDefaultValue('0');
    setNewMin('');
    setNewMax('');
    setNewUnit('');
    setNewHidden(false);
    setIsAdding(false);
  };

  const argInputClassExisting = `min-w-0 ${inputClass}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmAdd();
    if (e.key === 'Escape') resetForm();
  };

  if (!isVisible) return null;

  return (
    <Panel
      title='User Actions'
      onClose={onClose}
      footer={
        !isAdding ? (
          <div className='flex flex-col gap-1.5'>
            <button
              onClick={() => setIsAdding('plain')}
              className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
            >
              <Plus className='h-3 w-3' />
              Add user action
            </button>
            <button
              onClick={() => setIsAdding('arg')}
              className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
            >
              <Plus className='h-3 w-3' />
              Add user action with argument
            </button>
          </div>
        ) : undefined
      }
    >
      {events.length === 0 && !isAdding ? (
        <div className='p-4 text-xs text-muted space-y-2'>
          <p>No user actions defined. Add a user action to create a web UI button in the operate page.</p>
          <p>User actions with an argument add a value input next to the button.</p>
        </div>
      ) : (
        <ul className='divide-y divide-[var(--ui-border)]'>
          {events.map((event, index) => (
            <li key={index} className='px-3 py-2.5 hover:bg-muted group'>
              <div className='flex items-center gap-2'>
                <input
                  type='text'
                  value={event.name}
                  onChange={e => update(index, { name: e.target.value })}
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  onClick={() => update(index, { hidden: !event.hidden || undefined })}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    event.hidden
                      ? 'text-primary bg-primary-muted hover:bg-primary-muted'
                      : 'text-dimmed group-hover:text-muted hover:!text-default hover:bg-muted'
                  }`}
                  title={event.hidden ? 'Hidden from operators — click to show all' : 'Visible to all — click to hide from operators'}
                >
                  {event.hidden ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className='flex-shrink-0 p-1 rounded text-dimmed group-hover:text-muted hover:!text-error hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors'
                  title='Delete'
                >
                  <Trash2 className='h-3.5 w-3.5' />
                </button>
              </div>
              {event.hasArgument && (
                <div className='flex items-center gap-1.5 mt-1.5'>
                  <input
                    type='text'
                    value={event.defaultValue ?? '0'}
                    onChange={e => update(index, { defaultValue: e.target.value })}
                    placeholder='default'
                    className={`flex-1 ${argInputClassExisting}`}
                  />
                  <input
                    type='text'
                    value={event.min ?? ''}
                    onChange={e => update(index, { min: e.target.value || undefined })}
                    placeholder='min'
                    className={`flex-1 ${argInputClassExisting}`}
                  />
                  <input
                    type='text'
                    value={event.max ?? ''}
                    onChange={e => update(index, { max: e.target.value || undefined })}
                    placeholder='max'
                    className={`flex-1 ${argInputClassExisting}`}
                  />
                  <div className='flex-1'>
                    <SearchableSelect
                      value={event.unit ?? ''}
                      options={UNITS}
                      onChange={v => update(index, { unit: v || undefined })}
                      placeholder='?'
                    />
                  </div>
                </div>
              )}
            </li>
          ))}

          {isAdding && (
            <li className='px-3 py-2.5 bg-primary-muted'>
              <div className='flex items-center gap-2'>
                <input
                  autoFocus
                  type='text'
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder='user action name'
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type='button'
                  onClick={() => setNewHidden(h => !h)}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    newHidden
                      ? 'text-primary bg-primary-muted hover:bg-primary-muted'
                      : 'text-dimmed hover:text-muted hover:bg-muted'
                  }`}
                  title={newHidden ? 'Hidden from operators — click to show all' : 'Visible to all — click to hide from operators'}
                >
                  {newHidden ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                </button>
                <div className='flex gap-1 flex-shrink-0'>
                  <button
                    onClick={handleConfirmAdd}
                    disabled={!newName.trim()}
                    className='p-1 rounded text-success hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed'
                  >
                    <Check className='h-3.5 w-3.5' />
                  </button>
                  <button onClick={resetForm} className='p-1 rounded text-dimmed hover:bg-muted'>
                    <X className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>
              {isAdding === 'arg' && (
                <div className='flex items-center gap-1.5 mt-1.5'>
                  <input
                    type='text'
                    value={newDefaultValue}
                    onChange={e => setNewDefaultValue(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder='default'
                    className={`min-w-0 flex-1 ${inputClass}`}
                  />
                  <input
                    type='text'
                    value={newMin}
                    onChange={e => setNewMin(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder='min'
                    className={`min-w-0 flex-1 ${inputClass}`}
                  />
                  <input
                    type='text'
                    value={newMax}
                    onChange={e => setNewMax(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder='max'
                    className={`min-w-0 flex-1 ${inputClass}`}
                  />
                  <div className='flex-1'>
                    <SearchableSelect
                      value={newUnit}
                      options={UNITS}
                      onChange={v => setNewUnit(v)}
                      placeholder='?'
                    />
                  </div>
                </div>
              )}
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
