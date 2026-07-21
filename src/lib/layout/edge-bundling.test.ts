import { describe, it, expect } from 'vitest';
import { computeEdgeBundles, nodePairKey, BUNDLE_THRESHOLD } from './edge-bundling';

interface TestEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
  hasExplicitHandles?: boolean;
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = 'bottom',
  targetHandle: string | null = 'top',
  hasExplicitHandles = false
): TestEdge {
  return { id, source, sourceHandle, target, targetHandle, hasExplicitHandles };
}

describe('BUNDLE_THRESHOLD', () => {
  it('is 3', () => {
    expect(BUNDLE_THRESHOLD).toBe(3);
  });
});

describe('nodePairKey', () => {
  it('produces the same key regardless of direction', () => {
    expect(nodePairKey('A', 'B')).toBe(nodePairKey('B', 'A'));
  });

  it('produces different keys for different node pairs', () => {
    expect(nodePairKey('A', 'B')).not.toBe(nodePairKey('A', 'C'));
  });
});

describe('computeEdgeBundles', () => {
  it('assigns bundleSize 1 and isBundled false for a lone edge', () => {
    const edges = [edge('e1', 'A', 'B')];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')).toEqual({
      bundleGroupKey: nodePairKey('A', 'B'),
      bundleIndex: 0,
      bundleSize: 1,
      isBundled: false,
      canonicalSourceHandle: undefined,
      canonicalTargetHandle: undefined,
    });
  });

  it('groups edges between the same two nodes even when they land on different handles', () => {
    const edges = [
      edge('e1', 'A', 'B', 'left', 'right'),
      edge('e2', 'A', 'B', 'bottom', 'top'),
      edge('e3', 'A', 'B', 'right', 'left'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')!.bundleSize).toBe(3);
    expect(result.get('e1')!.isBundled).toBe(true);
    const groupKey = result.get('e1')!.bundleGroupKey;
    expect(result.get('e2')!.bundleGroupKey).toBe(groupKey);
    expect(result.get('e3')!.bundleGroupKey).toBe(groupKey);
  });

  it('forces every member of a multi-edge group onto the first member\'s handle pair', () => {
    const edges = [
      edge('e1', 'A', 'B', 'left', 'right'),
      edge('e2', 'A', 'B', 'bottom', 'top'),
      edge('e3', 'A', 'B', 'right', 'left'),
    ];
    const result = computeEdgeBundles(edges);
    for (const id of ['e1', 'e2', 'e3']) {
      expect(result.get(id)!.canonicalSourceHandle).toBe('left');
      expect(result.get(id)!.canonicalTargetHandle).toBe('right');
    }
  });

  it('prefers a member with hasExplicitHandles as the canonical reference, even if not first', () => {
    const edges = [
      edge('e1', 'A', 'B', 'left', 'right'),
      edge('e2', 'A', 'B', 'right', 'left', true), // user manually reconnected this one
      edge('e3', 'A', 'B', 'bottom', 'top'),
    ];
    const result = computeEdgeBundles(edges);
    for (const id of ['e1', 'e2', 'e3']) {
      expect(result.get(id)!.canonicalSourceHandle).toBe('right');
      expect(result.get(id)!.canonicalTargetHandle).toBe('left');
    }
  });

  it('resolves canonical handles per physical node for a mirrored reverse-direction edge', () => {
    const edges = [
      edge('e1', 'A', 'B', 'right', 'left'),
      edge('e2', 'B', 'A', 'left', 'right'),
      edge('e3', 'A', 'B', 'bottom', 'top'),
    ];
    const result = computeEdgeBundles(edges);
    // e1 is the reference: A's handle is 'right', B's handle is 'left'.
    expect(result.get('e1')!.canonicalSourceHandle).toBe('right');
    expect(result.get('e1')!.canonicalTargetHandle).toBe('left');
    // e2 goes B->A, so its canonical source (B) is 'left', target (A) is 'right'.
    expect(result.get('e2')!.canonicalSourceHandle).toBe('left');
    expect(result.get('e2')!.canonicalTargetHandle).toBe('right');
    // e3 goes A->B like e1, so it gets the same canonical pair as e1.
    expect(result.get('e3')!.canonicalSourceHandle).toBe('right');
    expect(result.get('e3')!.canonicalTargetHandle).toBe('left');
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

  it('excludes self-loops from bundling entirely', () => {
    const edges = [
      edge('e1', 'A', 'A'),
      edge('e2', 'A', 'A'),
      edge('e3', 'A', 'A'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.has('e1')).toBe(false);
    expect(result.has('e2')).toBe(false);
    expect(result.has('e3')).toBe(false);
  });

  it('groups an A->B and B->A pair together (2-edge legacy fan-out case)', () => {
    const edges = [
      edge('e1', 'A', 'B', 'right', 'left'),
      edge('e2', 'B', 'A', 'left', 'right'),
    ];
    const result = computeEdgeBundles(edges);
    expect(result.get('e1')!.bundleSize).toBe(2);
    expect(result.get('e1')!.isBundled).toBe(false);
    expect(result.get('e1')!.bundleGroupKey).toBe(
      result.get('e2')!.bundleGroupKey
    );
  });
});
