# Channel Mapping Panel — Create New Mapping

**Date:** 2026-06-30  
**Status:** Approved

## Goal

Allow users to create a completely new SCXML ref + physical channel mapping entry directly from the Channel Mapping Panel. The new ref must appear in the transition panel's condition/expression autocomplete dropdown so it can be used without first writing it into the SCXML.

## Background

The transition panel autocomplete already includes `channelMappings.map(m => m.scxmlRef)` in its suggestion list. Any entry added to the `channelMappings` store is immediately available as an autocomplete suggestion — no changes needed to the transition panel.

The channel mapping panel currently only shows auto-detected "unresolved refs" (variables found in SCXML expressions that are not declared in the datamodel and are not known physical channels). There is no way to add a ref that does not already exist in the SCXML.

## Approach

**Unified table, inference-based** — one table showing both auto-detected rows and manually-created rows. "Manual" is inferred: any entry in `channelMappings` whose `scxmlRef` is not in the current `unresolvedRefs` list is treated as a manual row.

No store changes needed. The existing `updateChannelMapping(scxmlRef, mappedChannel)` handles add/update, and calling it with `mappedChannel = ''` already removes the entry.

## Data

```
manualRows = channelMappings.filter(m => !unresolvedRefs.includes(m.scxmlRef))
```

This is computed locally in the component. The store and `ChannelMapping` type are untouched.

## Table Structure

**Row ordering:** auto-detected rows first (alphabetical, as today), then manual rows (alphabetical by ref name).

| Column | Auto-detected row | Manual row |
|--------|-------------------|------------|
| Left   | ref name, read-only monospace | ref name, read-only monospace |
| Right  | `SearchableSelect` (availableOptions) | `SearchableSelect` (availableOptions) |
| Delete | — | `X` icon → `updateChannelMapping(ref, '')` |

**Empty state:** Only shown when `unresolvedRefs.length === 0` AND `manualRows.length === 0`. If manual rows exist but no unresolved refs, the table renders normally (no empty state message).

## Add Mapping Flow

1. **Footer button** — dashed-border "Add mapping" button (same style as ConfigPanel's "Add config"). Hidden while the inline form is open.
2. **Inline form row** — appended at the bottom of the table when the button is clicked:
   - Left cell: text input, `autoFocus`, placeholder `ref_name`
   - Right cell: `SearchableSelect` with same `availableOptions` as other rows (empty initial value)
   - Far right: confirm `✓` (disabled when ref is empty or already exists) and cancel `✗`
3. **Confirm** — calls `updateChannelMapping(newRef.trim(), selectedChannel)`. New row appears immediately as a manual row. Form closes.
4. **Cancel / Escape** — form closes, nothing saved.
5. **Enter** in the ref input — if a channel is already selected, confirms; otherwise moves focus to the channel select.

**Duplicate prevention:** confirm is disabled if `newRef` already exists in `unresolvedRefs` or in `channelMappings`.

## Files Changed

- `src/components/ui/channel-mapping-panel.tsx` — all changes confined here

## Out of Scope

- Editing a manual row's ref name after creation (delete + re-add is sufficient)
- Deleting auto-detected rows (they are driven by SCXML content)
- Store / type changes
