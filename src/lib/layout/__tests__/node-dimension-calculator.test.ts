/**
 * Tests for NodeDimensionCalculator.calculateDimensionsFromNode — specifically
 * that it forwards isInitial so an initial state's "Initial" badge gets the
 * extra width it needs. Run directly:
 *
 *   npx tsx src/lib/layout/__tests__/node-dimension-calculator.test.ts
 */
import assert from 'node:assert/strict';
import { nodeDimensionCalculator } from '../node-dimension-calculator';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('calculateDimensionsFromNode gives an initial state the same width as calling calculateWidth with isInitial=true', () => {
  const node = {
    id: 'validate_conf',
    data: { label: 'validate_conf', stateType: 'simple', isInitial: true },
  };
  const expectedWidth = nodeDimensionCalculator.calculateWidth(
    'validate_conf',
    'simple',
    true
  );
  const actual = nodeDimensionCalculator.calculateDimensionsFromNode(node);
  assert.equal(actual.width, expectedWidth);
});

test('calculateDimensionsFromNode does not add the Initial bonus for a non-initial state', () => {
  const node = {
    id: 'Off',
    data: { label: 'Off', stateType: 'simple', isInitial: false },
  };
  const expectedWidth = nodeDimensionCalculator.calculateWidth('Off', 'simple', false);
  const actual = nodeDimensionCalculator.calculateDimensionsFromNode(node);
  assert.equal(actual.width, expectedWidth);
});

console.log(`\n${passed} tests passed`);
