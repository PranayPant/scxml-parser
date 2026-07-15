# Parallel States Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `<parallel>` states in the visual SCXML editor always render their direct regions inline (side-by-side, N-agnostic, one level deep), and let users create parallel states and add regions through the UI — backed by a new Vitest + React Testing Library test suite.

**Architecture:** `useHierarchyNavigation`'s flat per-level node filter gets one addition: when a visible node is a `<parallel>`, its direct children are pulled in as real ReactFlow parent/child nodes (via `parentId` + `extent: 'parent'`) with positions computed by a new pure `arrangeRegions` layout function, instead of staying hidden until an extra drill-down click. A new `ParallelWrapperNode` component renders the boundary. Two new DOM-based commands (matching the existing `src/lib/commands/*` pattern) let users create a parallel state and add regions to one.

**Tech Stack:** Next.js 15 / React 19 / ReactFlow 11 / TypeScript, plus newly-added Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-14-parallel-states-phase2-design.md`

---

### Task 1: Add Vitest + React Testing Library

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `CLAUDE.md`
- Test: `src/lib/utils/state-id-extractor.test.ts`

- [ ] **Step 1: Install dependencies**

Run: `npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom`

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add the test script**

Modify `package.json` — add a `test` entry to `scripts`:

```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "deploy": "powershell -ExecutionPolicy Bypass -File deploy.ps1"
  },
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 4: Create the setup file**

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write the first real test (proves the harness works end-to-end)**

`getStateIdList` (`src/lib/utils/state-id-extractor.ts:223-225`) already exists and has zero coverage today. Create `src/lib/utils/state-id-extractor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getStateIdList } from './state-id-extractor';

describe('getStateIdList', () => {
  it('collects ids from state, parallel, and final elements anywhere in the document', () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
      <state id="idle"/>
      <parallel id="running">
        <state id="region_1"/>
        <state id="region_2"/>
      </parallel>
      <final id="done"/>
    </scxml>`;

    expect(getStateIdList(xml).sort()).toEqual(
      ['idle', 'running', 'region_1', 'region_2', 'done'].sort()
    );
  });

  it('returns an empty array for a document with no scxml root', () => {
    expect(getStateIdList('<notscxml/>')).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npx vitest run src/lib/utils/state-id-extractor.test.ts`
Expected: `2 passed`

- [ ] **Step 7: Update CLAUDE.md's testing section**

In `CLAUDE.md`, replace:

```
## Testing Approach

No specific test framework is configured. Manual testing through the development server is the current approach.
```

with:

```
## Testing Approach

Vitest + React Testing Library, configured in `vitest.config.ts`. Run `npm test` for a one-shot run or `npx vitest` to watch. Unit tests cover pure logic (layout, id generation, commands); component tests use React Testing Library. There is no e2e/browser automation — manual testing through the dev server remains how full visual/interactive behavior is verified.
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts CLAUDE.md src/lib/utils/state-id-extractor.test.ts
git commit -m "test: add Vitest + React Testing Library"
```

---

### Task 2: `arrangeRegions` pure layout function

**Files:**
- Create: `src/lib/layout/arrange-regions.ts`
- Test: `src/lib/layout/arrange-regions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/layout/arrange-regions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { arrangeRegions } from './arrange-regions';

const region = (id: string, width = 160, height = 80) => ({ id, width, height });

describe('arrangeRegions', () => {
  it('arranges 2 regions in a single row, splitting the wrapper width evenly', () => {
    const result = arrangeRegions([region('a'), region('b')]);

    expect(result.regionBoxes).toEqual([
      { id: 'a', x: 16, y: 48, width: 336, height: 80 },
      { id: 'b', x: 368, y: 48, width: 336, height: 80 },
    ]);
    expect(result.wrapperWidth).toBe(720);
    expect(result.wrapperHeight).toBe(144);
  });

  it('arranges 3 regions in a single row', () => {
    const result = arrangeRegions([region('a'), region('b'), region('c')]);

    expect(result.regionBoxes.map((b) => b.width)).toEqual([218, 218, 218]);
    expect(result.wrapperWidth).toBe(718);
    expect(result.wrapperHeight).toBe(144);
  });

  it('wraps 5 regions onto a second row once columns would drop below the minimum width', () => {
    const result = arrangeRegions([
      region('a'), region('b'), region('c'), region('d'), region('e'),
    ]);

    expect(result.regionBoxes[0]).toEqual({ id: 'a', x: 16, y: 48, width: 160, height: 80 });
    expect(result.regionBoxes[3]).toEqual({ id: 'd', x: 544, y: 48, width: 160, height: 80 });
    expect(result.regionBoxes[4]).toEqual({ id: 'e', x: 16, y: 144, width: 160, height: 80 });
    expect(result.wrapperWidth).toBe(720);
    expect(result.wrapperHeight).toBe(240);
  });

  it('is N-agnostic: no hardcoded branch per region count', () => {
    const twoRegionColumnWidth = arrangeRegions([region('a'), region('b')]).regionBoxes[0].width;
    const sevenRegions = arrangeRegions(
      Array.from({ length: 7 }, (_, i) => region(`r${i}`))
    );

    // 7 regions must still produce a valid, non-overlapping layout at the
    // minimum column width, wrapped across multiple rows — not a crash or
    // a fallback to some fixed 2/3/4-region special case.
    expect(sevenRegions.regionBoxes).toHaveLength(7);
    expect(sevenRegions.regionBoxes.every((b) => b.width >= 160)).toBe(true);
    expect(twoRegionColumnWidth).toBe(336);
  });

  it('returns a minimum-sized empty wrapper for zero regions', () => {
    const result = arrangeRegions([]);

    expect(result.regionBoxes).toEqual([]);
    expect(result.wrapperWidth).toBe(192);
    expect(result.wrapperHeight).toBe(144);
  });

  it('sizes each row to the tallest region in the whole set', () => {
    const result = arrangeRegions([region('a', 160, 80), region('b', 160, 140)]);

    expect(result.regionBoxes[0].height).toBe(140);
    expect(result.regionBoxes[1].height).toBe(140);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/layout/arrange-regions.test.ts`
Expected: FAIL — `Cannot find module './arrange-regions'`

- [ ] **Step 3: Implement `arrangeRegions`**

Create `src/lib/layout/arrange-regions.ts`:

```ts
/**
 * Arranges a <parallel> state's direct regions as equal-width columns inside
 * its wrapper, wrapping to additional rows once a column would drop below
 * MIN_COLUMN_WIDTH. N-agnostic: the same formula handles 1 region or 20.
 */

export interface RegionInput {
  id: string;
  width: number;
  height: number;
}

export interface RegionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionsArrangement {
  regionBoxes: RegionBox[];
  wrapperWidth: number;
  wrapperHeight: number;
}

const MIN_COLUMN_WIDTH = 160;
const MAX_WRAPPER_WIDTH = 720;
const GAP = 16;
const PADDING = 16;
const HEADER_HEIGHT = 32;
const MIN_ROW_HEIGHT = 80;

export function arrangeRegions(regions: RegionInput[]): RegionsArrangement {
  if (regions.length === 0) {
    return {
      regionBoxes: [],
      wrapperWidth: PADDING * 2 + MIN_COLUMN_WIDTH,
      wrapperHeight: HEADER_HEIGHT + PADDING * 2 + MIN_ROW_HEIGHT,
    };
  }

  const maxColumnsThatFit = Math.floor(
    (MAX_WRAPPER_WIDTH - PADDING * 2 + GAP) / (MIN_COLUMN_WIDTH + GAP)
  );
  const columns = Math.max(1, Math.min(regions.length, maxColumnsThatFit));
  const rows = Math.ceil(regions.length / columns);

  const columnWidth = Math.max(
    MIN_COLUMN_WIDTH,
    Math.floor((MAX_WRAPPER_WIDTH - PADDING * 2 - GAP * (columns - 1)) / columns)
  );
  const rowHeight = Math.max(MIN_ROW_HEIGHT, ...regions.map((r) => r.height));

  const regionBoxes: RegionBox[] = regions.map((region, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      id: region.id,
      x: PADDING + col * (columnWidth + GAP),
      y: HEADER_HEIGHT + PADDING + row * (rowHeight + GAP),
      width: columnWidth,
      height: rowHeight,
    };
  });

  const wrapperWidth = PADDING * 2 + columns * columnWidth + (columns - 1) * GAP;
  const wrapperHeight =
    HEADER_HEIGHT + PADDING * 2 + rows * rowHeight + (rows - 1) * GAP;

  return { regionBoxes, wrapperWidth, wrapperHeight };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/layout/arrange-regions.test.ts`
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/arrange-regions.ts src/lib/layout/arrange-regions.test.ts
git commit -m "feat(layout): add N-agnostic arrangeRegions for parallel-state wrappers"
```

---

### Task 3: Remove the dead region-arrangement code it replaces

**Files:**
- Modify: `src/lib/layout/container-layout-manager.ts:336-428`

- [ ] **Step 1: Confirm the methods are unused**

Run: `grep -rn "arrangeSingle\|arrangeTwo\|arrangeFew" src --include=*.ts --include=*.tsx`
Expected: only their own definitions inside `container-layout-manager.ts` — no call sites anywhere.

- [ ] **Step 2: Delete the three dead private methods**

In `src/lib/layout/container-layout-manager.ts`, delete the `arrangeSingle`, `arrangeTwo`, and `arrangeFew` methods (lines 336–428 as of this writing — the block starting at the `/** * Arrange a single child in the center */` comment through the end of `arrangeFew`'s closing brace, just before `arrangeWithForces`). `arrangeRegions` (Task 2) supersedes what these were for.

- [ ] **Step 3: Confirm nothing broke**

Run: `npx vitest run`
Expected: all existing tests still pass.

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/layout/container-layout-manager.ts
git commit -m "refactor(layout): remove dead arrangeSingle/arrangeTwo/arrangeFew"
```

---

### Task 4: Teach `useHierarchyNavigation` to render parallel regions inline

**Files:**
- Modify: `src/hooks/use-hierarchy-navigation.ts:1-88`
- Test: `src/hooks/use-hierarchy-navigation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/use-hierarchy-navigation.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Node } from 'reactflow';
import { useHierarchyNavigation } from './use-hierarchy-navigation';
import { useEditorStore } from '@/stores/editor-store';

const node = (
  id: string,
  stateType: 'simple' | 'compound' | 'parallel',
  parentId?: string
): Node => ({
  id,
  type: 'scxmlState',
  position: { x: 0, y: 0 },
  parentId,
  data: { label: id, stateType, width: 160, height: 80 },
});

const allNodes: Node[] = [
  node('idle', 'simple'),
  node('running', 'parallel'),
  node('motor_region', 'simple', 'running'),
  node('sensor_region', 'simple', 'running'),
  node('inner', 'parallel', 'running'),
  node('sub_x', 'simple', 'inner'),
];

beforeEach(() => {
  useEditorStore.getState().navigateToRoot();
});

describe('useHierarchyNavigation — parallel region inlining', () => {
  it('pulls a parallel state\'s direct regions in with parentId preserved, sized by arrangeRegions', () => {
    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const byId = new Map(result.current.filteredNodes.map((n) => [n.id, n]));

    expect(byId.get('idle')?.parentId).toBeUndefined();
    expect(byId.get('running')?.parentId).toBeUndefined();
    expect(byId.get('running')?.type).toBe('scxmlParallel');

    const motorRegion = byId.get('motor_region')!;
    expect(motorRegion.parentId).toBe('running');
    expect(motorRegion.extent).toBe('parent');
    expect(motorRegion.position).toEqual({ x: 16, y: 48 });
  });

  it('does not recurse: a nested parallel shown as a region stays collapsed (its own children are hidden)', () => {
    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const ids = result.current.filteredNodes.map((n) => n.id);

    expect(ids).toContain('inner');
    expect(ids).not.toContain('sub_x');

    const inner = result.current.filteredNodes.find((n) => n.id === 'inner')!;
    expect(inner.type).toBe('scxmlParallel');
    expect(inner.parentId).toBe('running');
  });

  it('reveals a nested parallel\'s own regions once navigated into it, applying the same rule again', () => {
    useEditorStore.getState().navigateIntoState('running');
    useEditorStore.getState().navigateIntoState('inner');

    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const byId = new Map(result.current.filteredNodes.map((n) => [n.id, n]));
    expect(byId.get('sub_x')?.parentId).toBe('inner');
    expect(byId.get('sub_x')?.extent).toBe('parent');
  });

  it('leaves non-parallel compound-state drill-down unaffected (regression)', () => {
    const compoundNodes: Node[] = [
      node('idle', 'compound'),
      node('idle_sub', 'simple', 'idle'),
    ];

    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes: compoundNodes, allEdges: [] })
    );

    const ids = result.current.filteredNodes.map((n) => n.id);
    expect(ids).toEqual(['idle']);
    expect(result.current.filteredNodes[0].type).not.toBe('scxmlParallel');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/use-hierarchy-navigation.test.ts`
Expected: FAIL — `motor_region`/`inner` missing from `filteredNodes` (current code only returns direct children of `currentParentId`, never a parallel's grandchildren-at-this-level).

- [ ] **Step 3: Rewrite the `filteredNodes` memo**

In `src/hooks/use-hierarchy-navigation.ts`, add the import:

```ts
import { arrangeRegions } from '@/lib/layout/arrange-regions';
```

Replace the existing `filteredNodes` memo (lines 42-88) with:

```ts
  // Filter nodes to only show current hierarchy level. A <parallel> state's
  // direct regions are always pulled in alongside it (kept parentId, real
  // ReactFlow parent/child containment) — everything else stays flat, one
  // level at a time, exactly as before. This does not recurse: a region that
  // is itself a parallel renders collapsed until the user navigates into it.
  const filteredNodes = useMemo(() => {
    if (allNodes.length === 0) return [];

    let visibleNodesList: Node[] = [];

    if (!hierarchyState.currentParentId) {
      visibleNodesList = allNodes.filter((node) => !node.parentId);
    } else {
      visibleNodesList = allNodes.filter(
        (node) => node.parentId === hierarchyState.currentParentId
      );
    }

    const enrich = (node: Node, keepParentId: boolean): Node => {
      const hasChildren = allNodes.some((n) => n.parentId === node.id);
      const isParallel = node.data.stateType === 'parallel';

      return {
        ...node,
        parentId: keepParentId ? node.parentId : undefined,
        type: isParallel ? 'scxmlParallel' : node.type,
        data: {
          ...node.data,
          hasChildren,
          isCompound: hasChildren,
          stateType: node.data.stateType || (hasChildren ? 'compound' : 'simple'),
          onNavigateInto: () => navigateIntoState(node.id),
        },
        style: {
          ...node.style,
          minWidth: 160,
          minHeight: 80,
        },
      };
    };

    const result: Node[] = [];

    for (const visibleNode of visibleNodesList) {
      const enrichedNode = enrich(visibleNode, false);

      if (visibleNode.data.stateType !== 'parallel') {
        result.push(enrichedNode);
        continue;
      }

      const regionSources = allNodes.filter(
        (n) => n.parentId === visibleNode.id
      );
      const { regionBoxes, wrapperWidth, wrapperHeight } = arrangeRegions(
        regionSources.map((r) => ({
          id: r.id,
          width: (r.data as any).width || 160,
          height: (r.data as any).height || 80,
        }))
      );

      enrichedNode.data = {
        ...enrichedNode.data,
        width: wrapperWidth,
        height: wrapperHeight,
      };
      enrichedNode.style = {
        ...enrichedNode.style,
        width: wrapperWidth,
        height: wrapperHeight,
      };
      result.push(enrichedNode);

      for (const regionSource of regionSources) {
        const box = regionBoxes.find((b) => b.id === regionSource.id)!;
        const enrichedRegion = enrich(regionSource, true);
        enrichedRegion.parentId = visibleNode.id;
        enrichedRegion.position = { x: box.x, y: box.y };
        (enrichedRegion as any).extent = 'parent';
        enrichedRegion.data = {
          ...enrichedRegion.data,
          width: box.width,
          height: box.height,
        };
        enrichedRegion.style = {
          ...enrichedRegion.style,
          width: box.width,
          height: box.height,
        };
        result.push(enrichedRegion);
      }
    }

    return result;
  }, [allNodes, hierarchyState.currentParentId, navigateIntoState]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/use-hierarchy-navigation.test.ts`
Expected: `4 passed`

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npx vitest run`
Expected: all tests pass (Task 1's, Task 2's, and these).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-hierarchy-navigation.ts src/hooks/use-hierarchy-navigation.test.ts
git commit -m "feat(diagram): render a parallel state's regions inline via arrangeRegions"
```

---

### Task 5: `ParallelWrapperNode` component

**Files:**
- Create: `src/components/diagram/nodes/parallel-wrapper-node.tsx`
- Test: `src/components/diagram/nodes/parallel-wrapper-node.test.tsx`
- Modify: `src/components/diagram/visual-diagram.tsx:50-51,74-78`

- [ ] **Step 1: Write the failing tests**

Create `src/components/diagram/nodes/parallel-wrapper-node.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParallelWrapperNode } from './parallel-wrapper-node';

const baseProps = {
  id: 'running',
  selected: false,
  type: 'scxmlParallel',
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  dragging: false,
} as any;

describe('ParallelWrapperNode', () => {
  it('renders its label and sizes itself to the given width/height', () => {
    render(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', width: 300, height: 200 }}
      />
    );

    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', onDelete }}
      />
    );

    fireEvent.click(screen.getByTitle('Delete parallel state'));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders without a delete button when onDelete is not provided', () => {
    render(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel' }}
      />
    );

    expect(screen.queryByTitle('Delete parallel state')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/diagram/nodes/parallel-wrapper-node.test.tsx`
Expected: FAIL — `Cannot find module './parallel-wrapper-node'`

- [ ] **Step 3: Implement `ParallelWrapperNode`**

Create `src/components/diagram/nodes/parallel-wrapper-node.tsx`, modeled on the existing `HistoryWrapperNode` (`src/components/diagram/nodes/history-wrapper-node.tsx`):

```tsx
'use client';

import React, { memo } from 'react';
import { type NodeProps } from 'reactflow';
import { Trash2 } from 'lucide-react';
import type { SCXMLStateNodeData } from './scxml-state-node';

export interface ParallelWrapperNodeProps
  extends NodeProps<SCXMLStateNodeData> {}

export const ParallelWrapperNode = memo<ParallelWrapperNodeProps>(
  ({ data }) => {
    const { label, onDelete } = data;
    const width = (data as any).width || 240;
    const height = (data as any).height || 160;

    return (
      <div
        style={{
          width,
          height,
          boxSizing: 'border-box',
          border: '2px dashed #7c3aed',
          borderRadius: '12px',
          backgroundColor: 'rgba(124, 58, 237, 0.05)',
          position: 'relative',
        }}
        className='parallel-wrapper-node group'
      >
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            left: '8px',
            backgroundColor: '#7c3aed',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 10,
          }}
        >
          <span>⚡</span>
          <span>{label}</span>
        </div>

        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className='absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-red-50 border border-gray-200 hover:border-red-300 rounded-lg shadow-sm transition-all duration-200 opacity-0 hover:opacity-100 group-hover:opacity-70 hover:!opacity-100 z-20 cursor-pointer'
            title='Delete parallel state'
          >
            <Trash2 className='h-4 w-4 text-gray-600 hover:text-red-600 transition-colors' />
          </button>
        )}
      </div>
    );
  }
);

ParallelWrapperNode.displayName = 'ParallelWrapperNode';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/diagram/nodes/parallel-wrapper-node.test.tsx`
Expected: `3 passed`

- [ ] **Step 5: Register the new node type**

In `src/components/diagram/visual-diagram.tsx`, add the import next to the existing `HistoryWrapperNode` import (line 50):

```ts
import { HistoryWrapperNode } from './nodes/history-wrapper-node';
import { ParallelWrapperNode } from './nodes/parallel-wrapper-node';
```

Add it to the `nodeTypes` map (line 74-78):

```ts
const nodeTypes: NodeTypes = {
  scxmlState: SCXMLStateNode,
  scxmlHistory: HistoryWrapperNode,
  scxmlParallel: ParallelWrapperNode,
  scxmlNote: StickyNoteNode,
};
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/diagram/nodes/parallel-wrapper-node.tsx src/components/diagram/nodes/parallel-wrapper-node.test.tsx src/components/diagram/visual-diagram.tsx
git commit -m "feat(diagram): add ParallelWrapperNode and register scxmlParallel node type"
```

---

### Task 6: `generateUniqueId` utility

**Files:**
- Create: `src/lib/utils/generate-unique-id.ts`
- Test: `src/lib/utils/generate-unique-id.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils/generate-unique-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateUniqueId } from './generate-unique-id';

describe('generateUniqueId', () => {
  it('returns "<prefix>_1" when nothing with that prefix exists yet', () => {
    expect(generateUniqueId('region', [])).toBe('region_1');
  });

  it('skips ids that already exist', () => {
    expect(generateUniqueId('region', ['region_1', 'region_2'])).toBe('region_3');
  });

  it('fills the first gap rather than only ever appending', () => {
    expect(generateUniqueId('region', ['region_1', 'region_3'])).toBe('region_2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/generate-unique-id.test.ts`
Expected: FAIL — `Cannot find module './generate-unique-id'`

- [ ] **Step 3: Implement it**

Create `src/lib/utils/generate-unique-id.ts`:

```ts
/**
 * Generates "<prefix>_N", picking the first N not already present.
 * Callers building multiple new ids in one command must add each
 * generated id to `existingIds` themselves before generating the next.
 */
export function generateUniqueId(
  prefix: string,
  existingIds: Iterable<string>
): string {
  const taken = new Set(existingIds);
  let counter = 1;
  let candidate = `${prefix}_${counter}`;
  while (taken.has(candidate)) {
    counter++;
    candidate = `${prefix}_${counter}`;
  }
  return candidate;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/generate-unique-id.test.ts`
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/generate-unique-id.ts src/lib/utils/generate-unique-id.test.ts
git commit -m "feat(utils): add generateUniqueId for region/parallel id generation"
```

---

### Task 7: `AddParallelStateCommand`

**Files:**
- Create: `src/lib/commands/add-parallel-state-command.ts`
- Test: `src/lib/commands/add-parallel-state-command.test.ts`
- Modify: `src/lib/commands/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/commands/add-parallel-state-command.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AddParallelStateCommand } from './add-parallel-state-command';

const baseXml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle"/>
</scxml>`;

describe('AddParallelStateCommand', () => {
  it('inserts a <parallel> with two default region <state> children at root level', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 100, 100, 300, 200
    );
    const result = command.execute(baseXml);

    expect(result.success).toBe(true);
    expect(result.newContent).toContain('<parallel id="running"');
    expect(result.newContent).toContain('<state id="region_1"');
    expect(result.newContent).toContain('<state id="region_2"');
    expect(result.affectedElements).toEqual(['running', 'region_1', 'region_2']);
  });

  it('nests the parallel under parentId when given', () => {
    const nestedXml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="outer">
      <state id="outer" initial="idle">
        <state id="idle"/>
      </state>
    </scxml>`;

    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200, 'outer'
    );
    const result = command.execute(nestedXml);

    expect(result.success).toBe(true);
    const parallelIndex = result.newContent.indexOf('<parallel id="running"');
    const outerCloseIndex = result.newContent.indexOf('</state>');
    expect(parallelIndex).toBeGreaterThan(-1);
    expect(parallelIndex).toBeLessThan(result.newContent.lastIndexOf('</state>'));
  });

  it('fails cleanly when parentId does not exist', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200, 'missing_parent'
    );
    const result = command.execute(baseXml);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing_parent');
  });

  it('undo removes the parallel and both regions', () => {
    const command = new AddParallelStateCommand(
      'running', 'region_1', 'region_2', 0, 0, 300, 200
    );
    const added = command.execute(baseXml);
    const undone = command.undo(added.newContent);

    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('running');
    expect(undone.newContent).not.toContain('region_1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/commands/add-parallel-state-command.test.ts`
Expected: FAIL — `Cannot find module './add-parallel-state-command'`

- [ ] **Step 3: Implement `AddParallelStateCommand`**

Create `src/lib/commands/add-parallel-state-command.ts`, following the same shape as `AddNoteCommand` (`src/lib/commands/note-commands.ts:17-74`):

```ts
import { BaseCommand, type CommandResult } from './base-command';

/**
 * AddParallelStateCommand
 *
 * Inserts a new <parallel> state with two default plain <state> regions
 * (no substates, so neither needs an `initial` attribute per the SCXML spec).
 * Placed at the document root, or under parentId when the caller has
 * navigated into a state.
 */
export class AddParallelStateCommand extends BaseCommand {
  constructor(
    private parallelId: string,
    private region1Id: string,
    private region2Id: string,
    private x: number,
    private y: number,
    private width: number,
    private height: number,
    private parentId?: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const parentElement = this.parentId
      ? this.findStateElement(doc, this.parentId)
      : doc.documentElement;
    if (!parentElement) {
      return this.createFailureResult(
        `Parent state element not found: ${this.parentId}`,
        scxmlContent
      );
    }

    this.ensureVizNamespace(doc);
    const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';

    const parallelElement = doc.createElementNS(ns, 'parallel');
    parallelElement.setAttribute('id', this.parallelId);
    parallelElement.setAttribute(
      'viz:xywh',
      `${Math.round(this.x)},${Math.round(this.y)},${Math.round(this.width)},${Math.round(this.height)}`
    );

    const region1 = doc.createElementNS(ns, 'state');
    region1.setAttribute('id', this.region1Id);
    const region2 = doc.createElementNS(ns, 'state');
    region2.setAttribute('id', this.region2Id);

    parallelElement.appendChild(region1);
    parallelElement.appendChild(region2);
    parentElement.appendChild(parallelElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [
      this.parallelId,
      this.region1Id,
      this.region2Id,
    ]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const parallelElement = this.findStateElement(doc, this.parallelId);
    if (!parallelElement) {
      return this.createFailureResult(
        `Parallel state element not found: ${this.parallelId}`,
        scxmlContent
      );
    }

    parallelElement.parentNode?.removeChild(parallelElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.parallelId]);
  }

  getDescription(): string {
    return `Add parallel state "${this.parallelId}"`;
  }
}
```

- [ ] **Step 4: Export it**

In `src/lib/commands/index.ts`, add:

```ts
export { AddParallelStateCommand } from './add-parallel-state-command';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/commands/add-parallel-state-command.test.ts`
Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/commands/add-parallel-state-command.ts src/lib/commands/add-parallel-state-command.test.ts src/lib/commands/index.ts
git commit -m "feat(commands): add AddParallelStateCommand"
```

---

### Task 8: `AddRegionCommand`

**Files:**
- Create: `src/lib/commands/add-region-command.ts`
- Test: `src/lib/commands/add-region-command.test.ts`
- Modify: `src/lib/commands/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/commands/add-region-command.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AddRegionCommand } from './add-region-command';

const xmlWithParallel = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="running">
  <parallel id="running">
    <state id="region_1"/>
    <state id="region_2"/>
  </parallel>
</scxml>`;

describe('AddRegionCommand', () => {
  it('appends a new plain <state> region under the target parallel', () => {
    const result = new AddRegionCommand('running', 'region_3').execute(xmlWithParallel);

    expect(result.success).toBe(true);
    expect(result.newContent).toContain('<state id="region_3"');
    expect(result.affectedElements).toEqual(['region_3']);
  });

  it('fails cleanly when the parallel does not exist', () => {
    const result = new AddRegionCommand('missing', 'region_3').execute(xmlWithParallel);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
  });

  it('undo removes just the added region, leaving the others intact', () => {
    const added = new AddRegionCommand('running', 'region_3').execute(xmlWithParallel);
    const undone = new AddRegionCommand('running', 'region_3').undo(added.newContent);

    expect(undone.success).toBe(true);
    expect(undone.newContent).not.toContain('region_3');
    expect(undone.newContent).toContain('region_1');
    expect(undone.newContent).toContain('region_2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/commands/add-region-command.test.ts`
Expected: FAIL — `Cannot find module './add-region-command'`

- [ ] **Step 3: Implement `AddRegionCommand`**

Create `src/lib/commands/add-region-command.ts`:

```ts
import { BaseCommand, type CommandResult } from './base-command';

/**
 * AddRegionCommand
 *
 * Appends one more plain <state> region under an existing <parallel>.
 * The new region has no substates, so no `initial` attribute is required.
 */
export class AddRegionCommand extends BaseCommand {
  constructor(
    private parallelId: string,
    private regionId: string
  ) {
    super();
  }

  execute(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const parallelElement = doc.querySelector(`parallel[id="${this.parallelId}"]`);
    if (!parallelElement) {
      return this.createFailureResult(
        `Parallel state element not found: ${this.parallelId}`,
        scxmlContent
      );
    }

    const ns = doc.documentElement.namespaceURI || 'http://www.w3.org/2005/07/scxml';
    const regionElement = doc.createElementNS(ns, 'state');
    regionElement.setAttribute('id', this.regionId);
    parallelElement.appendChild(regionElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.regionId]);
  }

  undo(scxmlContent: string): CommandResult {
    const { doc, error } = this.parseXML(scxmlContent);
    if (!doc) {
      return this.createFailureResult(
        error || 'Failed to parse XML',
        scxmlContent
      );
    }

    const regionElement = this.findStateElement(doc, this.regionId);
    if (!regionElement) {
      return this.createFailureResult(
        `Region element not found: ${this.regionId}`,
        scxmlContent
      );
    }

    regionElement.parentNode?.removeChild(regionElement);

    const newContent = this.serializeXML(doc);
    return this.createSuccessResult(newContent, [this.regionId]);
  }

  getDescription(): string {
    return `Add region "${this.regionId}" to parallel "${this.parallelId}"`;
  }
}
```

- [ ] **Step 4: Export it**

In `src/lib/commands/index.ts`, add:

```ts
export { AddRegionCommand } from './add-region-command';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/commands/add-region-command.test.ts`
Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/commands/add-region-command.ts src/lib/commands/add-region-command.test.ts src/lib/commands/index.ts
git commit -m "feat(commands): add AddRegionCommand"
```

---

### Task 9: Wire the toolbar "Add Parallel State" button and the wrapper's "+ Add Region" button

**Files:**
- Modify: `src/components/diagram/visual-diagram.tsx`

- [ ] **Step 1: Add imports**

Near the existing `scxml-manipulation-utils` import (`src/components/diagram/visual-diagram.tsx:10-15`), add:

```ts
import { getStateIdList } from '@/lib/utils/state-id-extractor';
import { generateUniqueId } from '@/lib/utils/generate-unique-id';
```

- [ ] **Step 2: Add `handleAddRegion` (used inside the per-node data enhancement closure, so it must be defined early — right after `handleNodeDelete`)**

In `src/components/diagram/visual-diagram.tsx`, right after `handleNodeDelete`'s closing (after line 468, before the `// ==================== NOTE HANDLERS ====================` comment on line 470), insert:

```ts
  // ==================== PARALLEL STATE HANDLERS ====================
  const handleAddRegion = React.useCallback(
    (parallelId: string) => {
      if (!onSCXMLChange || !scxmlContent) {
        console.error('Cannot add region: SCXML not available');
        return;
      }

      try {
        const existingIds = new Set(getStateIdList(scxmlContent));
        const regionId = generateUniqueId('region', existingIds);

        const { AddRegionCommand } = require('@/lib/commands');
        const result = new AddRegionCommand(parallelId, regionId).execute(
          scxmlContent
        );

        if (result.success) {
          onSCXMLChange(result.newContent, 'structure');
        } else {
          console.error('Failed to add region:', result.error);
        }
      } catch (error) {
        console.error('Failed to add region:', error);
      }
    },
    [scxmlContent, onSCXMLChange]
  );
```

- [ ] **Step 3: Wire `onAddRegion` into the per-node data enhancement**

In the same enhancement block where `onDelete: () => handleNodeDelete(node.id),` is set (`src/components/diagram/visual-diagram.tsx:1652`), add a sibling line:

```ts
              onDelete: () => handleNodeDelete(node.id),
              onAddRegion: () => handleAddRegion(node.id),
              onResize: (x: number, y: number, width: number, height: number) =>
                handleNodeResize(node.id, x, y, width, height),
```

Add `handleAddRegion` to that `useMemo`'s dependency array alongside `handleNodeDelete`/`handleNodeResize` (`src/components/diagram/visual-diagram.tsx:1869-1870`):

```ts
    handleNodeDelete,
    handleAddRegion,
    handleNodeResize,
```

- [ ] **Step 4: Consume `onAddRegion` in `ParallelWrapperNode`**

In `src/components/diagram/nodes/parallel-wrapper-node.tsx`, replace the existing `const { label, onDelete } = data;` line with:

```tsx
    const { label, onDelete, onAddRegion } = data as SCXMLStateNodeData & {
      onAddRegion?: () => void;
    };
```

```tsx
        {onAddRegion && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddRegion();
            }}
            className='absolute bottom-2 right-2 p-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg shadow-sm transition-all duration-200 opacity-0 hover:opacity-100 group-hover:opacity-70 hover:!opacity-100 z-20 cursor-pointer text-xs font-bold text-violet-700'
            title='Add region'
          >
            + Region
          </button>
        )}
```

Add a matching test to `src/components/diagram/nodes/parallel-wrapper-node.test.tsx`:

```tsx
  it('calls onAddRegion when the add-region button is clicked', () => {
    const onAddRegion = vi.fn();
    render(
      <ParallelWrapperNode
        {...baseProps}
        data={{ label: 'running', stateType: 'parallel', onAddRegion }}
      />
    );

    fireEvent.click(screen.getByTitle('Add region'));
    expect(onAddRegion).toHaveBeenCalledOnce();
  });
```

Run: `npx vitest run src/components/diagram/nodes/parallel-wrapper-node.test.tsx`
Expected: `4 passed`

- [ ] **Step 5: Add `handleAddParallelState` (toolbar button, defined near `handleAddRootState`)**

In `src/components/diagram/visual-diagram.tsx`, right after `handleAddRootState`'s closing (after its dependency array, before `handleAddNote`), insert:

```ts
  const handleAddParallelState = React.useCallback(() => {
    if (!onSCXMLChange || !scxmlContent) {
      console.error('Cannot add parallel state: SCXML not available');
      return;
    }

    try {
      const existingIds = new Set(getStateIdList(scxmlContent));
      const parallelId = generateUniqueId('parallel', existingIds);
      existingIds.add(parallelId);
      const region1Id = generateUniqueId('region', existingIds);
      existingIds.add(region1Id);
      const region2Id = generateUniqueId('region', existingIds);

      let x = 100;
      let y = 100;
      if (nodes.length > 0) {
        const maxX = Math.max(
          ...nodes.map((n) => n.position.x + (n.width || 160))
        );
        x = maxX + 100;
      }

      const dimensions = nodeDimensionCalculator.calculateDimensions(
        parallelId,
        'parallel'
      );

      const { AddParallelStateCommand } = require('@/lib/commands');
      const command = new AddParallelStateCommand(
        parallelId,
        region1Id,
        region2Id,
        x,
        y,
        dimensions.width,
        dimensions.height,
        currentParentId || undefined
      );
      const result = command.execute(scxmlContent);

      if (result.success) {
        onSCXMLChange(result.newContent, 'structure');

        setTimeout(() => {
          fitView({
            padding: 0.3,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 600,
          });
        }, 200);
      } else {
        console.error('Failed to add parallel state:', result.error);
      }
    } catch (error) {
      console.error('Failed to add parallel state:', error);
    }
  }, [scxmlContent, onSCXMLChange, nodes, fitView, currentParentId]);
```

- [ ] **Step 6: Add the toolbar button**

In the `<Controls>` block (`src/components/diagram/visual-diagram.tsx:2514-2522`), add a new `ControlButton` right after "Add State":

```tsx
              <ControlButton
                onClick={handleAddRootState}
                title='Add State'
                aria-label='Add State'
                className='text-muted hover:text-default'
              >
                S
              </ControlButton>
              <ControlButton
                onClick={handleAddParallelState}
                title='Add Parallel State'
                aria-label='Add Parallel State'
                className='text-muted hover:text-default'
              >
                P
              </ControlButton>
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/diagram/visual-diagram.tsx src/components/diagram/nodes/parallel-wrapper-node.tsx src/components/diagram/nodes/parallel-wrapper-node.test.tsx
git commit -m "feat(diagram): wire Add Parallel State toolbar button and per-wrapper Add Region button"
```

---

### Task 10: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Build and load a 2-region fixture**

Create a file with a root-level `<parallel id="running">` containing two plain `<state>` regions (e.g. `motor_region`, `sensor_region`) and load it in the editor's Code tab, then switch to the Visual tab.

Confirm: both regions render inline side-by-side inside a dashed wrapper labeled "running", with no extra click needed.

- [ ] **Step 3: Verify drill-down into a region still works**

Click into `motor_region`. Confirm the breadcrumb updates to `Root › running › motor_region` and shows that region's own children (or an empty canvas if it has none).

- [ ] **Step 4: Verify a 5-region parallel wraps to a second row**

Add 3 more regions (5 total) to the fixture. Confirm the wrapper shows 4 regions in the first row and 1 in the second, matching the `arrangeRegions` test expectations from Task 2.

- [ ] **Step 5: Verify nested parallel stays collapsed one level deep**

Make one region itself a `<parallel>` with its own two sub-regions. Confirm: at the outer level, the nested parallel shows as a plain collapsed wrapper (label + icon only, no sub-regions visible) until clicked into; clicking in reveals its own regions inline.

- [ ] **Step 6: Verify the new creation UI**

Click the toolbar "Add Parallel State" (`P`) button. Confirm a new parallel with two default regions (`region_1`, `region_2`) appears. Click "+ Region" on its wrapper and confirm a third region (`region_3`) appears. Delete one region and confirm the other two remain and the SCXML stays valid (check the Code tab).

- [ ] **Step 7: Regression-check ordinary compound states**

Load a fixture with a non-parallel compound state and confirm drill-down navigation behaves exactly as it did before this change (flat, one level at a time, no inline children).

- [ ] **Step 8: Verify a cross-region transition edge doesn't crash the canvas**

Add a `<transition>` in `motor_region` whose `target` is a state inside `sensor_region` (illegal per the SCXML spec, per the Phase 1 doc's §1.4 — intentionally testing the "not crash-prone" claim from the design spec's §3, not that it's a supported use case). Confirm the diagram still renders (the edge may look visually odd crossing the wrapper boundary) rather than throwing or blanking the canvas. Flagging this as invalid SCXML is Phase 3's job, not this one's.
