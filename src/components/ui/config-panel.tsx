'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import type { ConfigValue } from '@/types/host-api';
import { Panel, inputClass, FormActions, FooterAddButton, PanelEmptyState } from '@/components/ui/primitives';

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
  const [newOverride, setNewOverride] = useState('');
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
    const override = newOverride.trim();
    // Optimistically seed the override into entries so fetchOverrides preserves it
    // via localOverrideMap when it rebuilds after the SCXML update.
    if (override) {
      setEntries(prev => [...prev, { field: { name: trimmed, type: 'string' as const, defaultValue: newDefault.trim() }, override }]);
    }
    onAddField(trimmed, newDefault.trim());
    setNewName('');
    setNewDefault('');
    setNewOverride('');
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewName('');
    setNewDefault('');
    setNewOverride('');
    setIsAdding(false);
  };

  if (!isVisible) return null;

  return (
    <Panel
      title='Config Values'
      onClose={onClose}
      widthClass='w-[380px]'
      footer={
        !isAdding ? (
          <FooterAddButton onClick={() => setIsAdding(true)}>Add config</FooterAddButton>
        ) : undefined
      }
    >
      {entries.length === 0 && !isAdding ? (
        <PanelEmptyState>
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
        </PanelEmptyState>
      ) : (
        <ul className='divide-y divide-[var(--ui-border)]'>
          {entries.map(({ field, override }) => (
            <li key={field.name} className='px-3 py-2 hover:bg-muted'>
              <div className='flex items-center justify-between gap-2 mb-1.5'>
                <span className='font-medium text-default text-xs truncate' title={field.name}>
                  {field.name}
                </span>
                <span className='shrink-0 text-primary font-mono text-[10px]'>{field.type}</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>Data Model</span>
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
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>IO.Conf</span>
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
                  className={`${inputClass} min-w-0 flex-1`}
                />
              </div>
            </li>
          ))}

          {isAdding && (
            <li className='px-3 py-2 bg-primary-muted'>
              <div className='flex items-center gap-1 mb-1.5'>
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
                  className={`${inputClass} flex-1`}
                />
              </div>
              <div className='flex items-center gap-1.5 mb-1.5'>
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>Data Model</span>
                <input
                  type='text'
                  value={newDefault}
                  onChange={e => setNewDefault(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='default'
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className='text-[10px] text-dimmed whitespace-nowrap shrink-0'>IO.Conf</span>
                <input
                  type='text'
                  value={newOverride}
                  onChange={e => setNewOverride(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmAdd();
                    if (e.key === 'Escape') handleCancelAdd();
                  }}
                  placeholder='—'
                  className={`${inputClass} min-w-0 flex-1`}
                />
              </div>
              <FormActions
                onApply={handleConfirmAdd}
                onDiscard={handleCancelAdd}
                applyDisabled={!newName.trim()}
                className='justify-end mt-1.5'
              />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
