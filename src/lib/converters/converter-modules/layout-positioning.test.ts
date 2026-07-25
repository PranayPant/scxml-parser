import { describe, it, expect } from 'vitest';
import { isInitialState } from './layout-positioning';
import { getAttribute as realGetAttribute, getElements as realGetElements } from './visual-metadata';

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

  it('does not throw for a compound state using the <initial> child-element form (no @_initial attribute), using the real getAttribute helper', () => {
    // Reproduces the reported crash: getAttribute('initial')'s unprefixed
    // fallback returns the parsed <initial> child-element object (not a
    // string) when only that form is used, since 'initial' the attribute and
    // 'initial' the child element share the same unprefixed property key.
    const parentState = {
      initial: { transition: { '@_target': 'ChildB' } },
    };
    const registry = new Map([['Parent', { state: parentState }]]);
    const rootScxml = {};

    expect(() =>
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).not.toThrow();

    // The <initial> element's own transition target is still recognized.
    expect(
      isInitialState('ChildB', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
    expect(
      isInitialState('ChildA', '#Parent', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(false);
  });

  it('does not throw for a root using the <initial> child-element form (no @_initial attribute), using the real getAttribute helper', () => {
    const rootScxml = {
      initial: { transition: { '@_target': 'B' } },
    };
    const registry = new Map([['A', { state: {} }], ['B', { state: {} }]]);

    expect(() =>
      isInitialState('A', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).not.toThrow();

    expect(
      isInitialState('B', '', rootScxml, registry as any, realGetAttribute, realGetElements)
    ).toBe(true);
  });
});
