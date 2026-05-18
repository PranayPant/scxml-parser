# Transition Attribute Type Dropdown

**Date:** 2026-05-08  
**Status:** Approved

## Summary

Add a `<select>` dropdown to the "Edit Transition" overlay bar in the visual diagram, allowing users to switch a transition's attribute type between `event` and `cond` without touching the SCXML code editor directly.

## Problem

The edit bar currently shows a text input to edit a transition's label value, but the attribute type (`event` vs `cond`) is fixed at the moment the edge is clicked. Users cannot switch a transition from `event="foo"` to `cond="foo"` (or vice versa) through the visual diagram UI.

## Solution

Insert a native `<select>` element between the "Edit Transition:" label and the text input. The selected value reflects the current `editingField` (`'event'` or `'cond'`). Changing it swaps the pre-filled input value and updates `editingField` in `selectedEdgeForEdit` state. Pressing Enter saves the change using the existing command infrastructure, which already removes the opposite attribute in SCXML.

## Architecture

**Single-file change:** [`src/components/diagram/visual-diagram.tsx`](../../../src/components/diagram/visual-diagram.tsx)

No other files require modification because:
- `selectedEdgeForEdit` already stores `editingField: 'event' | 'cond'` and both `event` and `cond` attribute values separately.
- `UpdateTransitionCommand` already removes the opposite attribute when writing (e.g., removes `@_event` when saving with `editingField: 'cond'`).
- `handleTransitionLabelChange` already passes `editingField` through to the command.

## UI & Behavior

### Edit bar layout

Before:
```
Edit Transition:  [___input___]  Cancel
```

After:
```
Edit Transition:  [event ▼]  [___input___]  Cancel
```

### Dropdown change handler

When the select value changes from `'event'` to `'cond'` (or vice versa):
1. Set `editingField` to the new value.
2. Set `rawValue` to the edge's existing value for the new field (e.g., `edge.cond` when switching to `'cond'`), or empty string if none.

This pre-fills the input with whatever the edge already has for that attribute.

### Save (Enter key) — unchanged

`handleTransitionLabelChange` is called with the current `editingField`. `UpdateTransitionCommand` removes the old attribute and writes the new one. `onSCXMLChange` fires and the code editor updates (existing two-way sync).

### Always/eventless transitions

A transition with neither `event` nor `cond` opens the bar with `editingField: 'event'` and an empty `rawValue`. The user types a value and saves to add an `event` attribute. The dropdown starts on `event` by default.

### Placeholder — unchanged

The input placeholder already reads "Enter event" or "Enter condition" based on `editingField`. No change needed.

## Styling

The `<select>` uses Tailwind classes consistent with the existing input:
- `text-sm`, `border border-blue-300`, `rounded-md`, `focus:ring-2 focus:ring-blue-500`
- `px-2 py-1.5`, `bg-white`, `text-gray-800`

## Scope

- **In scope:** Dropdown to switch between `event` and `cond`; pre-filling input on switch; SCXML sync via existing command
- **Out of scope:** "always" as a third dropdown option; multi-attribute editing; inline condition builder
