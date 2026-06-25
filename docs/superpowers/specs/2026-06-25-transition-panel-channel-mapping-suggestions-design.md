# Transition Panel — Channel Mapping Suggestions

**Date:** 2026-06-25  
**Status:** Approved

## Overview

When a user edits a transition in the `TransitionPanel`, the autocomplete dropdown should surface `scxmlRef` names from the `channelMappings` store as selectable suggestions. Each scxmlRef suggestion shows a type badge inherited from the mapped physical channel, and secondary muted text indicating which physical channel it maps to.

## Data & Types

Add `'mapped-channel'` to the `Suggestion` union in `transition-panel.tsx`:

```ts
type Suggestion = {
  label: string;
  kind: 'channel' | 'event' | 'variable' | 'new-channel' | 'mapped-channel';
};
```

Subscribe to `channelMappings` from the store alongside the existing `channels` and `events`:

```ts
const channelMappings = useHostAPIStore((state) => state.channelMappings);
```

## Suggestions Logic

Build a `scxmlRefSet` from `channelMappings` and extend the `kindOf` helper:

```
physical channel → 'channel'
scxmlRef         → 'mapped-channel'   ← new
event name       → 'event'
otherwise        → 'variable'
```

Appearance by selection mode:

| Mode | scxmlRefs included? |
|------|---------------------|
| `undecided` | Yes — part of the combined name pool |
| `cond` | Yes — part of the variables/channels pool |
| `event` | No — scxmlRefs are condition operands, not event names |

Filtering follows the same prefix/substring logic as all other suggestions.

## Badge

`renderBadge` for `'mapped-channel'`: resolve the chain `scxmlRef → mappedChannel → type` by looking up in the `channels` store. Render the same `BADGE_COLORS`-backed colored span used for all other typed suggestions. If the `mappedChannel` is not present in the `channels` store, render no badge (consistent with existing fallback behavior).

## Dropdown Item Rendering

For `'mapped-channel'` items, show secondary muted text `→ <mappedChannel>` to the right of the label so the user sees the full mapping at a glance:

```
[in]  SomeScxmlRef  → ArgonLine_bar
```

The secondary text uses the `text-muted` style, matching the `(new channel)` annotation pattern already in the dropdown.

## Selection Behavior

When a `'mapped-channel'` suggestion is accepted in `acceptSuggestion`:

- **`undecided` mode** — switch `selectionMode` to `'cond'` (same as `'channel'`, since scxmlRefs are condition operands)
- **`cond` mode** — use the existing `buildCondValue` logic to insert/replace the token
- **`event` mode** — not reachable (scxmlRefs are excluded from event suggestions)

## Files Changed

- `src/components/diagram/transition-panel.tsx` — only file that needs modification
