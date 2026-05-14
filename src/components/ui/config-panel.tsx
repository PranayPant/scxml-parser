'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { extractConfigFields, type ConfigField } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';

interface ConfigPanelProps {
  isVisible: boolean;
  onClose: () => void;
  scxmlContent: string;
  onAddField: (name: string, defaultValue: string) => void;
}

interface OverrideEntry {
  field: ConfigField;
  override: string;
}

export function ConfigPanel({ isVisible, onClose, scxmlContent, onAddField }: ConfigPanelProps) {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const { showFeedback } = useHostAPIStore();

  const fetchOverrides = useCallback(async (fields: ConfigField[]) => {
    if (fields.length === 0) {
      setEntries([]);
      return;
    }
    try {
      const res = await fetch('/scxml-editor/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { name: string; override: string | null }[] = await res.json();
      const overrideMap = Object.fromEntries(data.map(d => [d.name, d.override ?? '']));
      setEntries(fields.map(f => ({ field: f, override: overrideMap[f.name] ?? '' })));
    } catch {
      setEntries(fields.map(f => ({ field: f, override: '' })));
    }
  }, []);

  useEffect(() => {
    const fields = extractConfigFields(scxmlContent);
    fetchOverrides(fields);
  }, [scxmlContent, fetchOverrides]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body = Object.fromEntries(entries.map(e => [e.field.name, e.override]));
      const res = await fetch('/scxml-editor/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      showFeedback(data.message, res.ok ? 'info' : 'error');
    } catch (err) {
      showFeedback(`Failed to save config: ${err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

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
    <div className='w-80 flex flex-col border rounded-lg bg-white shadow-sm h-full overflow-hidden'>
      <div className='flex items-center justify-between px-3 py-2 border-b bg-gray-50'>
        <span className='text-sm font-semibold text-gray-700'>Config Values</span>
        <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
          <X className='h-4 w-4' />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        {entries.length === 0 && !isAdding ? (
          <div className='p-4 text-xs text-gray-500 space-y-2'>
            <p>No configurable fields found in this SCXML.</p>
            <p>
              Add a <code className='bg-gray-100 px-1 rounded'>conf_</code> prefix to any{' '}
              <code className='bg-gray-100 px-1 rounded'>&lt;data&gt;</code> field in the datamodel to make it
              configurable per deployment.
            </p>
            <p className='text-gray-400'>
              Example:{' '}
              <code className='bg-gray-100 px-1 rounded'>&lt;data expr="0.5" id="conf_threshold"/&gt;</code>
            </p>
          </div>
        ) : (
          <table className='w-full text-xs'>
            <thead>
              <tr className='bg-gray-50 border-b'>
                <th className='text-left px-3 py-2 text-gray-600 font-medium'>Field</th>
                <th className='text-left px-3 py-2 text-gray-600 font-medium w-14'>Type</th>
                <th className='text-left px-3 py-2 text-gray-600 font-medium'>Data Model</th>
                <th className='text-left px-3 py-2 text-gray-600 font-medium'>IO.Conf</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ field, override }) => (
                <tr key={field.name} className='border-b hover:bg-gray-50'>
                  <td className='px-3 py-2 font-medium text-gray-800'>{field.name}</td>
                  <td className='px-3 py-2'>
                    <span className='text-blue-600 font-mono'>{field.type}</span>
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='text'
                      value={field.defaultValue}
                      readOnly
                      className='w-full border rounded px-2 py-1 text-xs bg-gray-50 text-gray-500 cursor-default focus:outline-none'
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
                      className='w-full border text-gray-500 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'
                    />
                  </td>
                </tr>
              ))}
              {isAdding && (
                <tr className='border-b bg-blue-50'>
                  <td className='px-3 py-2' colSpan={2}>
                    <div className='flex items-center gap-1'>
                      <span className='text-gray-400 text-[10px] shrink-0'>conf_</span>
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
                        className='w-full border rounded px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400'
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
                      className='w-full border rounded px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400'
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex gap-1'>
                      <button
                        onClick={handleConfirmAdd}
                        disabled={!newName.trim()}
                        className='p-1 rounded text-green-600 hover:bg-green-100 disabled:opacity-30 disabled:cursor-not-allowed'
                      >
                        <Check className='h-3 w-3' />
                      </button>
                      <button onClick={handleCancelAdd} className='p-1 rounded text-gray-400 hover:bg-gray-100'>
                        <X className='h-3 w-3' />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

      </div>

      <div className='px-3 py-2 border-t bg-gray-50 flex gap-2'>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className='flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors'
          >
            <Plus className='h-3 w-3' />
            Add config
          </button>
        )}
        {entries.length > 0 && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className='flex-1 text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          >
            {isSaving ? 'Saving…' : 'Save & Restart'}
          </button>
        )}
      </div>
    </div>
  );
}
