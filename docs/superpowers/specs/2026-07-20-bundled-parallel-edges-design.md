# Bundled Parallel Edges Design

## Problem

When many transitions share the same source/target node pair (e.g. several guard
conditions all leading `check_config` → `invalid_config`), the diagram spreads
them apart using a linear perpendicular offset computed in
`visual-diagram.tsx` (`(edgeIndex - (n-1)/2) * 60`) and rendered via
`getSmoothStepPath`'s `offset` param in `scxml-transition-edge.tsx`. Labels are
spread the same way (`* 25`).

This scales badly: at 4+ parallel edges the offsets grow past ±100-180px,
producing large stepped rectangular loops that sprawl across neighboring
nodes, with a same-size label box for each edge scattered along the spread —
exactly the clutter seen with `check_config`'s four guard transitions to
`invalid_config` and `init`/`off`'s several transitions in
`xml/test-state-machine.scxml`.

## Approach

Keep the current architecture (edge grouping by shared connection-point key,
per-edge `pathOptions`/`data` fields, the existing smoothstep/smartPath
routing) and add a threshold-gated bundling behavior on top of it, rather than
replacing the routing system.

- **1 edge in a group**: unchanged.
- **2 edges in a group**: unchanged — today's simple symmetric ±50 curve
  already reads cleanly at this size.
- **3+ edges in a group ("bundled")**: new behavior described below.

### Data layer (`visual-diagram.tsx`)

- Reuse the existing `edgeSlotKey` grouping (by source+handle / target+handle
  pair) unchanged.
- For bundled groups (size >= 3), do **not** set `offset` on the edges. Leaving
  it falsy makes every member fall through to the existing smartPath/smoothstep
  logic already used for ordinary single edges. Because all members share
  identical source/target/handles, they all compute the identical route and
  naturally render as one visual line/trunk — no new path-building code
  required, and obstacle avoidance (the existing A* smartPath fallback) keeps
  working for the shared trunk.
- Attach to each bundled edge's `data`:
  - `bundleGroupKey`: the group's slot key.
  - `bundleIndex`: position in a deterministic sort (by edge id) — fixes chip
    stacking order.
  - `bundleSize`: total count in the group.
  - `bundleActive`: whether the group is currently expanded (see below).
  - `bundleHasSelection`: whether one specific member of the group is
    currently selected/open in the `TransitionPanel`.
- New state: `hoveredBundleKey`. The existing `handleEdgeMouseEnter` /
  `handleEdgeMouseLeave` callbacks key off `edge.data.bundleGroupKey` when
  present (falling back to per-edge id when not bundled, as today) to set/clear
  it.
- A group counts as "active" (expanded) if `hoveredBundleKey` matches its key,
  **or** if the currently open `selectedEdgeForEdit` belongs to that group —
  so the expanded list stays visible while the user is editing one of its
  transitions in the `TransitionPanel`, not just while the mouse hovers it.

### Rendering (`scxml-transition-edge.tsx`)

- `isBundled = (data?.bundleSize ?? 0) >= 3`. All of the following is an
  additive branch — single edges and 2-edge groups keep rendering exactly as
  they do today.
- **Idle** (`isBundled && !bundleActive`): only the member with
  `bundleIndex === 0` draws a small round badge (showing the count, e.g. "4")
  at the shared path's midpoint (`labelX`/`labelY`, already computed by the
  existing path logic). Other members draw no label.
- **Active** (`isBundled && bundleActive`): every member draws its own compact
  chip (reusing the existing red/blue label-chip styling, narrower), stacked
  vertically to one side of the trunk's midpoint: roughly
  `x = labelX + 20`, `y = labelY + bundleIndex * 22`. Each chip is rendered
  inside that specific edge's own SVG wrapper, so clicking it already fires
  `onEdgeClick` for that exact transition (ReactFlow wraps each custom edge's
  full render output, including its label, in that edge's own click handler) —
  no new click plumbing needed.
- **Selection highlight**: while active and `bundleHasSelection` is true, the
  non-selected members dim their path (opacity ~0.35, thinner stroke) so the
  selected transition's path stands out against the shared trunk. While active
  but nothing is selected yet (just hovered), all paths render at normal
  weight.
- The existing full-text hover tooltip (500ms delay, shows `fullLabel`)
  continues to work per-edge, unaffected by bundling.

### Edge cases

- Self-loops: unaffected — the `isSelfLoop` branch is still checked first.
- Members with manually-dragged waypoints: unaffected — they keep rendering
  their own custom bezier path (visually "escaping" the shared trunk, which is
  fine since it's an explicit user customization), but still count toward the
  group's badge number and still get a chip when the group is active.
- Exactly 2 parallel edges: fully unchanged from current behavior.

## Testing

- Existing tests for edge offset/label positioning (if any) should continue
  to pass unchanged for 1- and 2-edge groups.
- Add coverage for the grouping/threshold math in `visual-diagram.tsx`
  (3+ edges get no `offset` and correct `bundleIndex`/`bundleSize`/
  `bundleGroupKey`; 1-2 edges unaffected).
- Manually verify against `xml/test-state-machine.scxml`'s
  `check_config` → `invalid_config` (4 guard transitions) and
  `check_config`/`init`/`off` groups: idle view shows one line + badge,
  hover/select expands to a readable chip list, clicking a chip opens the
  correct transition in the `TransitionPanel`.
