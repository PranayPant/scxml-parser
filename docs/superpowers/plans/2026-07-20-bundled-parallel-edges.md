# Bundled Parallel Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy override:** the user has a standing preference of *no proactive
> commits during execution* (design docs, plans, or code — only when explicitly
> asked). Standard plan templates end each task with a `git commit` step; this
> plan replaces that with a "mark task complete" step instead. Do not run `git
> commit` while executing this plan unless the user explicitly asks for it.

**Goal:** Replace the linear perpendicular-offset fan-out used for 3+ parallel
transitions between the same node pair (which produces sprawling, overlapping
loops at high counts) with a collapsed-badge / expand-on-hover bundle, while
leaving today's 1- and 2-edge rendering untouched.

**Architecture:** Extract the edge-grouping/threshold math out of
`visual-diagram.tsx` into a small pure, unit-tested helper
(`src/lib/layout/edge-bundling.ts`). Wire its output into the existing
per-edge `data`/`pathOptions` construction in `visual-diagram.tsx` (no new
path-building code — bundled edges simply get no `offset`, so they fall
through to the pathfinding/smoothstep logic that already renders ordinary
single edges). Add a badge/chip-list overlay and per-edge dimming to
`scxml-transition-edge.tsx`, gated behind the new `isBundled`/`bundleActive`
flags. Full design rationale: `docs/superpowers/specs/2026-07-20-bundled-parallel-edges-design.md`.

**Tech Stack:** React 18, ReactFlow (`reactflow` v11), TypeScript, Vitest.

---

### Task 1: Edge-bundling helper (pure logic, unit tested)

**Files:**
- Create: `src/lib/layout/edge-bundling.ts`
- Test: `src/lib/layout/edge-bundling.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/layout/edge-bundling.test.ts
import { describe, it, expect } from 'vitest';
import { computeEdgeBundles, edgeSlotKey, BUNDLE_THRESHOLD } from './edge-bundling';

interface TestEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = 'bottom',
  targetHandle: string | null = 'top'
): TestEdge {
  return { id, source, sourceHandle, target, targetHandle };
}

describe('BUNDLE_THRESHOLD', () => {
  it('is 3', () => {
    expect(BUNDLE_THRESHOLD).toBe(3);
  });
});

describe('edgeSlotKey', () => {
  it('produces the same key regardless of which edge is source vs target when handles mirror', () => {
    const keyAB = edgeSlotKey('A', 'right', 'B', 'left');
    const keyBA = edgeSlotKey('B', 'left', 'A', 'right');
    expect(keyAB).toBe(keyBA);
  });

  it('produces different keys for edges landing on different handles', () => {
    const key1 = edgeSlotKey('A', 'right', 'B', 'left');
    const key2 = edgeSlotKey('A', 'bottom', 'B', 'top');
    expect(key1).not.toBe(key2);
  });
});

describe('computeEdgeBundles', () => {
  it('assigns bundleSize 1 and isBundled false for a lone edge', () => {
    const edges = [edge('e1', 'A', 'B')];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')).toEqual({
      bundleGroupKey: edgeSlotKey('A', 'bottom', 'B', 'top'),
      bundleIndex: 0,
      bundleSize: 1,
      isBundled: false,
    });
  });

  it('assigns bundleSize 2, isBundled false, preserving array order', () => {
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'A', 'B')];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')!.bundleIndex).toBe(0);
    expect(result.get('e2')!.bundleIndex).toBe(1);
    expect(result.get('e1')!.bundleSize).toBe(2);
    expect(result.get('e1')!.isBundled).toBe(false);
  });

  it('marks groups of 3 or more as bundled, with sequential indices in array order', () => {
    const edges = [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'B'),
      edge('e3', 'A', 'B'),
      edge('e4', 'A', 'B'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')!.bundleSize).toBe(4);
    expect(result.get('e1')!.isBundled).toBe(true);
    expect([
      result.get('e1')!.bundleIndex,
      result.get('e2')!.bundleIndex,
      result.get('e3')!.bundleIndex,
      result.get('e4')!.bundleIndex,
    ]).toEqual([0, 1, 2, 3]);
  });

  it('keeps unrelated node pairs in separate groups', () => {
    const edges = [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'B'),
      edge('e3', 'A', 'B'),
      edge('e4', 'C', 'D'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.get('e4')!.bundleSize).toBe(1);
    expect(result.get('e4')!.bundleGroupKey).not.toBe(
      result.get('e1')!.bundleGroupKey
    );
  });

  it('groups an A->B and B->A pair landing on mirrored handles together', () => {
    const edges = [
      edge('e1', 'A', 'B', 'right', 'left'),
      edge('e2', 'B', 'A', 'left', 'right'),
      edge('e3', 'A', 'B', 'right', 'left'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')!.bundleGroupKey).toBe(
      result.get('e2')!.bundleGroupKey
    );
    expect(result.get('e1')!.bundleSize).toBe(3);
    expect(result.get('e1')!.isBundled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/layout/edge-bundling.test.ts`
Expected: FAIL — `Cannot find module './edge-bundling'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/layout/edge-bundling.ts
/**
 * Pure grouping/threshold logic for parallel edges that share the same two
 * connection points (same source+handle / target+handle pair, in either
 * direction). Used by visual-diagram.tsx to decide, per edge, whether it
 * should render with the legacy 2-edge symmetric offset, as a bundled
 * (badge + expandable chip list) connector, or with no special treatment.
 */

export interface BundleEdgeLike {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}

export interface BundleAssignment {
  bundleGroupKey: string;
  bundleIndex: number;
  bundleSize: number;
  isBundled: boolean;
}

// Groups of this size or larger collapse into a badge + expandable chip list
// instead of the legacy per-edge offset fan-out.
export const BUNDLE_THRESHOLD = 3;

/**
 * Key for the physical pair of connection points (node+handle), not
 * direction — so an A->B / B->A pair that landed on the same mirrored
 * handle slot groups together, not just literal duplicate
 * (source, target, sourceHandle, targetHandle) tuples.
 */
export function edgeSlotKey(
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
  targetHandle: string | null | undefined
): string {
  return [`${source}:${sourceHandle}`, `${target}:${targetHandle}`]
    .sort()
    .join('|');
}

export function computeEdgeBundles(
  edges: BundleEdgeLike[]
): Map<string, BundleAssignment> {
  const groups = new Map<string, BundleEdgeLike[]>();
  for (const edge of edges) {
    const key = edgeSlotKey(
      edge.source,
      edge.sourceHandle,
      edge.target,
      edge.targetHandle
    );
    const group = groups.get(key);
    if (group) {
      group.push(edge);
    } else {
      groups.set(key, [edge]);
    }
  }

  const assignments = new Map<string, BundleAssignment>();
  for (const [key, group] of groups) {
    const bundleSize = group.length;
    const isBundled = bundleSize >= BUNDLE_THRESHOLD;
    group.forEach((edge, index) => {
      assignments.set(edge.id, {
        bundleGroupKey: key,
        bundleIndex: index,
        bundleSize,
        isBundled,
      });
    });
  }
  return assignments;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/layout/edge-bundling.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 2: Extract shared label-chip renderer + extend edge data type

No behavior change in this task — it only extracts existing inline JSX into a
reusable function and adds new (unused-so-far) optional fields to the data
type, so it's safe to verify by eyeballing that the diagram looks pixel-identical
to before.

**Files:**
- Modify: `src/components/diagram/edges/scxml-transition-edge.tsx`

- [ ] **Step 1: Extend `SCXMLTransitionEdgeData` with the new optional bundle fields**

In `src/components/diagram/edges/scxml-transition-edge.tsx`, find the
`SCXMLTransitionEdgeData` interface (starts at line 36) and add these fields
after `waypoints?: Waypoint[];` (before the "Handlers for waypoint editing"
comment):

```typescript
  waypoints?: Waypoint[]; // Waypoint control points for edge routing

  // Bundling fields (set by visual-diagram.tsx via computeEdgeBundles) —
  // present only when this edge shares its connection points with others.
  bundleGroupKey?: string;
  bundleIndex?: number;
  bundleSize?: number;
  isBundled?: boolean; // bundleSize >= BUNDLE_THRESHOLD (3)
  bundleActive?: boolean; // group is hovered, or one of its members is selected
  bundleHasSelection?: boolean; // one specific member of the group is selected
```

- [ ] **Step 2: Extract the existing label chip JSX into a standalone function**

Add this function above the `SCXMLTransitionEdge` component definition (right
after the `WaypointHandle` component, before `export const SCXMLTransitionEdge`):

```typescript
/**
 * Renders one label chip (colored rounded box with the transition's
 * event/condition/action summary) centered horizontally at (x, y).
 * Shared between the normal single-label case and the bundled chip-list case.
 */
function renderLabelChip(
  content: string,
  isCondition: boolean,
  x: number,
  y: number,
  width: number
) {
  return (
    <foreignObject
      width={width}
      height={26}
      x={x - width / 2}
      y={y - 13}
      style={{
        overflow: 'hidden',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          className='px-2 py-1 rounded text-xs font-semibold'
          style={{
            fontSize: '10px',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: 'fit-content',
            maxWidth: '100%',
            zIndex: 10000,
            backgroundColor: isCondition ? '#ef4444' : '#3b82f6',
            color: '#fff',
            opacity: 0.95,
            cursor: 'pointer',
            pointerEvents: 'auto',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
          }}
        >
          {content}
        </div>
      </div>
    </foreignObject>
  );
}
```

- [ ] **Step 3: Replace the inline label JSX with a call to `renderLabelChip`**

Find this block near the end of the component (around line 480-531):

```tsx
      {/* Render label - allow pointer events to pass through to waypoints */}
      {labelContent && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <foreignObject
            width={maxLabelWidth}
            height={26}
            x={labelX - maxLabelWidth / 2 + labelOffset.x + labelOffsetX}
            y={labelY - 13 + labelOffset.y + labelOffsetY}
            style={{
              overflow: 'hidden',
              zIndex: 10000,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                className='px-2 py-1 rounded text-xs font-semibold'
                style={{
                  fontSize: '10px',
                  lineHeight: '1.2',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: 'fit-content',
                  maxWidth: '100%',
                  zIndex: 10000,
                backgroundColor: condition ? '#ef4444' : '#3b82f6', // Red for conditional, blue for non-conditional
                  color: '#fff',
                  opacity: 0.95,
                  cursor: 'pointer',
                pointerEvents: 'auto', // Re-enable pointer events only on the label itself
                userSelect: 'none', // Prevent text selection
                WebkitUserSelect: 'none', // Safari/Chrome
                MozUserSelect: 'none', // Firefox
                msUserSelect: 'none', // IE/Edge
                }}
              >
                {labelContent}
              </div>
            </div>
          </foreignObject>
        </g>
      )}
```

Replace it with:

```tsx
      {/* Render label - allow pointer events to pass through to waypoints */}
      {labelContent && !isBundled && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          {renderLabelChip(
            labelContent,
            Boolean(condition),
            labelX + labelOffset.x + labelOffsetX,
            labelY + labelOffset.y + labelOffsetY,
            maxLabelWidth
          )}
        </g>
      )}
```

Note this references `isBundled`, which doesn't exist yet as a local — add it
now near the top of the component body, right after the existing
`const waypoints = data?.waypoints || [];` line:

```typescript
  const isBundled = data?.isBundled ?? false;
  const bundleActive = data?.bundleActive ?? false;
  const bundleHasSelection = data?.bundleHasSelection ?? false;
  const bundleIndex = data?.bundleIndex ?? 0;
  const bundleSize = data?.bundleSize ?? 1;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors, if any, are unaffected by this change).

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, open the app, load `xml/test-state-machine.scxml`.
Expected: every transition label looks pixel-identical to before this change
(nothing renders differently yet — `isBundled` is never `true` until Task 3
wires it up).

- [ ] **Step 6: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 3: Wire bundle grouping into `visual-diagram.tsx`

This replaces the inline offset math for 3+ parallel edges with "no offset"
(so they fall through to the existing smartPath/smoothstep routing and
overlap into one visual trunk) and attaches the new bundle fields. Hover/
selection activation is deferred to Task 4 — `bundleActive` is hardcoded
`false` here, so the visible effect of this task alone is: today's giant
stepped loops for 3+ edges disappear, replaced by a single line with a small
badge (rendered in Task 4... actually the badge needs Task 4's rendering
code too — see note below).

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx:1775-1893`

- [ ] **Step 1: Add the import**

Near the top of `src/components/diagram/visual-diagram.tsx`, alongside the
other `@/lib/layout/*` imports, add:

```typescript
import { computeEdgeBundles } from '@/lib/layout/edge-bundling';
```

- [ ] **Step 2: Replace the grouping/offset block**

Find this block (currently lines ~1775-1838, ending right before `// For
time-transition edges, reconstruct...`):

```tsx
          // Group by the physical pair of connection points (node+handle), not by
          // direction, so the curvature/offset fan-out below applies whenever two edges
          // share the same two anchor points — including an A→B / B→A pair that landed
          // on the same mirrored handle slot — not just literal duplicate (source,
          // target, sourceHandle, targetHandle) tuples. Edges distributed onto genuinely
          // different sides during handle assignment won't share a key and are left alone.
          const edgeSlotKey = (edge: Edge) =>
            [`${edge.source}:${edge.sourceHandle}`, `${edge.target}:${edge.targetHandle}`]
              .sort()
              .join('|');

          const edgeGroups = new Map<string, any[]>();
          edges.forEach((edge) => {
            const key = edgeSlotKey(edge);
            if (!edgeGroups.has(key)) {
              edgeGroups.set(key, []);
            }
            edgeGroups.get(key)!.push(edge);
          });


          const edgesWithMarkers = edges.map((edge) => {
            const edgeMetadata = metadataManager.getVisualMetadata(edge.id);
            const edgeKey = edgeSlotKey(edge);
            const parallelEdges = edgeGroups.get(edgeKey) || [];
            const edgeIndex = parallelEdges.findIndex((e) => e.id === edge.id);
            const hasParallelEdges = parallelEdges.length > 1;
            const hasWaypoints =
              edge.data?.waypoints && edge.data.waypoints.length > 0;

            const edgeType = 'scxmlTransition';

            let pathOptions: any = {};
            if (hasParallelEdges) {
              // Apply symmetrical offset for parallel edges
              // For 2 edges: first curves down (-offset), second curves up (+offset)
              // For 3+ edges: distribute symmetrically around center
              let offset: number;

              if (parallelEdges.length === 2) {
                // Simple case: one up, one down with same magnitude
                offset = edgeIndex === 0 ? -50 : 50;
              } else {
                // For 3+ edges: center the distribution
                offset = (edgeIndex - (parallelEdges.length - 1) / 2) * 60;
              }

              // The path bows perpendicular to its connection axis, so the label needs
              // to separate along that same perpendicular axis: a vertical connection
              // (top/bottom handles) bows left/right, so the label must offset in X;
              // a horizontal connection (left/right handles) bows up/down, so it must
              // offset in Y.
              const labelSpread = (edgeIndex - (parallelEdges.length - 1) / 2) * 25;
              const isVerticalConnection =
                edge.sourceHandle === 'top' || edge.sourceHandle === 'bottom';

              pathOptions = {
                offset,
                borderRadius: 20 + edgeIndex * 10,
                curvature: 0.25 + edgeIndex * 0.1,
                labelOffsetX: isVerticalConnection ? labelSpread : 0,
                labelOffsetY: isVerticalConnection ? 0 : labelSpread,
              };
            }
```

Replace it with:

```tsx
          // Grouping/threshold decisions live in edge-bundling.ts (unit
          // tested) — groups of 1 render plain, groups of 2 keep the legacy
          // symmetric offset fan-out, groups of 3+ are "bundled": no offset
          // (they fall through to the same smartPath/smoothstep routing as
          // an ordinary single edge and overlap into one visual trunk),
          // with the badge/chip-list overlay handled in SCXMLTransitionEdge.
          const bundleAssignments = computeEdgeBundles(edges);

          const edgesWithMarkers = edges.map((edge) => {
            const edgeMetadata = metadataManager.getVisualMetadata(edge.id);
            const assignment = bundleAssignments.get(edge.id)!;
            const { bundleGroupKey, bundleIndex, bundleSize, isBundled } = assignment;
            const hasWaypoints =
              edge.data?.waypoints && edge.data.waypoints.length > 0;

            const edgeType = 'scxmlTransition';

            let pathOptions: any = {};
            let bundleDataFields: Record<string, unknown> = {};
            if (isBundled) {
              bundleDataFields = {
                bundleGroupKey,
                bundleIndex,
                bundleSize,
                isBundled: true,
                // Wired up for real in the next task — hardcoded false here.
                bundleActive: false,
                bundleHasSelection: false,
              };
            } else if (bundleSize === 2) {
              // Apply symmetrical offset for parallel edges
              // For 2 edges: first curves down (-offset), second curves up (+offset)
              const offset = bundleIndex === 0 ? -50 : 50;

              // The path bows perpendicular to its connection axis, so the label needs
              // to separate along that same perpendicular axis: a vertical connection
              // (top/bottom handles) bows left/right, so the label must offset in X;
              // a horizontal connection (left/right handles) bows up/down, so it must
              // offset in Y.
              const labelSpread = (bundleIndex - (bundleSize - 1) / 2) * 25;
              const isVerticalConnection =
                edge.sourceHandle === 'top' || edge.sourceHandle === 'bottom';

              pathOptions = {
                offset,
                borderRadius: 20 + bundleIndex * 10,
                curvature: 0.25 + bundleIndex * 0.1,
                labelOffsetX: isVerticalConnection ? labelSpread : 0,
                labelOffsetY: isVerticalConnection ? 0 : labelSpread,
              };
            }
```

- [ ] **Step 3: Merge `bundleDataFields` into the edge's `data`**

A few lines further down in the same `edgesWithMarkers` map callback, find
the `edgeUpdate` object's `data:` block:

```tsx
            const edgeUpdate: any = {
              ...edge,
              type: edgeType,
              label: undefined,
              data: {
                ...edge.data,
                fullLabel,
                displayEvent,
                offset: pathOptions.offset,
                labelOffsetX: pathOptions.labelOffsetX,
                labelOffsetY: pathOptions.labelOffsetY,
                onWaypointDrag: handleWaypointDrag,
                onWaypointDragEnd: handleWaypointDragEnd,
                onWaypointDelete: handleWaypointDelete,
                onWaypointAdd: handleWaypointAdd,
              },
```

Add `...bundleDataFields,` right after `...edge.data,`:

```tsx
            const edgeUpdate: any = {
              ...edge,
              type: edgeType,
              label: undefined,
              data: {
                ...edge.data,
                ...bundleDataFields,
                fullLabel,
                displayEvent,
                offset: pathOptions.offset,
                labelOffsetX: pathOptions.labelOffsetX,
                labelOffsetY: pathOptions.labelOffsetY,
                onWaypointDrag: handleWaypointDrag,
                onWaypointDragEnd: handleWaypointDragEnd,
                onWaypointDelete: handleWaypointDelete,
                onWaypointAdd: handleWaypointAdd,
              },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, open `xml/test-state-machine.scxml`.
Expected:
- `check_config`'s 4 guard transitions to `invalid_config`, and the
  `off`/`init`/`check_config` group, now render as a single overlapping line
  each (no stepped rectangular loops) — because `isBundled` groups get no
  `offset`.
- No label shows yet on those bundled edges (Task 4 adds the badge) — that's
  expected for this step.
- Any node pair with exactly 2 transitions still fans out exactly as before.

- [ ] **Step 6: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 4: Render the idle collapsed badge for bundled groups

**Files:**
- Modify: `src/components/diagram/edges/scxml-transition-edge.tsx`

- [ ] **Step 1: Add the badge render block**

In the `SCXMLTransitionEdge` component, find the label block you edited in
Task 2:

```tsx
      {/* Render label - allow pointer events to pass through to waypoints */}
      {labelContent && !isBundled && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          {renderLabelChip(
            labelContent,
            Boolean(condition),
            labelX + labelOffset.x + labelOffsetX,
            labelY + labelOffset.y + labelOffsetY,
            maxLabelWidth
          )}
        </g>
      )}
```

Add this new block immediately after it:

```tsx

      {/* Bundled group, idle (not hovered/selected): one shared count badge,
          drawn only by the first member so it isn't repeated N times. */}
      {isBundled && !bundleActive && bundleIndex === 0 && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <circle
            cx={labelX}
            cy={labelY}
            r={9}
            fill='#64748b'
            stroke='#fff'
            strokeWidth={1.5}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={10}
            fontWeight={700}
            fill='#fff'
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {bundleSize}
          </text>
        </g>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual visual check**

Run: `npm run dev`, open `xml/test-state-machine.scxml`.
Expected: each bundled group (3+ transitions between the same node pair) now
shows a single line with a small gray circular badge at its midpoint showing
the transition count (e.g. "4" for `check_config` → `invalid_config`).
1- and 2-edge groups are unaffected.

- [ ] **Step 4: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 5: Track hover/selection to activate a bundle

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Add `hoveredBundleKey` state**

Find the existing `hoveredEdge` state declaration (used by the full-text
hover tooltip) and add a new state right after it:

```typescript
  const [hoveredBundleKey, setHoveredBundleKey] = React.useState<string | null>(null);
```

- [ ] **Step 2: Set/clear it from the existing mouse handlers**

Find `handleEdgeMouseEnter`:

```typescript
  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (edge.data?.fullLabel) {
        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // Set a delay of 500ms before showing the hover tooltip
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredEdge({
            id: edge.id,
            fullLabel: edge.data.fullLabel,
            x: event.clientX,
            y: event.clientY,
          });
```

Add a line to set the bundle key at the top of the callback body, before the
`if (edge.data?.fullLabel)` check (bundling activation shouldn't depend on
`fullLabel` being present):

```typescript
  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (edge.data?.bundleGroupKey) {
        setHoveredBundleKey(edge.data.bundleGroupKey);
      }

      if (edge.data?.fullLabel) {
        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }

        // Set a delay of 500ms before showing the hover tooltip
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredEdge({
            id: edge.id,
            fullLabel: edge.data.fullLabel,
            x: event.clientX,
            y: event.clientY,
          });
```

Find `handleEdgeMouseLeave`:

```typescript
  const handleEdgeMouseLeave = useCallback(() => {
    // Clear the timeout if mouse leaves before the delay expires
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredEdge(null);
  }, []);
```

Add the bundle-key clear:

```typescript
  const handleEdgeMouseLeave = useCallback(() => {
    // Clear the timeout if mouse leaves before the delay expires
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredEdge(null);
    setHoveredBundleKey(null);
  }, []);
```

- [ ] **Step 3: Derive `selectedBundleGroupKey` and use both to compute the real `bundleActive`/`bundleHasSelection`**

In the `edgesWithMarkers` block from Task 3, find:

```tsx
          const bundleAssignments = computeEdgeBundles(edges);

          const edgesWithMarkers = edges.map((edge) => {
```

Add the selected-group lookup right after `computeEdgeBundles(edges);`:

```tsx
          const bundleAssignments = computeEdgeBundles(edges);
          const selectedBundleGroupKey = selectedEdgeForEdit
            ? bundleAssignments.get(selectedEdgeForEdit.id)?.bundleGroupKey ?? null
            : null;

          const edgesWithMarkers = edges.map((edge) => {
```

Then find the hardcoded fields from Task 3:

```tsx
            if (isBundled) {
              bundleDataFields = {
                bundleGroupKey,
                bundleIndex,
                bundleSize,
                isBundled: true,
                // Wired up for real in the next task — hardcoded false here.
                bundleActive: false,
                bundleHasSelection: false,
              };
```

Replace with the real computation:

```tsx
            if (isBundled) {
              const bundleActive =
                hoveredBundleKey === bundleGroupKey ||
                selectedBundleGroupKey === bundleGroupKey;
              bundleDataFields = {
                bundleGroupKey,
                bundleIndex,
                bundleSize,
                isBundled: true,
                bundleActive,
                bundleHasSelection: selectedBundleGroupKey === bundleGroupKey,
              };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 6: Render the expanded chip list + dim non-selected paths

**Files:**
- Modify: `src/components/diagram/edges/scxml-transition-edge.tsx`

- [ ] **Step 1: Add the expanded chip-list render block**

Replace the badge block added in Task 4:

```tsx
      {/* Bundled group, idle (not hovered/selected): one shared count badge,
          drawn only by the first member so it isn't repeated N times. */}
      {isBundled && !bundleActive && bundleIndex === 0 && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <circle
            cx={labelX}
            cy={labelY}
            r={9}
            fill='#64748b'
            stroke='#fff'
            strokeWidth={1.5}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={10}
            fontWeight={700}
            fill='#fff'
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {bundleSize}
          </text>
        </g>
      )}
```

with:

```tsx
      {/* Bundled group, idle (not hovered/selected): one shared count badge,
          drawn only by the first member so it isn't repeated N times. */}
      {isBundled && !bundleActive && bundleIndex === 0 && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          <circle
            cx={labelX}
            cy={labelY}
            r={9}
            fill='#64748b'
            stroke='#fff'
            strokeWidth={1.5}
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor='middle'
            dominantBaseline='central'
            fontSize={10}
            fontWeight={700}
            fill='#fff'
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {bundleSize}
          </text>
        </g>
      )}

      {/* Bundled group, active (hovered or one member selected): every
          member draws its own chip, stacked vertically beside the shared
          trunk. Each chip lives inside this specific edge's own SVG
          wrapper, so clicking it fires onEdgeClick for this exact edge. */}
      {isBundled && bundleActive && labelContent && (
        <g style={{ pointerEvents: 'none', zIndex: 10000 }}>
          {renderLabelChip(
            labelContent,
            Boolean(condition),
            labelX + 20 + maxLabelWidth / 2,
            labelY + bundleIndex * 22,
            maxLabelWidth
          )}
        </g>
      )}
```

- [ ] **Step 2: Dim non-selected paths when the group is active and one member is selected**

Find the `BaseEdge` call:

```tsx
      <BaseEdge
        path={edgePath}
        markerEnd={`url('#${id}')`}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: strokeWidth,
          strokeDasharray: getStrokeStyle() === 'dashed' ? '8,4' : 'none',
        }}
      />
```

Add a dimming computation right above the `return (` statement (near the
existing `const edgeColor = getEdgeColor();` line) and use it in the style:

```typescript
  const isDimmedSibling =
    isBundled && bundleActive && bundleHasSelection && !selected;
```

```tsx
      <BaseEdge
        path={edgePath}
        markerEnd={`url('#${id}')`}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: isDimmedSibling ? 1.5 : strokeWidth,
          strokeOpacity: isDimmedSibling ? 0.35 : 1,
          strokeDasharray: getStrokeStyle() === 'dashed' ? '8,4' : 'none',
        }}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open `xml/test-state-machine.scxml`.
Expected:
- Hovering the trunk of a bundled group (e.g. `check_config` → `invalid_config`)
  expands the badge into a vertical stack of 4 label chips.
- Clicking a chip opens the `TransitionPanel` for that exact transition, and
  its path renders at full brightness while the other 3 dim.
- Moving the mouse away while a chip's transition is selected/being edited
  keeps the list expanded (doesn't collapse back to the badge).
- Clicking empty canvas (`onPaneClick`) clears the selection and the group
  collapses back to the badge.

- [ ] **Step 5: Mark task complete** (no commit — see policy note at top of plan)

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 8 new `edge-bundling.test.ts` cases.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this feature.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new lint errors in the two modified files.

- [ ] **Step 4: End-to-end manual check against the spec's scenarios**

Run: `npm run dev`, open `xml/test-state-machine.scxml`, and confirm every
item from the design doc's Testing section:
- `check_config` → `invalid_config` (4 guard transitions): idle badge, hover
  expands to 4 readable chips, each opens the right transition.
- The `check_config`/`init`/`off` transitions and any exactly-2 groups (e.g.
  `Pump_Low_Pressure_Alert`'s internal `vector` transition alongside its
  guard transition, if it forms a pair) look identical to current behavior.
- Self-loops (e.g. the `vector` internal transitions inside
  `Pump_Low_Pressure_Alert` / `Pump_High_Pressure_Alert`) are unaffected.
- A manually-waypointed transition inside a bundled group still renders its
  own custom bezier and still gets a chip when the group is active.

- [ ] **Step 5: Mark task complete** (no commit — see policy note at top of plan)
