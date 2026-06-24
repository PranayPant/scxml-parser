'use client';

import React from 'react';
import { useHostAPIStore } from '@/stores/host-api-store';
import { extractDatamodelVariables } from '@/lib/utils/datamodel-extractor';
import { BADGE_COLORS } from '@/lib';
import { Panel } from '@/components/ui/primitives/panel';

type Suggestion = { label: string; kind: 'channel' | 'event' | 'variable' | 'new-channel' };

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<', '&&', '||'];
const OPERATOR_SET = new Set([...OPERATORS, '!']);

export interface TransitionApplyArgs {
  newValue: string;
  editingField: 'event' | 'cond';
  delay: { type: 'delay' | 'delayexpr'; value: string } | null;
  cancelSendId: string | null;
  originalEventName: string | undefined;
  originalCancelSendId: string | undefined;
}

interface TransitionPanelProps {
  edgeId: string;
  source: string;
  target: string;
  event?: string;
  cond?: string;
  scxmlContent: string;
  entryActions?: string[];
  exitActions?: string[];
  onApply: (args: TransitionApplyArgs) => void;
  onNewChannel?: (
    channelName: string,
    source: string,
    target: string,
    originalEvent: string | undefined,
    originalCond: string | undefined,
    editingField: 'event' | 'cond',
    edgeId: string
  ) => void;
  onClose: () => void;
}

export const TransitionPanel: React.FC<TransitionPanelProps> = ({
  edgeId,
  source,
  target,
  event,
  cond,
  scxmlContent,
  entryActions,
  exitActions,
  onApply,
  onNewChannel,
  onClose,
}) => {
  // ── event/cond search state (ported from TransitionEditBar) ──
  const [selectionMode, setSelectionMode] = React.useState<'undecided' | 'event' | 'cond'>(
    event ? 'event' : cond ? 'cond' : 'undecided'
  );
  const [rawValue, setRawValue] = React.useState(event ?? cond ?? '');
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── tab state ──
  const [activeTab, setActiveTab] = React.useState<'onentry' | 'onexit'>('onentry');

  // ── parse existing delay/cancel from source state's onentry/onexit ──
  // format: send|eventName|delayType|delayValue  and  cancel|sendId
  const initSendStr = event ? (entryActions ?? []).find((a) => a.startsWith(`send|${event}|`)) : undefined;
  const initSendParts = initSendStr ? initSendStr.split('|') : [];
  const initDelayType = (initSendParts[2] as 'delay' | 'delayexpr' | undefined) ?? 'delay';
  const initDelayRaw = initSendParts.slice(3).join('|');
  const initDelayUnit: 's' | 'ms' = initDelayType === 'delay' && initDelayRaw.endsWith('ms') ? 'ms' : 's';
  const initDelayNumber = initDelayType === 'delay'
    ? (initDelayRaw.endsWith('ms') ? initDelayRaw.slice(0, -2) : initDelayRaw.endsWith('s') ? initDelayRaw.slice(0, -1) : initDelayRaw)
    : '';
  const initDelayExpr = initDelayType === 'delayexpr' ? initDelayRaw : '';
  const initCancelStr = (exitActions ?? []).find((a) => a.startsWith('cancel|'));
  const initCancelId = initCancelStr ? (initCancelStr.split('|')[1] ?? '') : '';

  // ── onentry: delay fields ──
  const [delayType, setDelayType] = React.useState<'delay' | 'delayexpr'>(initDelayType);
  const [delayNumber, setDelayNumber] = React.useState(initDelayNumber);
  const [delayUnit, setDelayUnit] = React.useState<'s' | 'ms'>(initDelayUnit);
  const [delayExpr, setDelayExpr] = React.useState(initDelayExpr);

  // ── onexit: Send ID ──
  const [cancelSendId, setCancelSendId] = React.useState(initCancelId);
  const [sendIdOpen, setSendIdOpen] = React.useState(false);
  const [activeSendIdIndex, setActiveSendIdIndex] = React.useState(-1);
  const sendIdBlurRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingField: 'event' | 'cond' = selectionMode === 'event' ? 'event' : 'cond';

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
      if (sendIdBlurRef.current !== null) clearTimeout(sendIdBlurRef.current);
    };
  }, []);

  const channels = useHostAPIStore((state) => state.channels);
  const events = useHostAPIStore((state) => state.events);

  // ── main search suggestions ──
  const suggestions: Suggestion[] = React.useMemo(() => {
    const vars = extractDatamodelVariables(scxmlContent);
    const channelSet = new Set(channels.map((c) => c.name));
    const eventNames = events.map((e) => e.name);
    const eventSet = new Set(eventNames);
    const kindOf = (item: string): Suggestion['kind'] =>
      channelSet.has(item) ? 'channel' : eventSet.has(item) ? 'event' : 'variable';

    if (selectionMode === 'event') {
      const prefix = rawValue.toLowerCase();
      return eventNames
        .filter((n) => n.toLowerCase().includes(prefix))
        .map((n) => ({ label: n, kind: 'event' as const }));
    }

    if (selectionMode === 'undecided') {
      const allNames = Array.from(new Set([...Array.from(vars), ...channels.map((c) => c.name), ...eventNames]));
      const filtered = allNames.filter((i) => i.toLowerCase().includes(rawValue.toLowerCase()));
      if (filtered.length === 0 && rawValue.startsWith('this_')) return [{ label: rawValue, kind: 'new-channel' }];
      return filtered.map((i) => ({ label: i, kind: kindOf(i) }));
    }

    // cond mode
    const allNames = Array.from(new Set([...Array.from(vars), ...channels.map((c) => c.name)]));
    const condKindOf = (i: string): Suggestion['kind'] => channelSet.has(i) ? 'channel' : 'variable';
    const endsWithSpace = rawValue.endsWith(' ');
    const tokens = rawValue.trimEnd().split(/\s+/);
    const lastToken = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
    const prevToken = endsWithSpace ? (tokens[tokens.length - 1] ?? '') : (tokens[tokens.length - 2] ?? '');
    if (endsWithSpace) {
      if (OPERATOR_SET.has(prevToken)) return allNames.map((i) => ({ label: i, kind: condKindOf(i) }));
      return OPERATORS.map((op) => ({ label: op, kind: 'variable' as const }));
    }
    const filtered = allNames.filter((i) => i.toLowerCase().includes(lastToken.toLowerCase()));
    if (filtered.length === 0 && lastToken.startsWith('this_')) return [{ label: lastToken, kind: 'new-channel' }];
    return filtered.map((i) => ({ label: i, kind: condKindOf(i) }));
  }, [rawValue, channels, events, scxmlContent, selectionMode]);

  // ── Send ID suggestions: all event names used in <send> tags in the SCXML ──
  const sendEventNames = React.useMemo(() => {
    const matches = [...scxmlContent.matchAll(/<send[^>]+event="([^"]+)"/g)];
    return [...new Set(matches.map((m) => m[1]))];
  }, [scxmlContent]);

  const sendIdSuggestions = React.useMemo(() => {
    const prefix = cancelSendId.toLowerCase();
    if (!prefix) return sendEventNames;
    return sendEventNames.filter((n) => n.toLowerCase().includes(prefix));
  }, [cancelSendId, sendEventNames]);

  const buildCondValue = (label: string) => {
    const endsWithSpace = rawValue.endsWith(' ');
    if (endsWithSpace) return rawValue + label;
    const tokens = rawValue.split(/\s+/);
    tokens[tokens.length - 1] = label;
    return tokens.join(' ');
  };

  const acceptSuggestion = (s: Suggestion) => {
    if (selectionMode === 'undecided') {
      setSelectionMode(s.kind === 'event' ? 'event' : 'cond');
      setRawValue(s.label);
    } else if (selectionMode === 'cond') {
      setRawValue(buildCondValue(s.label));
    } else {
      setRawValue(s.label);
    }
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleApply = () => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const resolvedField: 'event' | 'cond' =
      selectionMode !== 'undecided' ? editingField :
      events.some((e) => e.name === trimmed) ? 'event' : 'cond';

    const isNewChannel = suggestions.length === 1 && suggestions[0].kind === 'new-channel';
    if (isNewChannel && onNewChannel) {
      onNewChannel(trimmed, source, target, event, cond, resolvedField, edgeId);
      return;
    }

    const hasDelay = resolvedField === 'event' && (
      delayType === 'delay' ? delayNumber.trim().length > 0 : delayExpr.trim().length > 0
    );
    const delayValue = delayType === 'delay' ? `${delayNumber}${delayUnit}` : delayExpr;
    const hasCancelId = resolvedField === 'event' && cancelSendId.trim().length > 0;

    onApply({
      newValue: trimmed,
      editingField: resolvedField,
      delay: hasDelay ? { type: delayType, value: delayValue } : null,
      cancelSendId: hasCancelId ? cancelSendId.trim() : null,
      originalEventName: event,
      originalCancelSendId: initCancelId || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showSuggestions = isOpen && suggestions.length > 0;
    if (showSuggestions) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((p) => p < suggestions.length - 1 ? p + 1 : 0); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((p) => p > 0 ? p - 1 : suggestions.length - 1); return; }
      if (e.key === 'Tab' && activeIndex >= 0) { e.preventDefault(); acceptSuggestion(suggestions[activeIndex]); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) acceptSuggestion(suggestions[activeIndex]);
        else if (suggestions[0]?.kind === 'new-channel') acceptSuggestion(suggestions[0]);
        else handleApply();
        return;
      }
      if (e.key === 'Escape') { setIsOpen(false); setActiveIndex(-1); return; }
    }
    if (e.key === 'Enter') { handleApply(); return; }
    if (e.key === 'Escape') { onClose(); return; }
  };

  const hintMessage = React.useMemo(() => {
    if (!isOpen || rawValue.length === 0 || selectionMode === 'event' || suggestions.length > 0) return null;
    return 'No match — type "this_" prefix to create a new channel';
  }, [isOpen, rawValue, selectionMode, suggestions]);

  const showSuggestions = isOpen && suggestions.length > 0;
  const showDropdown = showSuggestions || hintMessage !== null;

  const renderBadge = (s: Suggestion) => {
    if (s.kind !== 'channel' && s.kind !== 'event') return null;
    const type = channels.find((c) => c.name === s.label)?.type ?? events.find((ev) => ev.name === s.label)?.type;
    return type ? (
      <span className='text-xs px-1 py-0.5 rounded font-mono text-black' style={{ backgroundColor: BADGE_COLORS[type] }}>{type}</span>
    ) : null;
  };

  const footer = (
    <div className='flex gap-2'>
      <button onClick={handleApply} className='px-3 py-1.5 text-xs font-semibold bg-primary text-primary-fg rounded-md hover:opacity-90 transition-opacity'>Apply</button>
      <button onClick={onClose} className='px-3 py-1.5 text-xs border border-default text-muted rounded-md hover:text-default transition-colors'>Cancel</button>
    </div>
  );

  return (
    <Panel title='Transition' onClose={onClose} footer={footer}>
      {/* source → target */}
      <div className='flex items-center gap-1.5 px-3 py-1.5 border-b border-default text-[10px] text-muted'>
        <span className='border border-default rounded px-1.5 py-0.5 text-default'>{source}</span>
        <span>→</span>
        <span className='border border-default rounded px-1.5 py-0.5 text-default'>{target}</span>
      </div>

      <div className='px-3 py-2.5'>
        {/* Search input — always visible, same as original bar */}
        <div className='relative'>
          <input
            type='text'
            value={activeIndex >= 0 && suggestions[activeIndex]
              ? editingField === 'cond' ? buildCondValue(suggestions[activeIndex].label) : suggestions[activeIndex].label
              : rawValue}
            onChange={(e) => { const v = e.target.value; setRawValue(v); if (v === '') setSelectionMode('undecided'); setIsOpen(true); setActiveIndex(-1); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => { blurTimerRef.current = setTimeout(() => setIsOpen(false), 100); }}
            onKeyDown={handleKeyDown}
            placeholder={selectionMode === 'event' ? 'Enter event' : selectionMode === 'cond' ? 'Enter condition' : 'Search events and channels...'}
            className='w-full px-3 py-1.5 text-sm text-default bg-elevated border border-default rounded-md placeholder:text-dimmed focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
          />
          {showDropdown && (
            <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded-md shadow-lg max-h-48 overflow-y-auto'>
              {hintMessage && (
                <div className='px-3 py-2 text-xs text-dimmed italic select-none'>{hintMessage}</div>
              )}
              {suggestions.map((s, i) => (
                <div key={s.label} onMouseDown={() => acceptSuggestion(s)}
                  className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                    s.kind === 'new-channel' ? 'bg-amber-50 text-amber-800 border-l-2 border-amber-400'
                    : i === activeIndex ? 'bg-primary text-primary-fg' : 'hover:bg-primary-muted text-default'}`}>
                  {s.kind === 'new-channel' && <span className='text-xs text-amber-600'>(new channel)</span>}
                  {renderBadge(s)}
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* onentry/onexit tabs — only shown when an event is selected */}
        {selectionMode === 'event' && (
          <>
            <div className='flex border-b border-default -mx-3 mt-3 mb-3'>
              {(['onentry', 'onexit'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-default'}`}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'onentry' && (
              <div className='space-y-2'>
                <div>
                  <p className='text-[10px] text-muted mb-1'>Delay type</p>
                  <div className='flex gap-1'>
                    {(['delay', 'delayexpr'] as const).map((dt) => (
                      <button key={dt} onClick={() => setDelayType(dt)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${delayType === dt ? 'border-primary bg-primary text-primary-fg' : 'border-default text-muted hover:border-primary'}`}>
                        {dt}
                      </button>
                    ))}
                  </div>
                </div>
                {delayType === 'delay' ? (
                  <div>
                    <p className='text-[10px] text-muted mb-1'>Delay</p>
                    <div className='flex gap-1'>
                      <input type='number' min='0' step='1' value={delayNumber} onChange={(e) => setDelayNumber(e.target.value)} placeholder='e.g. 3'
                        className='flex-1 border border-default rounded px-2 py-1 text-xs text-default bg-elevated focus:outline-none focus:ring-1 focus:ring-primary' />
                      <select value={delayUnit} onChange={(e) => setDelayUnit(e.target.value as 's' | 'ms')} className='border border-default rounded px-2 py-1 text-xs text-default bg-elevated'>
                        <option value='s'>s</option>
                        <option value='ms'>ms</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className='text-[10px] text-muted mb-1'>Delay expression</p>
                    <input type='text' value={delayExpr} onChange={(e) => setDelayExpr(e.target.value)} placeholder='Math.floor(x * 1000)'
                      className='w-full border border-default rounded px-2 py-1 text-xs text-default bg-elevated focus:outline-none focus:ring-1 focus:ring-primary' />
                  </div>
                )}
                <p className='text-[10px] text-dimmed italic'>leave empty to skip</p>
              </div>
            )}

            {activeTab === 'onexit' && (
              <div className='relative'>
                <p className='text-[10px] text-muted mb-1'>Send ID</p>
                <input
                  type='text'
                  value={activeSendIdIndex >= 0 ? (sendIdSuggestions[activeSendIdIndex] ?? cancelSendId) : cancelSendId}
                  onChange={(e) => { setCancelSendId(e.target.value); setSendIdOpen(true); setActiveSendIdIndex(-1); }}
                  onFocus={() => setSendIdOpen(true)}
                  onBlur={() => { sendIdBlurRef.current = setTimeout(() => setSendIdOpen(false), 100); }}
                  onKeyDown={(e) => {
                    const show = sendIdOpen && sendIdSuggestions.length > 0;
                    if (show) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSendIdIndex((p) => p < sendIdSuggestions.length - 1 ? p + 1 : 0); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSendIdIndex((p) => p > 0 ? p - 1 : sendIdSuggestions.length - 1); return; }
                      if ((e.key === 'Tab' || e.key === 'Enter') && activeSendIdIndex >= 0) {
                        e.preventDefault();
                        setCancelSendId(sendIdSuggestions[activeSendIdIndex] ?? cancelSendId);
                        setSendIdOpen(false);
                        setActiveSendIdIndex(-1);
                        return;
                      }
                      if (e.key === 'Escape') { setSendIdOpen(false); setActiveSendIdIndex(-1); return; }
                    }
                  }}
                  placeholder='event name to cancel'
                  className='w-full border border-default rounded px-2 py-1 text-xs text-default bg-elevated focus:outline-none focus:ring-1 focus:ring-primary'
                />
                {sendIdOpen && sendIdSuggestions.length > 0 && (
                  <div className='absolute top-full left-0 right-0 mt-1 z-50 bg-elevated border border-default rounded-md shadow-lg max-h-36 overflow-y-auto'>
                    {sendIdSuggestions.map((name, i) => (
                      <div key={name} onMouseDown={() => { setCancelSendId(name); setSendIdOpen(false); setActiveSendIdIndex(-1); }}
                        className={`px-2 py-1 text-xs cursor-pointer font-mono ${i === activeSendIdIndex ? 'bg-primary text-primary-fg' : 'hover:bg-primary-muted text-default'}`}>
                        {name}
                      </div>
                    ))}
                  </div>
                )}
                <p className='text-[10px] text-dimmed italic mt-1'>leave empty to skip</p>
              </div>
            )}
          </>
        )}
      </div>

    </Panel>
  );
};
