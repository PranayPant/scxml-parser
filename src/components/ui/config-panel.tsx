'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigValue } from '@/types/host-api';
import { Panel, inputClass } from '@/components/ui/primitives';

interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
  onFieldChange: (name: string, newDefaultValue: string) => void;
  onEntriesChange?: (values: ConfigValue[]) => void;
}

interface OverrideEntry {
  field: ConfigField;
  override: string;
}

export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField, onFieldChange, onEntriesChange }: ConfigPanelProps) {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const fetchOverrides = useCallback(async (fields: ConfigField[]) => {
    if (fields.length === 0) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch('/scxml-editor/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { name: string; override: string | null }[] = await res.json();
      const serverOverrideMap = Object.fromEntries(data.map(d => [d.name, d.override ?? '']));
      setEntries(prev => {
        const localOverrideMap = Object.fromEntries(prev.map(e => [e.field.name, e.override]));
        return fields.map(f => ({
          field: f,
          override: localOverrideMap[f.name] ?? serverOverrideMap[f.name] ?? '',
        }));
      });
    } catch {
      setEntries(prev => {
        const localOverrideMap = Object.fromEntries(prev.map(e => [e.field.name, e.override]));
        return fields.map(f => ({ field: f, override: localOverrideMap[f.name] ?? '' }));
      });
    }
  }, []);

  useEffect(() => {
    const fields = extractConfigFields(scxmlContent);
    fetchOverrides(fields);
  }, [scxmlContent, fetchOverrides]);

  useEffect(() => {
    onEntriesChange?.(entries.map(e => ({
      name: e.field.name,
      type: e.field.type,
      defaultValue: e.field.defaultValue,
      override: e.override,
    })));
  }, [entries, onEntriesChange]);

  const handleConfirmAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddField(trimmed, newDefault.trim());
    setNewName('');
    setNewDefault('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewName('');
    setNewDefault('');
    setIsAdding(false);
  };

  if (!isVisible) return null;

  return (
    <Panel
      title='Config Values'
      onClose={onClose}
      footer={
        !isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add config
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 && !isAdding ? (
        <div className='p-4 text-xs text-muted space-y-2'>
          <p>No configurable fields found in this SCXML.</p>
          <p>
            Add a <code className='bg-muted px-1 rounded'>conf_</code> prefix to any{' '}
            <code className='bg-muted px-1 rounded'>&lt;data&gt;</code> field in the datamodel to make it
            configurable per deployment.
          </p>
          <p className='text-dimmed'>
            Example:{' '}
            <code className='bg-muted px-1 rounded'>&lt;data expr="0.5" id="conf_threshold"/&gt;</code>
          </p>
        </div>
      ) : (
        <table className='w-full text-xs'>
          <thead>
            <tr className='bg-muted border-b border-default'>
              <th className='text-left px-3 py-2 text-muted font-medium'>Field</th>
              <th className='text-left px-3 py-2 text-muted font-medium w-14'>Type</th>
              <th className='text-left px-3 py-2 text-muted font-medium'>Data Model</th>
              <th className='text-left px-3 py-2 text-muted font-medium'>IO.Conf</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ field, override }) => (
              <tr key={field.name} className='border-b border-default hover:bg-muted'>
                <td className='px-3 py-2 font-medium text-default'>{field.name}</td>
                <td className='px-3 py-2'>
                  <span className='text-primary font-mono'>{field.type}</span>
                </td>
                <td className='px-3 py-2'>
                  <input
                    type='text'
                    value={field.defaultValue}
                    onChange={e => {
                      const newVal = e.target.value;
                      setEntries(prev =>
                        prev.map(en =>
                          en.field.name === field.name
                            ? { ...en, field: { ...en.field, defaultValue: newVal } }
                            : en,
                        ),
                      );
                    }}
                    onBlur={e => onFieldChange(field.name, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className={inputClass}
                  />
                </td>
                <td className='px-3 py-2'>
                  <input
                    type='text'
                    value={override}
                    placeholder='—'
                    onChange={e =>
                      setEntries(prev =>
                        prev.map(en =>
                          en.field.name === field.name ? { ...en, override: e.target.value } : en,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
            {isAdding && (
              <tr className='border-b border-default bg-primary-muted'>
                <td className='px-3 py-2' colSpan={2}>
                  <div className='flex items-center gap-1'>
                    <span className='text-dimmed text-[10px] shrink-0'>conf_</span>
                    <input
                      autoFocus
                      type='text'
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleConfirmAdd();
                        if (e.key === 'Escape') handleCancelAdd();
                      }}
                      placeholder='field_name'
                      className={inputClass}
                    />
                  </div>
                </td>
                <td className='px-3 py-2'>
                  <input
                    type='text'
                    value={newDefault}
                    onChange={e => setNewDefault(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmAdd();
                      if (e.key === 'Escape') handleCancelAdd();
                    }}
                    placeholder='default'
                    className={inputClass}
                  />
                </td>
                <td className='px-3 py-2'>
                  <div className='flex gap-1'>
                    <button
                      onClick={handleConfirmAdd}
                      disabled={!newName.trim()}
                      className='p-1 rounded text-success hover:bg-primary-muted disabled:opacity-30 disabled:cursor-not-allowed'
                    >
                      <Check className='h-3 w-3' />
                    </button>
                    <button onClick={handleCancelAdd} className='p-1 rounded text-dimmed hover:bg-muted'>
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
 