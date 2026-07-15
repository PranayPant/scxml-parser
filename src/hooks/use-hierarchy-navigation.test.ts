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

  it('makes regions non-draggable, since their position is always recomputed by arrangeRegions', () => {
    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const byId = new Map(result.current.filteredNodes.map((n) => [n.id, n]));
    expect(byId.get('motor_region')?.draggable).toBe(false);
    expect(byId.get('sensor_region')?.draggable).toBe(false);
    // The wrapper itself, and ordinary non-region nodes, are unaffected.
    expect(byId.get('running')?.draggable).not.toBe(false);
    expect(byId.get('idle')?.draggable).not.toBe(false);
  });

  it('flags regions as isParallelRegion so their own connection handles get suppressed', () => {
    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const byId = new Map(result.current.filteredNodes.map((n) => [n.id, n]));
    expect(byId.get('motor_region')?.data.isParallelRegion).toBe(true);
    expect(byId.get('sensor_region')?.data.isParallelRegion).toBe(true);
    // Only regions are flagged — the wrapper and ordinary nodes are not.
    expect(byId.get('running')?.data.isParallelRegion).not.toBe(true);
    expect(byId.get('idle')?.data.isParallelRegion).not.toBe(true);
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

  it('reveals a nested parallel\'s own regions once navigated into it, flattened because the container itself is not rendered', () => {
    useEditorStore.getState().navigateIntoState('running');
    useEditorStore.getState().navigateIntoState('inner');

    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const byId = new Map(result.current.filteredNodes.map((n) => [n.id, n]));
    // 'inner' (the container we navigated into) is not itself present in
    // filteredNodes, so its region must NOT carry a parentId/extent pointing
    // at it — that would crash ReactFlow (parent node not found). It should
    // be flattened: absolute-positioned using the same arrangeRegions box.
    expect(byId.get('sub_x')?.parentId).toBeUndefined();
    expect(byId.get('sub_x')?.extent).toBeUndefined();
    expect(byId.get('sub_x')?.position).toEqual({ x: 16, y: 48 });
  });

  it('never returns a node whose parentId points at a node absent from the result (would crash React Flow)', () => {
    useEditorStore.getState().navigateIntoState('running');
    useEditorStore.getState().navigateIntoState('inner');

    const { result } = renderHook(() =>
      useHierarchyNavigation({ allNodes, allEdges: [] })
    );

    const ids = new Set(result.current.filteredNodes.map((n) => n.id));
    for (const n of result.current.filteredNodes) {
      if (n.parentId) {
        expect(ids.has(n.parentId)).toBe(true);
      }
    }
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
