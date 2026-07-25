import { describe, it, expect } from 'vitest';
import { SCXMLParser } from '@/lib/parsers/scxml-parser';
import { SCXMLToXStateConverter } from './scxml-to-xstate';
import { nodeDimensionCalculator } from '@/lib/layout/node-dimension-calculator';

async function convert(xml: string) {
  const parser = new SCXMLParser();
  const parseResult = parser.parse(xml);
  expect(parseResult.success).toBe(true);
  const converter = new SCXMLToXStateConverter();
  return converter.convertToReactFlow(parseResult.data!, xml);
}

describe('SCXMLToXStateConverter node width recalculation', () => {
  // A node's persisted viz:xywh width is a snapshot from whenever it was
  // last sized/positioned. It can go stale for reasons other than an actual
  // resize — renaming to a longer id, or the "Initial" badge appearing —
  // leaving it too narrow for what's now rendered inside. The converter
  // must always widen (never shrink) up to the calculated minimum for the
  // node's current label, regardless of whether isInitial is involved.
  it('expands a stored width that is now too narrow for a longer label', async () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"><state id="a_much_longer_state_name" viz:xywh="0,0,160,80"/></scxml>`;
    const { nodes } = await convert(xml);
    const node = nodes.find((n) => n.id === 'a_much_longer_state_name');
    expect(node).toBeDefined();

    const minRequired = nodeDimensionCalculator.calculateWidth('a_much_longer_state_name', 'simple', false);
    expect(node!.width).toBeGreaterThanOrEqual(minRequired);
    expect(node!.width).toBeGreaterThan(160);
  });

  it('still expands a stored width for the Initial badge (existing behavior preserved)', async () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" initial="a_state"><state id="a_state" viz:xywh="0,0,160,80"/></scxml>`;
    const { nodes } = await convert(xml);
    const node = nodes.find((n) => n.id === 'a_state');
    expect(node).toBeDefined();

    const minRequired = nodeDimensionCalculator.calculateWidth('a_state', 'simple', true);
    expect(node!.width).toBeGreaterThanOrEqual(minRequired);
    expect(node!.width).toBeGreaterThan(160);
  });

  it('leaves a stored width untouched when it already fits the current label', async () => {
    const xml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0"><state id="a" viz:xywh="0,0,400,80"/></scxml>`;
    const { nodes } = await convert(xml);
    const node = nodes.find((n) => n.id === 'a');
    expect(node).toBeDefined();
    expect(node!.width).toBe(400);
  });
});
