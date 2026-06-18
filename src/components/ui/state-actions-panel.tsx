'use client';

import { BADGE_COLORS, EVENT_FALLBACK_VALUE } from '@/lib';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { useHostAPIStore } from '@/stores/host-api-store';
import { Plus, X } from 'lucide-react';
import React from 'react';
import { Panel, inputClass } from '@/components/ui/primitives';

interface AssignActionRow { type: 'assign'; location: string; expr: string; }
interface SendActionRow   { type: 'send'; event: string; delayType: 'delay' | 'delayexpr'; delayValue: string; }
interface CancelActionRow { type: 'cancel'; sendid: string; }
type ActionRow = AssignActionRow | SendActionRow | CancelActionRow;
type ActionType = 'assign' | 'send' | 'cancel';

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
  return rows.map((r): string | undefined => {
    if (r.type === 'assign') return (r.location && r.expr) ? `assign|${r.location}|${r.expr}` : undefined;
    if (r.type === 'send') return `send|${r.event}|${r.delayType}|${r.delayValue}`;
    if (r.type === 'cancel') return `cancel|${r.sendid}`;
  }).filter((s): s is string => s !== undefined);
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
  const [formActionType, setFormActionType] = React.useState<ActionType>('assign');
  const [formEvent, setFormEvent] = React.useState('');
  const [formLocation, setFormLocation] = React.useState('');
  const [formExpr, setFormExpr] = React.useState('');
  const [formSendId, setFormSendId] = React.useState('');
  const [formDelayType, setFormDelayType] = React.useState<'delay' | 'delayexpr'>('delay');
  const [formDelayValue, setFormDelayValue] = React.useState('');
  // for delay type: number + unit stored separately so we can render number input + unit dropdown
  const [formDelayNumber, setFormDelayNumber] = React.useState('');
  const [formDelayUnit, setFormDelayUnit] = React.useState<'s' | 'ms'>('s');

  // Autocomplete state — location field
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  // Autocomplete state — sendid field
  const [isSendIdOpen, setIsSendIdOpen] = React.useState(false);
  const [activeSendIdIndex, setActiveSendIdIndex] = React.useState(-1);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = useHostAPIStore((s) => s.channels);
  const dataVars = React.useMemo(
    () => extractDatamodelVariables(scxmlContent),
    [scxmlContent],
  );

  // All send event names in the SCXML — source for the cancel sendid autocomplete
  const sendEventNames = React.useMemo(() => {
    const matches = [...scxmlContent.matchAll(/<send[^>]+event="([^"]+)"/g)];
    return [...new Set(matches.map((m) => m[1]))];
  }, [scxmlContent]);

  // Filtered suggestions for cancel sendid field
  const sendIdSuggestions = React.useMemo(() => {
    const prefix = formSendId.toLowerCase();
    if (!prefix) return sendEventNames;
    return sendEventNames.filter((n) => n.toLowerCase().includes(prefix));
  }, [formSendId, sendEventNames]);

  const showSendIdSuggestions = isSendIdOpen && sendIdSuggestions.length > 0;

  const currentList = activeTab === 'onentry' ? localEntry : localExit;

  const resetForm = React.useCallback(() => {
    setFormMode('idle');
    setEditingRowIndex(null);
    setFormActionType('assign');
    setFormEvent('');
    setFormLocation('');
    setFormExpr('');
    setFormSendId('');
    setFormDelayType('delay');
    setFormDelayValue('');
    setFormDelayNumber('');
    setFormDelayUnit('s');
    setIsOpen(false);
    setActiveIndex(-1);
    setIsSendIdOpen(false);
    setActiveSendIdIndex(-1);
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

  const selectSendIdSuggestion = (name: string) => {
    setFormSendId(name);
    setIsSendIdOpen(false);
    setActiveSendIdIndex(-1);
  };

  const handleSendIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSendIdSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSendIdIndex((p) => (p < sendIdSuggestions.length - 1 ? p + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSendIdIndex((p) => (p > 0 ? p - 1 : sendIdSuggestions.length - 1));
        return;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && activeSendIdIndex >= 0) {
        e.preventDefault();
        selectSendIdSuggestion(sendIdSuggestions[activeSendIdIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setIsSendIdOpen(false);
        setActiveSendIdIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter') handleApply();
    if (e.key === 'Escape') resetForm();
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

    let newRow: ActionRow;
    if (formActionType === 'send') {
      const delayValue = formDelayType === 'delay'
        ? `${formDelayNumber}${formDelayUnit}`
        : formDelayValue;
      newRow = { type: 'send', event: formEvent, delayType: formDelayType, delayValue };
    } else if (formActionType === 'cancel') {
      newRow = { type: 'cancel', sendid: formSendId };
    } else {
      newRow = { type: 'assign', location: formLocation, expr: formExpr };
    }

    const updatedList: ActionRow[] = formMode === 'adding'
      ? [...currentList, newRow]
      : currentList.map((r, i) => (i === editingRowIndex ? newRow : r));

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
    setFormActionType(row.type);
    if (row.type === 'assign') {
      setFormLocation(row.location);
      setFormExpr(row.expr);
      setFormEvent('');
      setFormSendId('');
      setFormDelayType('delay');
      setFormDelayValue('');
    } else if (row.type === 'send') {
      setFormEvent(row.event);
      setFormDelayType(row.delayType);
      if (row.delayType === 'delay') {
        // Parse "3s" → num="3", unit="s";  "500ms" → num="500", unit="ms"
        if (row.delayValue.endsWith('ms')) {
          setFormDelayNumber(row.delayValue.slice(0, -2));
          setFormDelayUnit('ms');
        } else if (row.delayValue.endsWith('s')) {
          setFormDelayNumber(row.delayValue.slice(0, -1));
          setFormDelayUnit('s');
        } else {
          setFormDelayNumber(row.delayValue);
          setFormDelayUnit('s');
        }
        setFormDelayValue('');
      } else {
        setFormDelayValue(row.delayValue);
        setFormDelayNumber('');
        setFormDelayUnit('s');
      }
      setFormLocation('');
      setFormExpr('');
      setFormSendId('');
    } else if (row.type === 'cancel') {
      setFormSendId(row.sendid);
      setFormLocation('');
      setFormExpr('');
      setFormEvent('');
      setFormDelayType('delay');
      setFormDelayValue('');
    }
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
    setFormActionType(
      activeTab === 'onentry' ? 'send'
      : activeTab === 'onexit' ? 'cancel'
      : 'assign'
    );
    setFormEvent(activeTab === 'reactions' ? 'vector' : '');
    setFormLocation('');
    setFormExpr('');
    setFormSendId('');
    setFormDelayType('delay');
    setFormDelayValue('');
    setFormDelayNumber('');
    setFormDelayUnit('s');
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

  const isApplyDisabled =
    (activeTab === 'reactions' && (!formEvent || !formLocation || !formExpr)) ||
    (activeTab !== 'reactions' && formActionType === 'assign' && (!formLocation || !formExpr)) ||
    (activeTab !== 'reactions' && formActionType === 'send' && (
      !formEvent ||
      (formDelayType === 'delay' ? !formDelayNumber : !formDelayValue)
    )) ||
    (activeTab !== 'reactions' && formActionType === 'cancel' && !formSendId);

  // Inline form shared between expanded rows and the new-action form
  const inlineForm = (
    <div className='bg-primary-muted ring-1 ring-primary rounded p-2 space-y-1.5'>
      {/* Action type selector — onentry/onexit only */}
      {activeTab !== 'reactions' && (
        <div className='flex gap-1'>
          {(activeTab === 'onentry' ? (['assign', 'send'] as ActionType[]) : (['assign', 'cancel'] as ActionType[])).map((t) => (
            <button
              key={t}
              onClick={() => setFormActionType(t)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                formActionType === t
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-default text-muted hover:border-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* reactions: event field */}
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

      {/* assign fields (also used by reactions tab for location + expr) */}
      {(activeTab === 'reactions' || formActionType === 'assign') && (
        <>
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
        </>
      )}

      {/* send fields */}
      {formActionType === 'send' && activeTab !== 'reactions' && (
        <>
          <div>
            <label className='text-[10px] text-muted block mb-0.5'>Event</label>
            <input
              autoFocus
              type='text'
              value={formEvent}
              onChange={(e) => setFormEvent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApply();
                if (e.key === 'Escape') resetForm();
              }}
              placeholder='my_event_name'
              className={inputClass}
            />
          </div>
          <div>
            <label className='text-[10px] text-muted block mb-0.5'>Delay type</label>
            <div className='flex gap-1'>
              {(['delay', 'delayexpr'] as const).map((dt) => (
                <button
                  key={dt}
                  onClick={() => setFormDelayType(dt)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    formDelayType === dt
                      ? 'border-primary bg-primary text-primary-fg'
                      : 'border-default text-muted hover:border-primary'
                  }`}
                >
                  {dt}
                </button>
              ))}
            </div>
          </div>
          {formDelayType === 'delay' ? (
            <div>
              <label className='text-[10px] text-muted block mb-0.5'>Delay</label>
              <div className='flex gap-1'>
                <input
                  type='number'
                  min='0'
                  step='1'
                  value={formDelayNumber}
                  onChange={(e) => setFormDelayNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApply();
                    if (e.key === 'Escape') resetForm();
                  }}
                  placeholder='e.g. 3'
                  className='flex-1 border border-default rounded px-2 py-1 text-xs text-default bg-elevated placeholder:text-dimmed focus:outline-none focus:ring-1 focus:ring-primary'
                />
                <select
                  value={formDelayUnit}
                  onChange={(e) => setFormDelayUnit(e.target.value as 's' | 'ms')}
                  title='Use ms for fractional seconds (e.g. 3600ms = 3.6s)'
                  className='border border-default rounded px-2 py-1 text-xs text-default bg-elevated focus:outline-none focus:ring-1 focus:ring-primary'
                >
                  <option value='s'>s</option>
                  <option value='ms'>ms</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className='text-[10px] text-muted block mb-0.5'>Delay expression</label>
              <input
                type='text'
                value={formDelayValue}
                onChange={(e) => setFormDelayValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply();
                  if (e.key === 'Escape') resetForm();
                }}
                placeholder='Math.floor(x * 1000)'
                className={inputClass}
              />
            </div>
          )}
        </>
      )}

      {/* cancel fields */}
      {formActionType === 'cancel' && activeTab !== 'reactions' && (
        <div className='relative'>
          <label className='text-[10px] text-muted block mb-0.5'>Send ID</label>
          <input
            autoFocus
            type='text'
            value={activeSendIdIndex >= 0 ? sendIdSuggestions[activeSendIdIndex] : formSendId}
            onChange={(e) => {
              setFormSendId(e.target.value);
              setIsSendIdOpen(true);
              setActiveSendIdIndex(-1);
            }}
            onFocus={() => setIsSendIdOpen(true)}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => setIsSendIdOpen(false), 100);
            }}
            onKeyDown={handleSendIdKeyDown}
            placeholder='event name to cancel'
            className={inputClass}
          />
          {showSendIdSuggestions && (
            <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded shadow-lg max-h-36 overflow-y-auto'>
              {sendIdSuggestions.map((name, i) => (
                <div
                  key={name}
                  onMouseDown={() => selectSendIdSuggestion(name)}
                  className={`px-2 py-1 text-xs cursor-pointer font-mono ${
                    i === activeSendIdIndex
                      ? 'bg-primary text-primary-fg'
                      : 'hover:bg-primary-muted text-default'
                  }`}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          disabled={isApplyDisabled}
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
                      <span className='text-default'>{row.location || '…'}</span>
                      <span className='text-default'> = </span>
                      <span className='text-muted'>{row.expr || '…'}</span>
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
                  {row.type === 'assign' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-primary'>{row.location || '…'}</span>
                      <span className='text-dimmed'> = </span>
                      <span className='text-default'>{row.expr || '…'}</span>
                    </span>
                  )}
                  {row.type === 'send' && (
                    <span className='font-mono text-default flex flex-col min-w-0'>
                      <span className='text-primary truncate'>{row.event || '…'}</span>
                      <span className='text-dimmed text-[10px]'>{row.delayType}: {row.delayValue || '…'}</span>
                    </span>
                  )}
                  {row.type === 'cancel' && (
                    <span className='font-mono truncate text-default'>
                      <span className='text-dimmed'>cancel: </span>
                      <span className='text-primary'>{row.sendid || '…'}</span>
                    </span>
                  )}
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
