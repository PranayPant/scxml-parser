# Host Error Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `api.showErrors()` / `api.clearErrors()` to `ScxmlEditorAPI` and display host-pushed errors in a persistent "Host Alerts" tab inside the `ValidationPanel`.

**Architecture:** New `HostErrorItem` type and `hostErrors` state live in `host-api-store`. `showErrors()` appends items and signals `page.tsx` (via `requestedValidationTab`) to open the panel and switch tabs. `ValidationPanel` gains a two-tab layout — "Validation" for SCXML errors, "Host Alerts" for host errors. The pre-init stub in `layout.tsx` queues calls made before React hydrates.

**Tech Stack:** React 18, Zustand, TypeScript, Tailwind CSS, Next.js (static export)

---

## File Map

| File | Change |
|---|---|
| `src/types/host-api.ts` | Add `HostErrorItem`; add `showErrors`/`clearErrors` to `ScxmlEditorAPI` |
| `src/stores/host-api-store.ts` | Add `hostErrors`, `requestedValidationTab`, and four new actions |
| `src/components/ui/validation-panel.tsx` | Full rewrite: two-tab layout, Host Alerts tab |
| `src/app/layout.tsx` | Extend pre-init stub to queue `showErrors`/`clearErrors` |
| `src/app/page.tsx` | Wire real API; drain stub queue; `validationPanelTab` state; updated toolbar badge; updated ValidationPanel props |

---

## Task 1: Add `HostErrorItem` type and extend `ScxmlEditorAPI`

**Files:**
- Modify: `src/types/host-api.ts`

- [ ] **Step 1: Replace the contents of `src/types/host-api.ts` with the following**

```ts
// src/types/host-api.ts

export interface FeedbackItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface HostErrorItem {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface CommandOptions {
  id: string;
  label: string;
  tooltip?: string;
  icon?: string;
  order: number;
  run: () => void | Promise<void>;
}

export interface RegisteredCommand extends CommandOptions {
  isExecuting: boolean;
}

export interface ConfigValue {
  name: string;
  type: 'string' | 'double' | 'bool' | 'int';
  defaultValue: string;
  override: string;
}

export interface ChannelMapping {
  scxmlRef: string;
  mappedChannel: string;
}

export interface ScxmlEditorAPI {
  onReady: (callback: () => void) => void;
  loadScxml: (content: string) => void;
  getScxml: () => string;
  getConfigValues: () => ConfigValue[];
  registerCommand: (options: CommandOptions) => void;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
  setChannels: (channels: string[]) => void;
  toggleConfigPanel: () => void;
  getChannelMappings: () => ChannelMapping[];
  setChannelMappings: (mappings: ChannelMapping[]) => void;
  toggleChannelMappingPanel: () => void;
  setActiveTab: (tab: 'code' | 'visual') => void;
  /** Push one or more persistent errors into the Host Alerts tab. Panel opens automatically. */
  showErrors: (errors: Array<{ message: string; level?: 'info' | 'warning' | 'error' }>) => void;
  /** Remove all host errors from the Host Alerts tab. */
  clearErrors: () => void;
}

declare global {
  interface Window {
    ScxmlEditorAPI: ScxmlEditorAPI;
  }
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd D:\web-scxml-editor
npx tsc --noEmit
```

Expected: no errors (only type definitions changed, no logic yet).

---

## Task 2: Extend `host-api-store` with host error state and actions

**Files:**
- Modify: `src/stores/host-api-store.ts`

- [ ] **Step 1: Replace the contents of `src/stores/host-api-store.ts` with the following**

```ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ChannelMapping, CommandOptions, FeedbackItem, HostErrorItem, RegisteredCommand } from '@/types/host-api';

interface HostAPIState {
  commands: RegisteredCommand[];
  isReady: boolean;
  readyCallbacks: (() => void)[];
  feedbackQueue: FeedbackItem[];
  channels: string[];
  channelMappings: ChannelMapping[];
  requestedTab: 'code' | 'visual' | null;
  hostErrors: HostErrorItem[];
  requestedValidationTab: 'validation' | 'host-alerts' | null;
}

interface HostAPIActions {
  markReady: () => void;
  onReady: (callback: () => void) => void;
  registerCommand: (options: CommandOptions) => void;
  executeCommand: (id: string) => Promise<void>;
  showFeedback: (message: string, level?: FeedbackItem['level']) => void;
  dismissFeedback: (id: string) => void;
  setChannels: (channels: string[]) => void;
  setChannelMappings: (mappings: ChannelMapping[]) => void;
  updateChannelMapping: (scxmlRef: string, mappedChannel: string) => void;
  setRequestedTab: (tab: 'code' | 'visual' | null) => void;
  showErrors: (errors: Array<{ message: string; level?: HostErrorItem['level'] }>) => void;
  dismissHostError: (id: string) => void;
  clearHostErrors: () => void;
  setRequestedValidationTab: (tab: 'validation' | 'host-alerts' | null) => void;
}

export const useHostAPIStore = create<HostAPIState & HostAPIActions>((set, get) => ({
  commands: [],
  isReady: false,
  readyCallbacks: [],
  feedbackQueue: [],
  channels: [],
  channelMappings: [],
  requestedTab: null,
  hostErrors: [],
  requestedValidationTab: null,

  markReady: () => {
    const { readyCallbacks } = get();
    set({ isReady: true, readyCallbacks: [] });
    readyCallbacks.forEach(cb => cb());
  },

  onReady: (callback: () => void) => {
    if (get().isReady) {
      callback();
    } else {
      set(state => ({ readyCallbacks: [...state.readyCallbacks, callback] }));
    }
  },

  registerCommand: (options: CommandOptions) => {
    const { commands } = get();
    const exists = commands.some(c => c.id === options.id);
    if (exists) {
      console.warn(`Command with id "${options.id}" already exists, replacing.`);
    }
    const command: RegisteredCommand = { ...options, isExecuting: false };
    const updated = exists
      ? commands.map(c => c.id === options.id ? command : c)
      : [...commands, command];
    set({ commands: updated.sort((a, b) => a.order - b.order) });
  },

  executeCommand: async (id: string) => {
    const { commands, showFeedback } = get();
    const command = commands.find(c => c.id === id);
    if (!command) return;

    set(state => ({
      commands: state.commands.map(c =>
        c.id === id ? { ...c, isExecuting: true } : c
      ),
    }));

    try {
      await command.run();
    } catch (error) {
      console.error(`Command "${id}" failed:`, error);
      showFeedback(`Command failed: ${(error as Error).message}`, 'error');
    } finally {
      set(state => ({
        commands: state.commands.map(c =>
          c.id === id ? { ...c, isExecuting: false } : c
        ),
      }));
    }
  },

  showFeedback: (message: string, level: FeedbackItem['level'] = 'info') => {
    const item: FeedbackItem = { id: uuidv4(), message, level };
    set(state => ({ feedbackQueue: [...state.feedbackQueue, item] }));
    setTimeout(() => get().dismissFeedback(item.id), 4000);
  },

  dismissFeedback: (id: string) => {
    set(state => ({
      feedbackQueue: state.feedbackQueue.filter(f => f.id !== id),
    }));
  },

  setChannels: (channels: string[]) => set({ channels }),

  setChannelMappings: (mappings: ChannelMapping[]) => set({ channelMappings: mappings }),

  setRequestedTab: (tab) => set({ requestedTab: tab }),

  updateChannelMapping: (scxmlRef: string, mappedChannel: string) =>
    set(state => {
      if (!mappedChannel) {
        return { channelMappings: state.channelMappings.filter(m => m.scxmlRef !== scxmlRef) };
      }
      const exists = state.channelMappings.some(m => m.scxmlRef === scxmlRef);
      if (exists) {
        return { channelMappings: state.channelMappings.map(m => m.scxmlRef === scxmlRef ? { scxmlRef, mappedChannel } : m) };
      }
      return { channelMappings: [...state.channelMappings, { scxmlRef, mappedChannel }] };
    }),

  showErrors: (errors) => {
    const items: HostErrorItem[] = errors.map(e => ({
      id: uuidv4(),
      message: e.message,
      level: e.level ?? 'error',
    }));
    set(state => ({
      hostErrors: [...state.hostErrors, ...items],
      requestedValidationTab: 'host-alerts',
    }));
  },

  dismissHostError: (id: string) => {
    set(state => ({
      hostErrors: state.hostErrors.filter(e => e.id !== id),
    }));
  },

  clearHostErrors: () => set({ hostErrors: [] }),

  setRequestedValidationTab: (tab) => set({ requestedValidationTab: tab }),
}));
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:\web-scxml-editor
npx tsc --noEmit
```

Expected: no errors.

---

## Task 3: Rewrite `ValidationPanel` with two-tab layout

**Files:**
- Modify: `src/components/ui/validation-panel.tsx`

- [ ] **Step 1: Replace the entire file with the following**

```tsx
'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import type { ValidationError } from '@/types/common';
import type { HostErrorItem } from '@/types/host-api';

interface ValidationPanelProps {
  errors: ValidationError[];
  hostErrors: HostErrorItem[];
  isVisible: boolean;
  activeTab: 'validation' | 'host-alerts';
  onClose: () => void;
  onTabChange: (tab: 'validation' | 'host-alerts') => void;
  onErrorClick?: (error: ValidationError) => void;
  onDismissHostError: (id: string) => void;
  onClearHostErrors: () => void;
}

export function ValidationPanel({
  errors,
  hostErrors,
  isVisible,
  activeTab,
  onClose,
  onTabChange,
  onErrorClick,
  onDismissHostError,
  onClearHostErrors,
}: ValidationPanelProps) {
  if (!isVisible) return null;

  const scxmlCount = errors.length;
  const hostCount = hostErrors.length;

  return (
    <div className='bg-white border rounded-lg shadow-sm'>
      <div className='flex items-center justify-between px-4 pt-4 pb-0'>
        <h3 className='font-medium text-gray-900'>Errors</h3>
        <button
          onClick={onClose}
          className='text-gray-400 hover:text-gray-600 transition-colors'
        >
          <X className='h-5 w-5' />
        </button>
      </div>

      {/* Tab bar */}
      <div className='flex border-b mt-3'>
        <button
          onClick={() => onTabChange('validation')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'validation'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Validation ({scxmlCount})
        </button>
        <button
          onClick={() => onTabChange('host-alerts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'host-alerts'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Host Alerts ({hostCount})
        </button>
      </div>

      <div className='p-4'>
        {activeTab === 'validation' ? (
          <ValidationTab errors={errors} onErrorClick={onErrorClick} />
        ) : (
          <HostAlertsTab
            hostErrors={hostErrors}
            onDismiss={onDismissHostError}
            onClearAll={onClearHostErrors}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation tab
// ---------------------------------------------------------------------------

interface ValidationTabProps {
  errors: ValidationError[];
  onErrorClick?: (error: ValidationError) => void;
}

function ValidationTab({ errors, onErrorClick }: ValidationTabProps) {
  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;
  const sortedErrors = [...errors].sort((a, b) => {
    if (a.severity === 'error' && b.severity === 'warning') return -1;
    if (a.severity === 'warning' && b.severity === 'error') return 1;
    return 0;
  });

  if (errors.length === 0) {
    return (
      <div className='flex items-center text-green-600'>
        <CheckCircle className='h-5 w-5 mr-2' />
        <span>No validation issues found</span>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center space-x-4 text-sm'>
        {errorCount > 0 && (
          <div className='flex items-center text-red-600'>
            <AlertCircle className='h-4 w-4 mr-1' />
            <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {warningCount > 0 && (
          <div className='flex items-center text-yellow-600'>
            <AlertTriangle className='h-4 w-4 mr-1' />
            <span>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <div className='space-y-2 max-h-96 overflow-y-auto'>
        {sortedErrors.map((error, index) => (
          <ValidationErrorItem key={index} error={error} onClick={onErrorClick} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host Alerts tab
// ---------------------------------------------------------------------------

interface HostAlertsTabProps {
  hostErrors: HostErrorItem[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

function HostAlertsTab({ hostErrors, onDismiss, onClearAll }: HostAlertsTabProps) {
  if (hostErrors.length === 0) {
    return (
      <div className='flex items-center text-green-600'>
        <CheckCircle className='h-5 w-5 mr-2' />
        <span>No host alerts</span>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex justify-end'>
        <button
          onClick={onClearAll}
          className='text-xs text-gray-500 hover:text-gray-700 transition-colors'
        >
          Clear all
        </button>
      </div>
      <div className='space-y-2 max-h-96 overflow-y-auto'>
        {hostErrors.map(item => (
          <HostErrorCard key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HostErrorCard
// ---------------------------------------------------------------------------

interface HostErrorCardProps {
  item: HostErrorItem;
  onDismiss: (id: string) => void;
}

function HostErrorCard({ item, onDismiss }: HostErrorCardProps) {
  const isError = item.level === 'error';
  const isWarning = item.level === 'warning';

  const containerClass = isError
    ? 'bg-red-50 border-red-200'
    : isWarning
      ? 'bg-yellow-50 border-yellow-200'
      : 'bg-blue-50 border-blue-200';

  const textClass = isError ? 'text-red-800' : isWarning ? 'text-yellow-800' : 'text-blue-800';
  const iconClass = isError ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-blue-400';
  const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : Info;

  return (
    <div className={`p-3 rounded-md border ${containerClass} flex items-start`}>
      <Icon className={`h-5 w-5 flex-shrink-0 ${iconClass}`} />
      <p className={`ml-3 flex-1 text-sm font-medium break-words ${textClass}`}>
        {item.message}
      </p>
      <button
        onClick={() => onDismiss(item.id)}
        className='ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors'
        aria-label='Dismiss'
      >
        <X className='h-4 w-4' />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValidationErrorItem (unchanged from original)
// ---------------------------------------------------------------------------

interface ValidationErrorItemProps {
  error: ValidationError;
  onClick?: (error: ValidationError) => void;
}

function ValidationErrorItem({ error, onClick }: ValidationErrorItemProps) {
  const isError = error.severity === 'error';
  const hasLocation = error.line && error.column;
  const isClickable = onClick && hasLocation;

  return (
    <div
      className={`p-3 rounded-md border ${
        isError ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
      } ${
        isClickable
          ? 'cursor-pointer hover:shadow-md transition-shadow hover:bg-opacity-80'
          : ''
      }`}
      onClick={isClickable ? () => onClick(error) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(error);
              }
            }
          : undefined
      }
    >
      <div className='flex items-start'>
        <div className='flex-shrink-0'>
          {isError ? (
            <AlertCircle className='h-5 w-5 text-red-400' />
          ) : (
            <AlertTriangle className='h-5 w-5 text-yellow-400' />
          )}
        </div>
        <div className='ml-3 flex-1 min-w-0'>
          <p className={`text-sm font-medium break-words ${isError ? 'text-red-800' : 'text-yellow-800'}`}>
            {error.message}
          </p>
          {(error.line || error.column) && (
            <p className={`text-xs mt-1 flex items-center ${isError ? 'text-red-600' : 'text-yellow-600'}`}>
              <span>Line {error.line || '?'}, Column {error.column || '?'}</span>
              {isClickable && (
                <span className={`ml-2 text-xs ${isError ? 'text-red-500' : 'text-yellow-500'}`}>
                  (click to navigate)
                </span>
              )}
            </p>
          )}
          {error.code && (
            <p className={`text-xs mt-1 font-mono ${isError ? 'text-red-500' : 'text-yellow-500'}`}>
              Code: {error.code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:\web-scxml-editor
npx tsc --noEmit
```

Expected: errors about `ValidationPanel` missing new required props — that is expected because `page.tsx` hasn't been updated yet. The important thing is there are no errors *within* `validation-panel.tsx` itself (type errors in other files referencing old props are fine at this stage).

---

## Task 4: Extend pre-init stub in `layout.tsx`

**Files:**
- Modify: `src/app/layout.tsx`

The stub queues calls made by the host before React hydrates. It needs to queue `showErrors` and `clearErrors` so they aren't silently dropped.

- [ ] **Step 1: Replace the `<script dangerouslySetInnerHTML>` block in `src/app/layout.tsx`**

Find this block (around line 33):
```tsx
<script dangerouslySetInnerHTML={{ __html: `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],feedback:[]};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.feedback.push([m,l]);},
    setChannels:function(c){q.channels=c;},
    loadScxml:function(){},
    getScxml:function(){return'';},
    toggleConfigPanel:function(){},
    setActiveTab:function(){}
  };
})();` }} />
```

Replace it with:
```tsx
<script dangerouslySetInnerHTML={{ __html: `(function(){
  if(window.ScxmlEditorAPI)return;
  var q={ready:[],commands:[],feedback:[],hostErrors:[],clearErrorsCalled:false};
  window.ScxmlEditorAPI={
    _q:q,
    onReady:function(cb){q.ready.push(cb);},
    registerCommand:function(o){q.commands.push(o);},
    showFeedback:function(m,l){q.feedback.push([m,l]);},
    setChannels:function(c){q.channels=c;},
    loadScxml:function(){},
    getScxml:function(){return'';},
    toggleConfigPanel:function(){},
    setActiveTab:function(){},
    showErrors:function(errors){errors.forEach(function(e){q.hostErrors.push(e);});},
    clearErrors:function(){q.clearErrorsCalled=true;q.hostErrors=[];}
  };
})();` }} />
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd D:\web-scxml-editor
npx tsc --noEmit
```

Expected: same errors as before (still about `page.tsx` needing to be updated).

---

## Task 5: Wire new API in `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

This task has several sub-steps. Make each change carefully — the file is large.

- [ ] **Step 1: Add `validationPanelTab` state and import new store actions**

Find the line that reads:
```tsx
const { markReady, onReady, registerCommand, showFeedback } = useHostAPIStore();
```

Replace it with:
```tsx
const {
  markReady, onReady, registerCommand, showFeedback,
  hostErrors, requestedValidationTab, setRequestedValidationTab,
  dismissHostError, clearHostErrors,
} = useHostAPIStore();
```

Then find the block of `React.useState` calls (around line 51-55):
```tsx
const [isInitialLoading, setIsInitialLoading] = React.useState(true);
const [isUpdatingFromHistory, setIsUpdatingFromHistory] = React.useState(false);
const [currentHistoryActionType, setCurrentHistoryActionType] = React.useState<ActionType | undefined>(undefined);
const [isConfigPanelVisible, setConfigPanelVisible] = React.useState(false);
const [isChannelMappingPanelVisible, setChannelMappingPanelVisible] = React.useState(false);
```

Add one more state after those:
```tsx
const [validationPanelTab, setValidationPanelTab] = React.useState<'validation' | 'host-alerts'>('validation');
```

- [ ] **Step 2: Add the `requestedValidationTab` effect**

Find the existing effect that watches `requestedTab` (the one in `TwoTabLayout` — but this effect belongs in `page.tsx`). Add this new effect right after the `useEffect` block for history initialization (around line 103):

```tsx
useEffect(() => {
  if (requestedValidationTab !== null) {
    setValidationPanelTab(requestedValidationTab);
    setValidationPanelVisible(true);
    setConfigPanelVisible(false);
    setRequestedValidationTab(null);
  }
}, [requestedValidationTab]);
```

- [ ] **Step 3: Add `showErrors` and `clearErrors` to the real API and stub drain**

Find the `realApi` object definition (around line 292). Add two new entries at the end of the object, before the closing `};`:

```tsx
showErrors: (errors) => useHostAPIStore.getState().showErrors(errors),
clearErrors: () => useHostAPIStore.getState().clearHostErrors(),
```

Then find the stub drain block (the `if (stub?._q)` block). The `queue` type assertion currently reads:
```tsx
const queue = stub._q as { ready: (() => void)[]; commands: any[]; feedback: [string, any][]; channels?: string[]; channelMappings?: ChannelMapping[] };
```

Replace it with:
```tsx
const queue = stub._q as {
  ready: (() => void)[];
  commands: any[];
  feedback: [string, any][];
  channels?: string[];
  channelMappings?: ChannelMapping[];
  hostErrors?: Array<{ message: string; level?: string }>;
  clearErrorsCalled?: boolean;
};
```

Then at the end of the drain block, after the existing `if (queue.channelMappings)` line, add:
```tsx
if (queue.clearErrorsCalled) useHostAPIStore.getState().clearHostErrors();
if (queue.hostErrors?.length) useHostAPIStore.getState().showErrors(queue.hostErrors);
```

- [ ] **Step 4: Update the toolbar badge to include host error counts**

Find these two lines (around line 346-347):
```tsx
const hasErrors = errors.filter((e) => e.severity === 'error').length > 0;
const hasWarnings = errors.filter((e) => e.severity === 'warning').length > 0;
```

Replace them with:
```tsx
const scxmlErrorCount = errors.filter(e => e.severity === 'error').length;
const scxmlWarnCount = errors.filter(e => e.severity === 'warning').length;
const hostErrorCount = hostErrors.filter(e => e.level === 'error').length;
const hostWarnCount = hostErrors.filter(e => e.level === 'warning').length;
const totalErrors = scxmlErrorCount + hostErrorCount;
const totalWarnings = scxmlWarnCount + hostWarnCount;
const hasErrors = totalErrors > 0;
const hasWarnings = totalWarnings > 0;
```

- [ ] **Step 5: Update the toolbar button label and click handler**

Find the toolbar button that currently renders the "Valid / N errors, N warnings" label. It has an `onClick` like:
```tsx
onClick={() => {
  if (activeTab === "visual") setActiveTab("code");
  const opening = !isValidationPanelVisible;
  setValidationPanelVisible(opening);
  if (opening) setConfigPanelVisible(false);
}}
```

Replace it with:
```tsx
onClick={() => {
  if (activeTab === "visual") setActiveTab("code");
  const opening = !isValidationPanelVisible;
  setValidationPanelVisible(opening);
  if (!opening) setValidationPanelTab('validation');
  if (opening) { setConfigPanelVisible(false); setChannelMappingPanelVisible(false); }
}}
```

Then find the button's label, which currently reads:
```tsx
{errors.length === 0
  ? "Valid"
  : `${errors.filter((e) => e.severity === "error").length} errors, ${
      errors.filter((e) => e.severity === "warning").length
    } warnings`}
```

Replace it with:
```tsx
{totalErrors === 0 && totalWarnings === 0
  ? "Valid"
  : `${totalErrors} error${totalErrors !== 1 ? 's' : ''}, ${totalWarnings} warning${totalWarnings !== 1 ? 's' : ''}`}
```

- [ ] **Step 6: Update both `ValidationPanel` usages with new props**

There are two places where `<ValidationPanel>` is rendered: inside `renderCodeEditor()` and inside `renderVisualDiagram()`.

**In `renderCodeEditor()`**, find:
```tsx
<ValidationPanel
  errors={errors}
  isVisible={isValidationPanelVisible}
  onClose={() => setValidationPanelVisible(false)}
  onErrorClick={handleErrorClick}
/>
```

Replace with:
```tsx
<ValidationPanel
  errors={errors}
  hostErrors={hostErrors}
  isVisible={isValidationPanelVisible}
  activeTab={validationPanelTab}
  onTabChange={setValidationPanelTab}
  onClose={() => { setValidationPanelVisible(false); setValidationPanelTab('validation'); }}
  onErrorClick={handleErrorClick}
  onDismissHostError={dismissHostError}
  onClearHostErrors={clearHostErrors}
/>
```

**In `renderVisualDiagram()`**, find:
```tsx
{renderSidePanels()}
```

`renderSidePanels()` renders `<ConfigPanel>` and `<ChannelMappingPanel>`. The `ValidationPanel` in the visual diagram view is rendered differently — it's part of `renderCodeEditor()` only (the visual diagram doesn't show the validation panel). Confirm this by checking `renderVisualDiagram()` in `page.tsx`: it calls `renderSidePanels()` which only contains `ConfigPanel` and `ChannelMappingPanel`. No change needed there.

- [ ] **Step 7: Verify TypeScript — expect clean output**

```bash
cd D:\web-scxml-editor
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run lint**

```bash
cd D:\web-scxml-editor
npm run lint
```

Expected: no new lint errors.

---

## Task 6: Build and manual test

- [ ] **Step 1: Build the project**

```bash
cd D:\web-scxml-editor
npm run build
```

Expected: build completes with no TypeScript errors. The `out/` folder is regenerated.

- [ ] **Step 2: Deploy to LoopControl**

```bash
cd D:\web-scxml-editor
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

- [ ] **Step 3: Open the SCXML Editor in a browser and open the browser console**

Navigate to the SCXML editor page in LoopControl.

- [ ] **Step 4: Test `showErrors` from the console**

In the browser console, run:
```js
window.ScxmlEditorAPI.showErrors([
  { message: 'Something went wrong on the host', level: 'error' },
  { message: 'A warning from the system', level: 'warning' },
  { message: 'Info: system restarted', level: 'info' },
]);
```

Expected:
- The ValidationPanel slides open automatically
- The "Host Alerts" tab is active and shows 3 items (red, yellow, blue)
- The toolbar button turns red and reads "1 error, 1 warning"

- [ ] **Step 5: Test per-item dismiss**

Click the ✕ button on one of the host error cards.

Expected: that card is removed from the list. The others remain.

- [ ] **Step 6: Test "Clear all"**

Click the "Clear all" button in the Host Alerts tab.

Expected: all host error cards are removed. The tab shows "No host alerts". The toolbar button updates its count.

- [ ] **Step 7: Test tab switching**

Click the "Validation" tab while the panel is open.

Expected: switches to the SCXML validation errors tab. Click "Host Alerts" — switches back.

- [ ] **Step 8: Test panel close resets tab**

Close the panel by clicking ✕. Reopen it by clicking the toolbar button.

Expected: the panel opens on the "Validation" tab (tab is reset on close).

- [ ] **Step 9: Test `clearErrors` from the console**

```js
window.ScxmlEditorAPI.showErrors([{ message: 'Error A', level: 'error' }]);
window.ScxmlEditorAPI.clearErrors();
```

Expected: panel opens briefly to "Host Alerts" then has no items (clear ran synchronously after show; since `showErrors` triggers `requestedValidationTab`, the tab switches even though the list is empty — this is acceptable behaviour).

- [ ] **Step 10: Test stub queuing (pre-hydration calls)**

This can be verified by adding a call to `showErrors` in `scxml-editor-content.html` *before* the `frame.addEventListener('load', ...)` fires, then confirming the errors appear after load. Alternatively, inspect the stub by checking `window.ScxmlEditorAPI._q` before the React app mounts — it should not exist after mount (it is deleted during draining).

---

## Self-Review Notes

- **Spec coverage**: All spec requirements implemented — `HostErrorItem` type ✓, `showErrors` appends ✓, `clearErrors` wipes ✓, two-tab ValidationPanel ✓, auto-open + auto-switch on `showErrors` ✓, tab resets on close ✓, toolbar badge combines counts ✓, stub queuing ✓.
- **Type consistency**: `HostErrorItem` defined in Task 1, used in Tasks 2, 3, 5 — all matching.
- **`dismissHostError` / `clearHostErrors`** defined in Task 2, wired in Task 5, consumed in Task 3 — consistent naming throughout.
- **`requestedValidationTab`** set in `showErrors` (Task 2), drained in `useEffect` in `page.tsx` (Task 5), cleared via `setRequestedValidationTab(null)` — same pattern as `requestedTab` in `TwoTabLayout`.
