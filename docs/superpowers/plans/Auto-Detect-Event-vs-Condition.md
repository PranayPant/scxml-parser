# Expression Builder UI: Auto-Detect Event vs Condition

## Context

The current transition edit bar requires users to manually toggle between "event" and "condition" modes via a switch button. The UX goal is to eliminate this switch and instead auto-detect the correct SCXML attribute (`event` or `cond`) based on what the user selects from the suggestion dropdown. Initially, both events and channels are shown together; the first selection determines the direction.

## File to Modify

**Single file:** `src/components/diagram/transition-edit-bar.tsx`

---

## Implementation Plan

### 1. Replace `editingField` state with `selectionMode`

```typescript
// REMOVE:
const [editingField, setEditingField] = React.useState<'event' | 'cond'>(
  event ? 'event' : 'cond'
);

// ADD:
const [selectionMode, setSelectionMode] = React.useState<'undecided' | 'event' | 'cond'>(
  event ? 'event' : cond ? 'cond' : 'undecided'
);
// Derive editingField so downstream commit logic is unchanged:
const editingField = selectionMode === 'event' ? 'event' : 'cond';
```

- `undecided`: no selection yet — show all events + all channels
- `event`: first pick was an event — show only events going forward
- `cond`: first pick was a channel/variable — show only condition items going forward

---

### 2. Update the `suggestions` memo

Replace the single `editingField`-based branch with three explicit branches:

```typescript
const suggestions: Suggestion[] = React.useMemo(() => {
  const vars = extractDatamodelVariables(scxmlContent);
  const channelSet = new Set(channels.map(c => c.name));
  const eventNames = events.map(e => e.name);
  const eventSet = new Set(eventNames);

  const kindOf = (item: string): Suggestion['kind'] =>
    channelSet.has(item) ? 'channel' : eventSet.has(item) ? 'event' : 'variable';

  if (selectionMode === 'event') {
    // Show only events — channels hidden after an event was chosen
    const prefix = rawValue.toLowerCase();
    return eventNames
      .filter(name => name.toLowerCase().includes(prefix))
      .map(name => ({ label: name, kind: 'event' as const }));
  }

  if (selectionMode === 'undecided') {
    // Show everything: events + channels + datamodel vars
    const allNames = Array.from(new Set([
      ...Array.from(vars), ...channels.map(c => c.name), ...eventNames
    ]));
    const prefix = rawValue.toLowerCase();
    const filtered = allNames.filter(item => item.toLowerCase().includes(prefix));
    if (filtered.length === 0 && rawValue.startsWith('this_')) {
      return [{ label: rawValue, kind: 'new-channel' }];
    }
    return filtered.map(item => ({ label: item, kind: kindOf(item) }));
  }

  // Cond mode — channels + vars only, token-aware (no events)
  const allNames = Array.from(new Set([...Array.from(vars), ...channels.map(c => c.name)]));
  const condKindOf = (item: string): Suggestion['kind'] =>
    channelSet.has(item) ? 'channel' : 'variable';

  const endsWithSpace = rawValue.endsWith(' ');
  const tokens = rawValue.trimEnd().split(/\s+/);
  const lastToken = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
  const prevToken = endsWithSpace ? (tokens[tokens.length - 1] ?? '') : (tokens[tokens.length - 2] ?? '');

  if (endsWithSpace) {
    if (OPERATOR_SET.has(prevToken)) {
      return allNames.map(item => ({ label: item, kind: condKindOf(item) }));
    }
    return OPERATORS.map(op => ({ label: op, kind: 'variable' as const }));
  }

  const prefix = lastToken.toLowerCase();
  const filtered = allNames.filter(item => item.toLowerCase().includes(prefix));
  if (filtered.length === 0 && lastToken.startsWith('this_')) {
    return [{ label: lastToken, kind: 'new-channel' }];
  }
  return filtered.map(item => ({ label: item, kind: condKindOf(item) }));
}, [rawValue, channels, events, scxmlContent, selectionMode]);
```

---

### 3. Update `acceptSuggestion` to take a full `Suggestion` and handle mode transitions

```typescript
const acceptSuggestion = (suggestion: Suggestion) => {
  if (selectionMode === 'undecided') {
    // First pick determines the mode
    if (suggestion.kind === 'event') {
      setSelectionMode('event');
    } else {
      // channel, variable, or new-channel → condition
      setSelectionMode('cond');
    }
    setRawValue(suggestion.label);
  } else if (selectionMode === 'cond') {
    setRawValue(buildCondValue(suggestion.label));
  } else {
    // event mode
    setRawValue(suggestion.label);
  }
  setIsOpen(false);
  setActiveIndex(-1);
};
```

---

### 4. Update all `acceptSuggestion` call sites

Three places in `handleKeyDown` + one `onMouseDown` in JSX — change from passing `suggestions[i].label` to `suggestions[i]`.

---

### 5. Remove `switchField` function

Delete it entirely — no longer used.

---

### 6. Remove the toggle button group from JSX

Delete the entire `<div className='flex rounded-md border...'>` block containing the "event" / "condition" buttons.

---

### 7. Update the input placeholder

```typescript
placeholder={
  selectionMode === 'event' ? 'Enter event' :
  selectionMode === 'cond' ? 'Enter condition' :
  'Search events and channels...'
}
```

---

## Behavior Summary

| Starting state | Dropdown shows | User picks event | User picks channel/var |
|---|---|---|---|
| New transition (no event/cond) | All events + all channels | → event mode, only events shown | → cond mode, only channels/vars shown |
| Existing event transition | Only events | Stays event mode | N/A |
| Existing cond transition | Only channels/vars | N/A | Stays cond mode |

If user types and saves without selecting from dropdown, `editingField` defaults to `'cond'`.

---

## Verification

1. Open the app and click a transition with no event/cond → edit bar opens, dropdown shows both events and channels.
2. Select an event from dropdown → rawValue set, dropdown now only shows events.
3. Close and reopen a fresh transition → select a channel → cond mode, only channels/vars shown, token-aware operator suggestions work.
4. Verify the toggle button is gone from the UI.
5. Verify existing transitions with `event` or `cond` pre-filled still open in the correct mode.
