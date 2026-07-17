import { describe, it, expect } from 'vitest';
import { isInitialState } from './layout-positioning';

function getAttribute(element: any, attrName: string): string | undefined {
  return element?.[`@_${attrName}`];
}
function getElements(parent: any, elementName: string): any {
  return parent?.[elementName];
}

describe('isInitialState', () => {
  it('returns true for a single-value root initial (existing behavior)', () => {
    const rootScxml = { '@_initial': 'A' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value root initial', () => {
    const rootScxml = { '@_initial': 'A B' };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }], ['C', { state: {} }]]);
    expect(isInitialState('A', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('B', '', rootScxml, registry as any, getAttribute, getElements)).toBe(true);
    expect(isInitialState('C', '', rootScxml, registry as any, getAttribute, getElements)).toBe(false);
  });

  it('returns true for every id listed in a multi-value nested-parent initial', () => {
    const parentState = { '@_initial': 'ChildA ChildB' };
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};
    expect(
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildB', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(true);
    expect(
      isInitialState('ChildC', '#Parent', rootScxml, registry as any, getAttribute, getElements)
    ).toBe(false);
  });
});
