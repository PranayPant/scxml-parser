import { describe, it, expect } from 'vitest';
import type { SCXMLDocument } from '@/types/scxml';
import { updateTransitionTargets, removeStateFromDocument } from './scxml-manipulation-utils';

describe('updateTransitionTargets', () => {
  it('updates a single-value root initial (existing behavior)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2');
  });

  it('replaces only the matching token in a multi-value root initial', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    updateTransitionTargets(d, 'A', 'A2');
    expect(d.scxml['@_initial']).toBe('A2 B');
  });

  it('replaces only the matching token in a nested compound state initial', () => {
    const child = { '@_id': 'ChildA' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [child, { '@_id': 'ChildB' }] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    updateTransitionTargets(d, 'ChildA', 'ChildA2');
    expect((parent as any)['@_initial']).toBe('ChildA2 ChildB');
  });
});

describe('removeStateFromDocument', () => {
  it('drops the removed id from a multi-value root initial without touching the rest', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A B', state: [{ '@_id': 'A' }, { '@_id': 'B' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBe('B');
  });

  it('clears the root initial attribute entirely when the removed id was the only one (no forced fallback at root)', () => {
    const d: SCXMLDocument = { scxml: { '@_initial': 'A', state: [{ '@_id': 'A' }] } as any };
    removeStateFromDocument(d, 'A');
    expect(d.scxml['@_initial']).toBeUndefined();
  });

  it('auto-falls-back to a remaining sibling when a nested compound parent would otherwise lose its only initial', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });

  it('drops just the removed token from a nested compound parent that still has another initial marker', () => {
    const childA = { '@_id': 'ChildA' };
    const childB = { '@_id': 'ChildB' };
    const parent = { '@_id': 'Parent', '@_initial': 'ChildA ChildB', state: [childA, childB] };
    const d: SCXMLDocument = { scxml: { state: [parent] } as any };
    removeStateFromDocument(d, 'ChildA');
    expect((parent as any)['@_initial']).toBe('ChildB');
  });
});
